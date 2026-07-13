import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { writeAudit } from "../audit.js";
import { withTenant } from "../db.js";
import { enqueueFhirSync } from "../fhir-sync.js";

const startInput = z.object({
  unitId: z.uuid(),
  patientId: z.uuid(),
  appointmentId: z.uuid().optional(),
  templateKey: z.string().trim().min(2).max(100).default("general-clinical-note"),
  templateVersion: z.number().int().min(1).default(1),
});

const draftInput = z.object({
  content: z.record(z.string(), z.unknown()),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

const finalizeInput = z.object({
  content: z.record(z.string(), z.unknown()),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

const addendumInput = z.object({
  reason: z.string().trim().min(10).max(1000),
  content: z.record(z.string(), z.unknown()),
});

export async function recordRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.post("/encounters", { preHandler: [requirePermission("records.write")] }, async (request, reply) => {
    const input = startInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      if (input.appointmentId) {
        const appointment = await client.query<{
          status: string;
          encounter_id: string | null;
          note_id: string | null;
          note_updated_at: Date | null;
          note_content: Record<string, unknown> | null;
          note_status: string | null;
        }>(
          `SELECT a.status, e.id AS encounter_id, n.id AS note_id,
                  n.updated_at AS note_updated_at, n.content AS note_content,
                  n.status AS note_status
             FROM appointments a
             LEFT JOIN encounters e ON e.tenant_id = a.tenant_id AND e.appointment_id = a.id
             LEFT JOIN clinical_notes n ON n.tenant_id = e.tenant_id AND n.encounter_id = e.id
            WHERE a.tenant_id = $1 AND a.id = $2 AND a.patient_id = $3
            FOR UPDATE OF a`,
          [request.auth.tenantId, input.appointmentId, input.patientId],
        );
        const current = appointment.rows[0];
        if (!current) return reply.code(404).send({ error: "appointment_not_found" });
        if (current.encounter_id && current.note_id && current.note_updated_at) {
          if (current.note_status === "draft") {
            return reply.send({
              encounterId: current.encounter_id,
              resumed: true,
              note: { id: current.note_id, updated_at: current.note_updated_at, content: current.note_content ?? {} },
            });
          }
          return reply.code(409).send({ error: "appointment_already_completed" });
        }
        if (!["scheduled", "confirmed", "waiting"].includes(current.status)) {
          return reply.code(409).send({ error: "appointment_not_startable", status: current.status });
        }
      }
      const encounter = await client.query<{ id: string }>(
        `INSERT INTO encounters
          (tenant_id, unit_id, patient_id, appointment_id, professional_user_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [request.auth.tenantId, input.unitId, input.patientId, input.appointmentId ?? null, request.auth.userId],
      );
      const encounterId = encounter.rows[0]!.id;
      const note = await client.query<{ id: string; updated_at: Date }>(
        `INSERT INTO clinical_notes
          (tenant_id, encounter_id, patient_id, author_user_id, template_key, template_version)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, updated_at`,
        [request.auth.tenantId, encounterId, input.patientId, request.auth.userId, input.templateKey, input.templateVersion],
      );
      if (input.appointmentId) {
        await client.query(
          "UPDATE appointments SET status = 'in_progress', updated_by = $1 WHERE tenant_id = $2 AND id = $3",
          [request.auth.userId, request.auth.tenantId, input.appointmentId],
        );
      }
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "encounter.start",
        resourceType: "encounter",
        resourceId: encounterId,
        requestId: request.id,
        ip: request.ip,
      });
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "patient", input.patientId);
      if (input.appointmentId) await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "appointment", input.appointmentId);
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "encounter", encounterId);
      return reply.code(201).send({ encounterId, note: note.rows[0] });
    });
  });

  app.put("/notes/:id/draft", { preHandler: [requirePermission("records.write")] }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = draftInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const result = await client.query<{ updated_at: Date }>(
        `UPDATE clinical_notes
            SET content = $1
          WHERE tenant_id = $2 AND id = $3 AND status = 'draft'
            AND date_trunc('milliseconds', updated_at) = $4::timestamptz
          RETURNING updated_at`,
        [input.content, request.auth.tenantId, id, input.expectedUpdatedAt],
      );
      const row = result.rows[0];
      if (!row) return reply.code(409).send({ error: "draft_version_conflict" });
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "clinical_note.draft_update",
        resourceType: "clinical_note",
        resourceId: id,
        requestId: request.id,
        ip: request.ip,
      });
      const encounter = await client.query<{ encounter_id:string }>("SELECT encounter_id FROM clinical_notes WHERE tenant_id=$1 AND id=$2", [request.auth.tenantId, id]);
      if (encounter.rows[0]) await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "encounter", encounter.rows[0].encounter_id);
      return { id, updatedAt: row.updated_at };
    });
  });

  app.post("/notes/:id/finalize", { preHandler: [requirePermission("records.finalize")] }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = finalizeInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const result = await client.query<{ encounter_id: string; patient_id: string; content_hash: string; finalized_at: Date }>(
        `UPDATE clinical_notes
            SET content = $3, status = 'finalized', finalized_by = $1, finalized_at = now(),
                content_hash = encode(digest(convert_to($3::jsonb::text, 'UTF8'), 'sha256'), 'hex')
          WHERE tenant_id = $2 AND id = $4 AND status = 'draft' AND author_user_id = $1
            AND date_trunc('milliseconds', updated_at) = $5::timestamptz
          RETURNING encounter_id, patient_id, content_hash, finalized_at`,
        [request.auth.userId, request.auth.tenantId, input.content, id, input.expectedUpdatedAt],
      );
      const note = result.rows[0];
      if (!note) return reply.code(409).send({ error: "note_not_finalizable" });
      await client.query(
        "UPDATE encounters SET status = 'completed', completed_at = now() WHERE tenant_id = $1 AND id = $2",
        [request.auth.tenantId, note.encounter_id],
      );
      await client.query(
        `UPDATE appointments a SET status = 'completed', updated_by = $1
          FROM encounters e
         WHERE e.tenant_id = $2 AND e.id = $3 AND a.tenant_id = e.tenant_id
           AND a.id = e.appointment_id AND a.status = 'in_progress'`,
        [request.auth.userId, request.auth.tenantId, note.encounter_id],
      );
      const billing=await client.query<{appointment_id:string;patient_id:string;professional_user_id:string;type:string;price_snapshot:string;professional_amount_snapshot:string;automatic_receivable:boolean}>(`SELECT a.id AS appointment_id,a.patient_id,a.professional_user_id,a.type,a.price_snapshot,a.professional_amount_snapshot,coalesce(p.automatic_receivable,false) AS automatic_receivable
        FROM encounters e JOIN appointments a ON a.tenant_id=e.tenant_id AND a.id=e.appointment_id
        LEFT JOIN procedures p ON p.tenant_id=a.tenant_id AND p.id=a.procedure_id
        WHERE e.tenant_id=$1 AND e.id=$2`,[request.auth.tenantId,note.encounter_id]);
      const charge=billing.rows[0];let receivableCreated=false;
      if(charge&&charge.automatic_receivable&&Number(charge.price_snapshot)>0){
        const amount=Number(charge.price_snapshot);const commission=Number(charge.professional_amount_snapshot);
        const receivable=await client.query(`INSERT INTO financial_transactions(tenant_id,patient_id,appointment_id,professional_user_id,kind,description,category,account_name,amount,due_date,status,commission_rate_snapshot,commission_amount,commission_status,created_by,updated_by)
          SELECT $1,$2,$3,$4,'income',$5,'Atendimentos','Caixa principal',$6::numeric,current_date,'pending',$7::numeric,$8::numeric,CASE WHEN $8::numeric>0::numeric THEN 'pending' ELSE 'not_applicable' END,$9,$9
          WHERE NOT EXISTS(SELECT 1 FROM financial_transactions WHERE tenant_id=$1 AND appointment_id=$3 AND kind='income' AND status<>'cancelled') RETURNING id`,[request.auth.tenantId,charge.patient_id,charge.appointment_id,charge.professional_user_id,charge.type,amount,0,commission,request.auth.userId]);receivableCreated=Boolean(receivable.rows[0]);
      }
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "clinical_note.finalize",
        resourceType: "clinical_note",
        resourceId: id,
        requestId: request.id,
        ip: request.ip,
        after: { contentHash: note.content_hash, finalizedAt: note.finalized_at },
      });
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "patient", note.patient_id);
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "encounter", note.encounter_id);
      if (charge?.appointment_id) await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "appointment", charge.appointment_id);
      return { id, contentHash: note.content_hash, finalizedAt: note.finalized_at, receivableCreated };
    });
  });

  app.post("/notes/:id/addenda", { preHandler: [requirePermission("records.addendum")] }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = addendumInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const note = await client.query(
        "SELECT id FROM clinical_notes WHERE tenant_id = $1 AND id = $2 AND status = 'finalized'",
        [request.auth.tenantId, id],
      );
      if (!note.rows[0]) return reply.code(409).send({ error: "addendum_requires_finalized_note" });
      const result = await client.query<{ id: string; content_hash: string; created_at: Date }>(
        `INSERT INTO clinical_note_addenda
          (tenant_id, note_id, author_user_id, reason, content, content_hash)
         VALUES ($1,$2,$3,$4,$5,encode(digest(convert_to($5::jsonb::text, 'UTF8'), 'sha256'), 'hex'))
         RETURNING id, content_hash, created_at`,
        [request.auth.tenantId, id, request.auth.userId, input.reason, input.content],
      );
      const addendum = result.rows[0]!;
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "clinical_note.addendum_create",
        resourceType: "clinical_note_addendum",
        resourceId: addendum.id,
        requestId: request.id,
        ip: request.ip,
        after: { noteId: id, contentHash: addendum.content_hash },
      });
      return reply.code(201).send(addendum);
    });
  });

  app.get("/patients/:patientId/timeline", { preHandler: [requirePermission("records.read")] }, async (request) => {
    const { patientId } = z.object({ patientId: z.uuid() }).parse(request.params);
    return withTenant(request.auth, async (client) => {
      const result = await client.query(
        `SELECT e.id AS encounter_id, e.started_at, e.completed_at, e.status,
                n.id AS note_id, n.template_key, n.template_version, n.content,
                n.status AS note_status, n.content_hash, n.finalized_at, u.name AS author_name
           FROM encounters e
           JOIN clinical_notes n ON n.tenant_id = e.tenant_id AND n.encounter_id = e.id
           JOIN users u ON u.id = n.author_user_id
          WHERE e.tenant_id = $1 AND e.patient_id = $2
          ORDER BY e.started_at DESC`,
        [request.auth.tenantId, patientId],
      );
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "patient.timeline_read",
        resourceType: "patient",
        resourceId: patientId,
        requestId: request.id,
        ip: request.ip,
      });
      return { items: result.rows };
    });
  });
}
