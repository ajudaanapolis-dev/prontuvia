import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { writeAudit } from "../audit.js";
import { withTenant } from "../db.js";

const createInput = z.object({
  patientId: z.uuid(),
  unitId: z.uuid().optional(),
  professionalUserId: z.uuid().optional(),
  procedureName: z.string().trim().min(2).max(100),
  preferredPeriod: z.enum(["morning", "afternoon", "evening", "any"]).default("any"),
  preferredDays: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  priority: z.number().int().min(0).max(3).default(0),
});

const statusInput = z.object({ status: z.enum(["waiting", "contacted", "scheduled", "cancelled"]) });

export async function waitlistRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", { preHandler: [requirePermission("appointments.read")] }, async (request) => withTenant(request.auth, async (client) => {
    const result = await client.query(
      `SELECT w.id, w.patient_id, p.full_name AS patient_name, p.phone,
              w.unit_id, cu.name AS unit_name, w.professional_user_id, u.name AS professional_name,
              w.procedure_name, w.preferred_period, w.preferred_days, w.notes,
              w.priority, w.status, w.created_at
         FROM appointment_waitlist w
         JOIN patients p ON p.tenant_id = w.tenant_id AND p.id = w.patient_id
         LEFT JOIN clinic_units cu ON cu.tenant_id = w.tenant_id AND cu.id = w.unit_id
         LEFT JOIN users u ON u.id = w.professional_user_id
        WHERE w.tenant_id = $1 AND w.status IN ('waiting', 'contacted')
        ORDER BY w.priority DESC, w.created_at`,
      [request.auth.tenantId],
    );
    return { items: result.rows };
  }));

  app.post("/", { preHandler: [requirePermission("appointments.write")] }, async (request, reply) => {
    const input = createInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO appointment_waitlist
          (tenant_id, patient_id, unit_id, professional_user_id, procedure_name,
           preferred_period, preferred_days, notes, priority, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [request.auth.tenantId, input.patientId, input.unitId ?? null, input.professionalUserId ?? null,
          input.procedureName, input.preferredPeriod, input.preferredDays ?? null, input.notes ?? null,
          input.priority, request.auth.userId],
      );
      const id = result.rows[0]!.id;
      await writeAudit(client, { tenantId: request.auth.tenantId, actorUserId: request.auth.userId, action: "waitlist.create", resourceType: "appointment_waitlist", resourceId: id, requestId: request.id, ip: request.ip, after: { patientId: input.patientId, procedureName: input.procedureName } });
      return reply.code(201).send({ id });
    });
  });

  app.patch("/:id/status", { preHandler: [requirePermission("appointments.write")] }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = statusInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const result = await client.query<{ status: string }>(
        "UPDATE appointment_waitlist SET status = $1, updated_by = $2 WHERE tenant_id = $3 AND id = $4 RETURNING status",
        [input.status, request.auth.userId, request.auth.tenantId, id],
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "waitlist_not_found" });
      await writeAudit(client, { tenantId: request.auth.tenantId, actorUserId: request.auth.userId, action: "waitlist.status_update", resourceType: "appointment_waitlist", resourceId: id, requestId: request.id, ip: request.ip, after: { status: input.status } });
      return { id, status: input.status };
    });
  });
}
