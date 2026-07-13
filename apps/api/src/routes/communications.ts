import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { config } from "../config.js";
import { pool, withTenant } from "../db.js";
import { normalizePhone, runNotificationWorker } from "../notifications.js";

const settingsInput = z.object({
  onlineBookingEnabled: z.boolean(),
  patientPortalEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  reminderHours: z.array(z.number().int().min(1).max(336)).min(1).max(3),
  confirmationTemplate: z.string().trim().min(3).max(100),
  reminderTemplate: z.string().trim().min(3).max(100),
  accessCodeTemplate: z.string().trim().min(3).max(100),
  locale: z.string().trim().default("pt_BR"),
  bookingAutoConfirm: z.boolean(),
  minimumBookingNoticeHours: z.number().int().min(0).max(720),
  cancellationNoticeHours: z.number().int().min(0).max(720),
  requireBirthDate: z.boolean(),
  bookingTerms: z.string().trim().min(20).max(5000),
});
export async function communicationRoutes(app: FastifyInstance): Promise<void> {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
      (request as FastifyRequest & { rawBody: Buffer }).rawBody = rawBody;
      try {
        done(null, JSON.parse(rawBody.toString("utf8")));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );
  app.get("/webhook", async (request, reply) => {
    const query = request.query as Record<string, string>;
    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    )
      return reply.type("text/plain").send(query["hub.challenge"]);
    return reply.code(403).send({ error: "webhook_verification_failed" });
  });
  app.post("/webhook", async (request, reply) => {
    if (config.WHATSAPP_APP_SECRET) {
      const signature = String(request.headers["x-hub-signature-256"] ?? "");
      const rawBody =
        (request as FastifyRequest & { rawBody?: Buffer }).rawBody ??
        Buffer.from(JSON.stringify(request.body));
      const expected = `sha256=${createHmac("sha256", config.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`;
      if (
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        return reply.code(401).send({ error: "invalid_webhook_signature" });
    }
    const payload = request.body as any;
    const messages =
      payload?.entry
        ?.flatMap((entry: any) => entry.changes ?? [])
        .flatMap((change: any) => change.value?.messages ?? []) ?? [];
    for (const message of messages) {
      const phone = normalizePhone(String(message.from ?? ""));
      const answer = String(
        message.button?.text ??
          message.interactive?.button_reply?.title ??
          message.text?.body ??
          "",
      )
        .trim()
        .toUpperCase();
      if (
        !phone ||
        !["SIM", "CONFIRMAR", "CONFIRMO", "CANCELAR", "NÃO", "NAO"].includes(
          answer,
        )
      )
        continue;
      const tenants = await pool.query<{ id: string }>(
        "SELECT id FROM tenants WHERE status='active'",
      );
      for (const tenant of tenants.rows) {
        await withTenant(
          {
            tenantId: tenant.id,
            userId: "00000000-0000-0000-0000-000000000000",
            requestId: request.id,
          },
          async (client) => {
            const appointment = await client.query<{
              id: string;
              status: string;
            }>(
              `SELECT a.id,a.status FROM appointments a JOIN patients p ON p.tenant_id=a.tenant_id AND p.id=a.patient_id WHERE a.tenant_id=$1 AND regexp_replace(coalesce(p.phone,''),'\\D','','g') LIKE '%'||right($2,11) AND a.starts_at>now() AND a.status IN('scheduled','confirmed') ORDER BY a.starts_at LIMIT 1`,
              [tenant.id, phone],
            );
            if (!appointment.rows[0]) return;
            const confirm = ["SIM", "CONFIRMAR", "CONFIRMO"].includes(answer);
            await client.query(
              "UPDATE appointments SET status=$1,cancellation_reason=$2 WHERE tenant_id=$3 AND id=$4",
              [
                confirm ? "confirmed" : "cancelled",
                confirm ? null : "Cancelado pelo paciente via WhatsApp",
                tenant.id,
                appointment.rows[0].id,
              ],
            );
            if (!confirm) {
              await client.query(
                "UPDATE notification_jobs SET status='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND status='pending'",
                [tenant.id, appointment.rows[0].id],
              );
            }
          },
        );
      }
    }
    return reply.send({ received: true });
  });
  app.addHook("preHandler", authenticate);
  app.get(
    "/settings",
    { preHandler: [requirePermission("tenant.manage")] },
    async (request) =>
      withTenant(request.auth, async (client) => {
        await client.query(
          "INSERT INTO tenant_communication_settings(tenant_id,updated_by) VALUES($1,$2) ON CONFLICT(tenant_id) DO NOTHING",
          [request.auth.tenantId, request.auth.userId],
        );
        const row = (
          await client.query(
            `SELECT online_booking_enabled,patient_portal_enabled,whatsapp_enabled,reminder_hours,confirmation_template,reminder_template,access_code_template,locale,booking_auto_confirm,minimum_booking_notice_hours,cancellation_notice_hours,require_birth_date,booking_terms FROM tenant_communication_settings WHERE tenant_id=$1`,
            [request.auth.tenantId],
          )
        ).rows[0];
        return {
          settings: row,
          provider: {
            name: config.WHATSAPP_PROVIDER,
            configured: Boolean(
              config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN,
            ),
            webhookUrl: `${config.PUBLIC_API_URL}/v1/communications/webhook`,
          },
        };
      }),
  );
  app.put(
    "/settings",
    { preHandler: [requirePermission("tenant.manage")] },
    async (request) => {
      const input = settingsInput.parse(request.body);
      return withTenant(request.auth, async (client) => {
        await client.query(
          `INSERT INTO tenant_communication_settings(tenant_id,online_booking_enabled,patient_portal_enabled,whatsapp_enabled,reminder_hours,confirmation_template,reminder_template,access_code_template,locale,booking_auto_confirm,minimum_booking_notice_hours,cancellation_notice_hours,require_birth_date,booking_terms,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(tenant_id) DO UPDATE SET online_booking_enabled=$2,patient_portal_enabled=$3,whatsapp_enabled=$4,reminder_hours=$5,confirmation_template=$6,reminder_template=$7,access_code_template=$8,locale=$9,booking_auto_confirm=$10,minimum_booking_notice_hours=$11,cancellation_notice_hours=$12,require_birth_date=$13,booking_terms=$14,updated_by=$15`,
          [
            request.auth.tenantId,
            input.onlineBookingEnabled,
            input.patientPortalEnabled,
            input.whatsappEnabled,
            input.reminderHours,
            input.confirmationTemplate,
            input.reminderTemplate,
            input.accessCodeTemplate,
            input.locale,
            input.bookingAutoConfirm,
            input.minimumBookingNoticeHours,
            input.cancellationNoticeHours,
            input.requireBirthDate,
            input.bookingTerms,
            request.auth.userId,
          ],
        );
        return { updated: true };
      });
    },
  );
  app.get(
    "/jobs",
    { preHandler: [requirePermission("appointments.read")] },
    async (request) =>
      withTenant(request.auth, async (client) => ({
        items: (
          await client.query(
            `SELECT j.id,j.kind,j.destination,j.scheduled_for,j.status,j.attempts,j.last_error,j.sent_at,p.full_name AS patient_name FROM notification_jobs j LEFT JOIN patients p ON p.tenant_id=j.tenant_id AND p.id=j.patient_id WHERE j.tenant_id=$1 ORDER BY j.created_at DESC LIMIT 100`,
            [request.auth.tenantId],
          )
        ).rows,
      })),
  );
  app.post(
    "/process",
    { preHandler: [requirePermission("tenant.manage")] },
    async () => {
      await runNotificationWorker();
      return { processed: true };
    },
  );
}
