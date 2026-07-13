import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { writeAudit } from "../audit.js";
import { withTenant } from "../db.js";
import {
  appointmentStatuses,
  canTransitionAppointment,
  type AppointmentStatus,
} from "../appointment-status.js";
import { enqueueAppointmentNotifications } from "../notifications.js";
import { enqueueFhirSync } from "../fhir-sync.js";

const appointmentInput = z
  .object({
    unitId: z.uuid(),
    patientId: z.uuid(),
    professionalUserId: z.uuid(),
    procedureId: z.uuid().optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    type: z.string().trim().min(2).max(100),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

const periodQuery = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  professionalUserId: z.uuid().optional(),
});

const statusInput = z
  .object({
    status: z.enum(appointmentStatuses),
    cancellationReason: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "cancelled" && !value.cancellationReason) {
      context.addIssue({
        code: "custom",
        path: ["cancellationReason"],
        message: "Informe o motivo do cancelamento",
      });
    }
  });

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/:id/events",{preHandler:[requirePermission("appointments.read")]},async(request,reply)=>{const{id}=z.object({id:z.uuid()}).parse(request.params);return withTenant(request.auth,async client=>{const exists=await client.query("SELECT 1 FROM appointments WHERE tenant_id=$1 AND id=$2",[request.auth.tenantId,id]);if(!exists.rows[0])return reply.code(404).send({error:"appointment_not_found"});const items=await client.query(`SELECT e.id,e.event_type,e.actor_type,e.previous_starts_at,e.new_starts_at,e.reason,e.metadata,e.created_at,u.name actor_name FROM appointment_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.tenant_id=$1 AND e.appointment_id=$2 ORDER BY e.created_at`,[request.auth.tenantId,id]);return{items:items.rows};});});

  app.get(
    "/",
    { preHandler: [requirePermission("appointments.read")] },
    async (request) => {
      const query = periodQuery.parse(request.query);
      return withTenant(request.auth, async (client) => {
        const result = await client.query(
          `SELECT a.id, a.starts_at, a.ends_at, a.type, a.status, a.notes, a.source,
                p.id AS patient_id, p.full_name AS patient_name,
                a.professional_user_id, u.name AS professional_name, a.unit_id, cu.name AS unit_name,
                a.procedure_id, a.price_snapshot, a.professional_amount_snapshot, pr.color AS procedure_color,
                e.id AS encounter_id, n.id AS note_id, n.updated_at AS note_updated_at,
                n.status AS note_status, n.content AS note_content
           FROM appointments a
           JOIN patients p ON p.tenant_id = a.tenant_id AND p.id = a.patient_id
           JOIN users u ON u.id = a.professional_user_id
           JOIN clinic_units cu ON cu.tenant_id = a.tenant_id AND cu.id = a.unit_id
           LEFT JOIN procedures pr ON pr.tenant_id=a.tenant_id AND pr.id=a.procedure_id
           LEFT JOIN encounters e ON e.tenant_id = a.tenant_id AND e.appointment_id = a.id
           LEFT JOIN clinical_notes n ON n.tenant_id = e.tenant_id AND n.encounter_id = e.id
          WHERE a.tenant_id = $1 AND a.starts_at < $3 AND a.ends_at > $2
            AND ($4::uuid IS NULL OR a.professional_user_id = $4)
          ORDER BY a.starts_at`,
          [
            request.auth.tenantId,
            query.from,
            query.to,
            query.professionalUserId ?? null,
          ],
        );
        return { items: result.rows };
      });
    },
  );

  app.post(
    "/",
    { preHandler: [requirePermission("appointments.write")] },
    async (request, reply) => {
      const input = appointmentInput.parse(request.body);
      return withTenant(request.auth, async (client) => {
        const references = await client.query<{
          patient_ok: boolean;
          unit_ok: boolean;
          professional_ok: boolean;
        }>(
          `SELECT
           EXISTS (SELECT 1 FROM patients WHERE tenant_id = $1 AND id = $2 AND status = 'active') AS patient_ok,
           EXISTS (SELECT 1 FROM clinic_units WHERE tenant_id = $1 AND id = $3 AND status = 'active') AS unit_ok,
           EXISTS (SELECT 1 FROM tenant_memberships
                    WHERE tenant_id = $1 AND user_id = $4 AND status = 'active'
                      AND role IN ('owner', 'admin', 'clinician')) AS professional_ok`,
          [
            request.auth.tenantId,
            input.patientId,
            input.unitId,
            input.professionalUserId,
          ],
        );
        const validity = references.rows[0]!;
        if (!validity.patient_ok)
          return reply.code(400).send({ error: "appointment_patient_invalid" });
        if (!validity.unit_ok)
          return reply.code(400).send({ error: "appointment_unit_invalid" });
        if (!validity.professional_ok)
          return reply
            .code(400)
            .send({ error: "appointment_professional_invalid" });
        const procedure = input.procedureId
          ? await client.query<{
              name: string;
              price: string;
              professional_amount: string;
            }>(
              "SELECT name,price,professional_amount FROM procedures WHERE tenant_id=$1 AND id=$2 AND status='active'",
              [request.auth.tenantId, input.procedureId],
            )
          : null;
        if (input.procedureId && !procedure?.rows[0])
          return reply
            .code(400)
            .send({ error: "appointment_procedure_invalid" });
        const availability = await client.query<{
          has_schedule: boolean;
          within_schedule: boolean;
          blocked: boolean;
        }>(
          `SELECT
        EXISTS(SELECT 1 FROM professional_schedules WHERE tenant_id=$1 AND professional_user_id=$2 AND status='active') AS has_schedule,
        EXISTS(SELECT 1 FROM professional_schedules s JOIN clinic_units cu ON cu.tenant_id=s.tenant_id AND cu.id=s.unit_id
          WHERE s.tenant_id=$1 AND s.professional_user_id=$2 AND s.unit_id=$3 AND s.status='active'
            AND s.weekday=extract(dow FROM $4::timestamptz AT TIME ZONE cu.timezone)
            AND ($4::timestamptz AT TIME ZONE cu.timezone)::time>=s.starts_at
            AND ($5::timestamptz AT TIME ZONE cu.timezone)::time<=s.ends_at) AS within_schedule,
        EXISTS(SELECT 1 FROM schedule_blocks WHERE tenant_id=$1 AND professional_user_id=$2
          AND (unit_id IS NULL OR unit_id=$3) AND starts_at<$5 AND ends_at>$4) AS blocked`,
          [
            request.auth.tenantId,
            input.professionalUserId,
            input.unitId,
            input.startsAt,
            input.endsAt,
          ],
        );
        const slot = availability.rows[0]!;
        if (slot.blocked)
          return reply.code(409).send({ error: "appointment_blocked" });
        if (slot.has_schedule && !slot.within_schedule)
          return reply
            .code(409)
            .send({ error: "appointment_outside_schedule" });
        const result = await client.query<{ id: string }>(
          `INSERT INTO appointments
          (tenant_id, unit_id, patient_id, professional_user_id, procedure_id, price_snapshot, professional_amount_snapshot, starts_at, ends_at, type, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
          [
            request.auth.tenantId,
            input.unitId,
            input.patientId,
            input.professionalUserId,
            input.procedureId ?? null,
            procedure?.rows[0]?.price ?? 0,
            procedure?.rows[0]?.professional_amount ?? 0,
            input.startsAt,
            input.endsAt,
            procedure?.rows[0]?.name ?? input.type,
            input.notes ?? null,
            request.auth.userId,
          ],
        );
        const id = result.rows[0]!.id;
        await client.query("INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,actor_user_id,new_starts_at,metadata) VALUES($1,$2,'created','user',$3,$4,jsonb_build_object('source','internal'))",[request.auth.tenantId,id,request.auth.userId,input.startsAt]);
        const notificationContext = await client.query<{
          patient_name: string;
          phone: string | null;
          professional_name: string;
          clinic_name: string;
        }>(
          `SELECT p.full_name AS patient_name,p.phone,u.name AS professional_name,t.name AS clinic_name FROM patients p JOIN users u ON u.id=$3 JOIN tenants t ON t.id=$1 WHERE p.tenant_id=$1 AND p.id=$2`,
          [request.auth.tenantId, input.patientId, input.professionalUserId],
        );
        const notification = notificationContext.rows[0];
        if (notification?.phone)
          await enqueueAppointmentNotifications(client, {
            tenantId: request.auth.tenantId,
            patientId: input.patientId,
            appointmentId: id,
            phone: notification.phone,
            patientName: notification.patient_name,
            clinicName: notification.clinic_name,
            startsAt: input.startsAt,
            professionalName: notification.professional_name,
          });
        await writeAudit(client, {
          tenantId: request.auth.tenantId,
          actorUserId: request.auth.userId,
          action: "appointment.create",
          resourceType: "appointment",
          resourceId: id,
          requestId: request.id,
          ip: request.ip,
          after: {
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            professionalUserId: input.professionalUserId,
          },
        });
        await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "patient", input.patientId);
        await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "appointment", id);
        return reply.code(201).send({ id });
      });
    },
  );

  app.put(
    "/:id",
    { preHandler: [requirePermission("appointments.write")] },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const input = appointmentInput.parse(request.body);
      return withTenant(request.auth, async (client) => {
        const current = await client.query<{
          status: AppointmentStatus;
          unit_id: string;
          patient_id: string;
          professional_user_id: string;
          starts_at: Date;
          ends_at: Date;
          type: string;
          notes: string | null;
          procedure_id: string | null;
        }>(
          "SELECT status, unit_id, patient_id, professional_user_id, starts_at, ends_at, type, notes, procedure_id FROM appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
          [request.auth.tenantId, id],
        );
        const previous = current.rows[0];
        if (!previous)
          return reply.code(404).send({ error: "appointment_not_found" });
        if (!["scheduled", "confirmed", "waiting"].includes(previous.status)) {
          return reply
            .code(409)
            .send({
              error: "appointment_not_editable",
              status: previous.status,
            });
        }
        const references = await client.query<{
          patient_ok: boolean;
          unit_ok: boolean;
          professional_ok: boolean;
        }>(
          `SELECT
           EXISTS (SELECT 1 FROM patients WHERE tenant_id = $1 AND id = $2 AND status = 'active') AS patient_ok,
           EXISTS (SELECT 1 FROM clinic_units WHERE tenant_id = $1 AND id = $3 AND status = 'active') AS unit_ok,
           EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $4 AND status = 'active' AND role IN ('owner', 'admin', 'clinician')) AS professional_ok`,
          [
            request.auth.tenantId,
            input.patientId,
            input.unitId,
            input.professionalUserId,
          ],
        );
        const validity = references.rows[0]!;
        if (!validity.patient_ok)
          return reply.code(400).send({ error: "appointment_patient_invalid" });
        if (!validity.unit_ok)
          return reply.code(400).send({ error: "appointment_unit_invalid" });
        if (!validity.professional_ok)
          return reply
            .code(400)
            .send({ error: "appointment_professional_invalid" });
        const procedure = input.procedureId
          ? await client.query<{
              name: string;
              price: string;
              professional_amount: string;
            }>(
              "SELECT name,price,professional_amount FROM procedures WHERE tenant_id=$1 AND id=$2 AND status='active'",
              [request.auth.tenantId, input.procedureId],
            )
          : null;
        if (input.procedureId && !procedure?.rows[0])
          return reply
            .code(400)
            .send({ error: "appointment_procedure_invalid" });
        const availability = await client.query<{
          has_schedule: boolean;
          within_schedule: boolean;
          blocked: boolean;
        }>(
          `SELECT
        EXISTS(SELECT 1 FROM professional_schedules WHERE tenant_id=$1 AND professional_user_id=$2 AND status='active') AS has_schedule,
        EXISTS(SELECT 1 FROM professional_schedules s JOIN clinic_units cu ON cu.tenant_id=s.tenant_id AND cu.id=s.unit_id WHERE s.tenant_id=$1 AND s.professional_user_id=$2 AND s.unit_id=$3 AND s.status='active' AND s.weekday=extract(dow FROM $4::timestamptz AT TIME ZONE cu.timezone) AND ($4::timestamptz AT TIME ZONE cu.timezone)::time>=s.starts_at AND ($5::timestamptz AT TIME ZONE cu.timezone)::time<=s.ends_at) AS within_schedule,
        EXISTS(SELECT 1 FROM schedule_blocks WHERE tenant_id=$1 AND professional_user_id=$2 AND (unit_id IS NULL OR unit_id=$3) AND starts_at<$5 AND ends_at>$4) AS blocked`,
          [
            request.auth.tenantId,
            input.professionalUserId,
            input.unitId,
            input.startsAt,
            input.endsAt,
          ],
        );
        const slot = availability.rows[0]!;
        if (slot.blocked)
          return reply.code(409).send({ error: "appointment_blocked" });
        if (slot.has_schedule && !slot.within_schedule)
          return reply
            .code(409)
            .send({ error: "appointment_outside_schedule" });
        await client.query(
          `UPDATE appointments SET unit_id = $3, patient_id = $4, professional_user_id = $5,
          procedure_id=$6,price_snapshot=$7,professional_amount_snapshot=$8,starts_at = $9, ends_at = $10, type = $11, notes = $12, updated_by = $13
         WHERE tenant_id = $1 AND id = $2`,
          [
            request.auth.tenantId,
            id,
            input.unitId,
            input.patientId,
            input.professionalUserId,
            input.procedureId ?? null,
            procedure?.rows[0]?.price ?? 0,
            procedure?.rows[0]?.professional_amount ?? 0,
            input.startsAt,
            input.endsAt,
            procedure?.rows[0]?.name ?? input.type,
            input.notes ?? null,
            request.auth.userId,
          ],
        );
        if(new Date(previous.starts_at).getTime()!==new Date(input.startsAt).getTime())await client.query("INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,actor_user_id,previous_starts_at,new_starts_at) VALUES($1,$2,'rescheduled','user',$3,$4,$5)",[request.auth.tenantId,id,request.auth.userId,previous.starts_at,input.startsAt]);
        await client.query(
          "UPDATE notification_jobs SET status='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND status='pending'",
          [request.auth.tenantId, id],
        );
        const notificationContext = await client.query<{
          patient_name: string;
          phone: string | null;
          professional_name: string;
          clinic_name: string;
        }>(
          `SELECT p.full_name AS patient_name,p.phone,u.name AS professional_name,t.name AS clinic_name
           FROM patients p
           JOIN users u ON u.id=$3
           JOIN tenants t ON t.id=$1
          WHERE p.tenant_id=$1 AND p.id=$2`,
          [request.auth.tenantId, input.patientId, input.professionalUserId],
        );
        const notification = notificationContext.rows[0];
        if (notification?.phone)
          await enqueueAppointmentNotifications(client, {
            tenantId: request.auth.tenantId,
            patientId: input.patientId,
            appointmentId: id,
            phone: notification.phone,
            patientName: notification.patient_name,
            clinicName: notification.clinic_name,
            startsAt: input.startsAt,
            professionalName: notification.professional_name,
          });
        await writeAudit(client, {
          tenantId: request.auth.tenantId,
          actorUserId: request.auth.userId,
          action: "appointment.update",
          resourceType: "appointment",
          resourceId: id,
          requestId: request.id,
          ip: request.ip,
          before: previous,
          after: {
            unitId: input.unitId,
            patientId: input.patientId,
            professionalUserId: input.professionalUserId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            type: input.type,
          },
        });
        await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "patient", input.patientId);
        await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "appointment", id);
        return { id };
      });
    },
  );

  app.patch(
    "/:id/status",
    { preHandler: [requirePermission("appointments.write")] },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const input = statusInput.parse(request.body);
      return withTenant(request.auth, async (client) => {
        const current = await client.query<{ status: AppointmentStatus }>(
          "SELECT status FROM appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
          [request.auth.tenantId, id],
        );
        const previous = current.rows[0]?.status;
        if (!previous)
          return reply.code(404).send({ error: "appointment_not_found" });
        if (!canTransitionAppointment(previous, input.status)) {
          return reply
            .code(409)
            .send({
              error: "invalid_appointment_transition",
              from: previous,
              to: input.status,
            });
        }
        await client.query(
          `UPDATE appointments
            SET status = $1, cancellation_reason = $2, updated_by = $3
          WHERE tenant_id = $4 AND id = $5`,
          [
            input.status,
            input.status === "cancelled" ? input.cancellationReason : null,
            request.auth.userId,
            request.auth.tenantId,
            id,
          ],
        );
        if (["cancelled", "completed", "no_show"].includes(input.status)) {
          await client.query(
            "UPDATE notification_jobs SET status='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND status='pending'",
            [request.auth.tenantId, id],
          );
        }
        const eventType:Record<AppointmentStatus,string>={scheduled:"created",confirmed:"confirmed",waiting:"check_in",in_progress:"started",completed:"completed",cancelled:"cancelled",no_show:"no_show"};
        if(input.status!=="scheduled")await client.query("INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,actor_user_id,reason,metadata) VALUES($1,$2,$3,'user',$4,$5,jsonb_build_object('previousStatus',$6))",[request.auth.tenantId,id,eventType[input.status],request.auth.userId,input.cancellationReason??null,previous]);
        await writeAudit(client, {
          tenantId: request.auth.tenantId,
          actorUserId: request.auth.userId,
          action: "appointment.status_update",
          resourceType: "appointment",
          resourceId: id,
          requestId: request.id,
          ip: request.ip,
          before: { status: previous },
          after: { status: input.status },
        });
        await enqueueFhirSync(client, request.auth.tenantId, request.auth.userId, "appointment", id);
        return { id, status: input.status };
      });
    },
  );
}
