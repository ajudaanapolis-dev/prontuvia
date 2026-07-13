import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { writeAudit } from "../audit.js";
import { withTenant } from "../db.js";
import { enqueueFhirSync } from "../fhir-sync.js";

const patientInput = z.object({
  fullName: z.string().trim().min(2).max(180),
  preferredName: z.string().trim().max(120).optional(),
  birthDate: z.iso.date().optional(),
  sexAtBirth: z.enum(["female", "male", "intersex", "unknown"]).optional(),
  genderIdentity: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.email().max(254).optional(),
  legalGuardian: z.record(z.string(), z.unknown()).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  insurance: z.record(z.string(), z.unknown()).optional(),
  allergies: z.array(z.record(z.string(), z.unknown())).default([]),
  alerts: z.array(z.record(z.string(), z.unknown())).default([]),
});

const listQuery = z.object({
  search: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function patientRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", { preHandler: [requirePermission("patients.read")] }, async (request) => {
    const query = listQuery.parse(request.query);
    return withTenant(request.auth, async (client) => {
      const result = await client.query(
        `SELECT id, full_name, preferred_name, birth_date, sex_at_birth, gender_identity,
                phone, email, insurance, allergies, alerts, status, created_at, updated_at
           FROM patients
          WHERE tenant_id = $1 AND status <> 'merged'
            AND ($2 = '' OR full_name ILIKE '%' || $2 || '%' OR preferred_name ILIKE '%' || $2 || '%')
          ORDER BY full_name
          LIMIT $3 OFFSET $4`,
        [request.auth.tenantId, query.search, query.limit, query.offset],
      );
      return { items: result.rows, limit: query.limit, offset: query.offset };
    });
  });

  app.get("/:id", { preHandler: [requirePermission("patients.read")] }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    return withTenant(request.auth, async (client) => {
      const result = await client.query(
        `SELECT id, full_name, preferred_name, birth_date, sex_at_birth, gender_identity,
                phone, email, legal_guardian, address, insurance, allergies, alerts, status,
                created_at, updated_at
           FROM patients WHERE tenant_id = $1 AND id = $2`,
        [request.auth.tenantId, id],
      );
      const patient = result.rows[0];
      if (!patient) return reply.code(404).send({ error: "patient_not_found" });
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "patient.read",
        resourceType: "patient",
        resourceId: id,
        requestId: request.id,
        ip: request.ip,
      });
      return patient;
    });
  });

  app.post("/", { preHandler: [requirePermission("patients.write")] }, async (request, reply) => {
    const input = patientInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO patients
          (tenant_id, full_name, preferred_name, birth_date, sex_at_birth, gender_identity,
           phone, email, legal_guardian, address, insurance, allergies, alerts, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
         RETURNING id`,
        [request.auth.tenantId, input.fullName, input.preferredName ?? null, input.birthDate ?? null,
          input.sexAtBirth ?? null, input.genderIdentity ?? null, input.phone ?? null, input.email ?? null,
          input.legalGuardian ?? null, input.address ?? null, input.insurance ?? null,
          input.allergies, input.alerts, request.auth.userId],
      );
      const id = result.rows[0]!.id;
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "patient.create",
        resourceType: "patient",
        resourceId: id,
        requestId: request.id,
        ip: request.ip,
        after: { fields: Object.keys(input) },
      });
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "patient", id);
      return reply.code(201).send({ id });
    });
  });

  app.put("/:id", { preHandler: [requirePermission("patients.write")] }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = patientInput.parse(request.body);
    return withTenant(request.auth, async (client) => {
      const before = await client.query(
        "SELECT full_name, preferred_name, birth_date, phone, email, insurance, allergies, alerts FROM patients WHERE tenant_id = $1 AND id = $2 AND status = 'active'",
        [request.auth.tenantId, id],
      );
      if (!before.rows[0]) return reply.code(404).send({ error: "patient_not_found" });
      await client.query(
        `UPDATE patients SET
           full_name = $3, preferred_name = $4, birth_date = $5, sex_at_birth = $6,
           gender_identity = $7, phone = $8, email = $9, legal_guardian = $10,
           address = $11, insurance = $12, allergies = $13, alerts = $14, updated_by = $15
         WHERE tenant_id = $1 AND id = $2`,
        [request.auth.tenantId, id, input.fullName, input.preferredName ?? null, input.birthDate ?? null,
          input.sexAtBirth ?? null, input.genderIdentity ?? null, input.phone ?? null, input.email ?? null,
          input.legalGuardian ?? null, input.address ?? null, input.insurance ?? null,
          input.allergies, input.alerts, request.auth.userId],
      );
      await writeAudit(client, {
        tenantId: request.auth.tenantId,
        actorUserId: request.auth.userId,
        action: "patient.update",
        resourceType: "patient",
        resourceId: id,
        requestId: request.id,
        ip: request.ip,
        before: before.rows[0],
        after: { fields: Object.keys(input) },
      });
      await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "patient", id);
      return { id };
    });
  });
}
