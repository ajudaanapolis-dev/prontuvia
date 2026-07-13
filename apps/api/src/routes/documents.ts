import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { writeAudit } from "../audit.js";
import { withTenant } from "../db.js";
import { enqueueFhirSync } from "../fhir-sync.js";

const categories = ["prescription", "exam_request", "certificate", "declaration", "report", "referral"] as const;

const documentInput = z.object({
  patientId: z.uuid(),
  encounterId: z.uuid().optional(),
  category: z.enum(categories),
  title: z.string().trim().min(2).max(180),
  content: z.object({
    body: z.string().trim().min(2).max(20_000),
    cid: z.string().trim().max(20).optional(),
    notes: z.string().trim().max(5_000).optional(),
  }),
});

const listQuery = z.object({
  patientId: z.uuid(),
  category: z.enum(categories).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", { preHandler: [requirePermission("documents.read")] }, async (request) => {
    const query = listQuery.parse(request.query);
    return withTenant(request.auth, async (client) => {
      const result = await client.query(
        `SELECT d.id, d.patient_id, d.encounter_id, d.category, d.title, d.content,
                d.content_hash, d.finalized_at, u.name AS author_name
           FROM clinical_document_records d
           JOIN users u ON u.id = d.author_user_id
          WHERE d.tenant_id = $1 AND d.patient_id = $2
            AND ($3::text IS NULL OR d.category = $3)
          ORDER BY d.finalized_at DESC
          LIMIT $4`,
        [request.auth.tenantId, query.patientId, query.category ?? null, query.limit],
      );
      return { items: result.rows };
    });
  });

  app.get("/:id", { preHandler: [requirePermission("documents.read")] }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    return withTenant(request.auth, async (client) => {
      const result = await client.query(
        `SELECT d.id, d.patient_id, d.encounter_id, d.category, d.title, d.content,
                d.content_hash, d.finalized_at, u.name AS author_name
           FROM clinical_document_records d
           JOIN users u ON u.id = d.author_user_id
          WHERE d.tenant_id = $1 AND d.id = $2`,
        [request.auth.tenantId, id],
      );
      const document = result.rows[0];
      if (!document) return reply.code(404).send({ error: "clinical_document_not_found" });
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "clinical_document.read",
        resourceType: "clinical_document",
        resourceId: id,
        requestId: request.id,
        ip: request.ip,
      });
      return document;
    });
  });

  app.post("/", { preHandler: [requirePermission("documents.write")] }, async (request, reply) => {
    const input = documentInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const patient = await client.query(
        "SELECT id FROM patients WHERE tenant_id = $1 AND id = $2 AND status = 'active'",
        [request.auth.tenantId, input.patientId],
      );
      if (!patient.rows[0]) return reply.code(404).send({ error: "patient_not_found" });

      if (input.encounterId) {
        const encounter = await client.query(
          "SELECT id FROM encounters WHERE tenant_id = $1 AND id = $2 AND patient_id = $3",
          [request.auth.tenantId, input.encounterId, input.patientId],
        );
        if (!encounter.rows[0]) return reply.code(400).send({ error: "document_encounter_invalid" });
      }

      const result = await client.query<{ id: string; content_hash: string; finalized_at: Date }>(
        `INSERT INTO clinical_document_records
          (tenant_id, patient_id, encounter_id, author_user_id, category, title, content, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,
           encode(digest(convert_to($7::jsonb::text, 'UTF8'), 'sha256'), 'hex'))
         RETURNING id, content_hash, finalized_at`,
        [request.auth.tenantId, input.patientId, input.encounterId ?? null, request.auth.userId,
          input.category, input.title, input.content],
      );
      const document = result.rows[0]!;
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "clinical_document.finalize",
        resourceType: "clinical_document",
        resourceId: document.id,
        requestId: request.id,
        ip: request.ip,
        after: { category: input.category, contentHash: document.content_hash, finalizedAt: document.finalized_at },
      });
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "patient", input.patientId);
      if (input.encounterId) await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "encounter", input.encounterId);
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "document", document.id);
      return reply.code(201).send(document);
    });
  });
}
