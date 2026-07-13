import { createHash } from "node:crypto";
import type { DbClient } from "./db.js";
import { pool, withTenant } from "./db.js";
import { config } from "./config.js";

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}
export function secretHash(value: string) {
  return createHash("sha256")
    .update(`${config.SESSION_PEPPER}:${value}`)
    .digest("hex");
}

export async function enqueueAppointmentNotifications(
  client: DbClient,
  input: {
    tenantId: string;
    patientId: string;
    appointmentId: string;
    phone: string;
    patientName: string;
    clinicName: string;
    startsAt: string | Date;
    professionalName: string;
  },
) {
  const destination = normalizePhone(input.phone);
  if (!destination) return;
  const settings = (
    await client.query<{
      whatsapp_enabled: boolean;
      reminder_hours: number[];
      confirmation_template: string;
      reminder_template: string;
    }>(
      "SELECT whatsapp_enabled,reminder_hours,confirmation_template,reminder_template FROM tenant_communication_settings WHERE tenant_id=$1",
      [input.tenantId],
    )
  ).rows[0];
  if (!settings) return;
  const channel =
    settings.whatsapp_enabled &&
    config.WHATSAPP_PROVIDER === "meta" &&
    Boolean(config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN)
      ? "whatsapp"
      : "sandbox";
  const startsAt = new Date(input.startsAt);
  const payload = {
    patientName: input.patientName,
    clinicName: input.clinicName,
    startsAt: startsAt.toISOString(),
    professionalName: input.professionalName,
  };
  await client.query(
    `INSERT INTO notification_jobs(tenant_id,patient_id,appointment_id,channel,kind,destination,template_name,payload,scheduled_for) VALUES($1,$2,$3,$4,'appointment_confirmation',$5,$6,$7,now())`,
    [
      input.tenantId,
      input.patientId,
      input.appointmentId,
      channel,
      destination,
      settings.confirmation_template,
      payload,
    ],
  );
  for (const hours of settings.reminder_hours ?? [24]) {
    const scheduled = new Date(startsAt.getTime() - hours * 3600000);
    if (scheduled.getTime() > Date.now())
      await client.query(
        `INSERT INTO notification_jobs(tenant_id,patient_id,appointment_id,channel,kind,destination,template_name,payload,scheduled_for) VALUES($1,$2,$3,$4,'appointment_reminder',$5,$6,$7,$8)`,
        [
          input.tenantId,
          input.patientId,
          input.appointmentId,
          channel,
          destination,
          settings.reminder_template,
          { ...payload, hours },
          scheduled,
        ],
      );
  }
}

async function sendMetaTemplate(job: {
  destination: string;
  template_name: string;
  payload: Record<string, string>;
}) {
  if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN)
    throw new Error("whatsapp_credentials_missing");
  const values = Object.values(job.payload)
    .slice(0, 4)
    .map((value) => ({ type: "text", text: String(value) }));
  const response = await fetch(
    `https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: job.destination,
        type: "template",
        template: {
          name: job.template_name,
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: values }],
        },
      }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(data.error?.message ?? `whatsapp_http_${response.status}`);
  return data.messages?.[0]?.id ?? null;
}

async function processTenant(tenantId: string) {
  return withTenant(
    {
      tenantId,
      userId: "00000000-0000-0000-0000-000000000000",
      requestId: "notification-worker",
    },
    async (client) => {
      await client.query(
        "UPDATE notification_jobs SET status='pending',last_error='recovered_after_worker_interruption' WHERE tenant_id=$1 AND status='processing' AND updated_at<now()-interval '5 minutes'",
        [tenantId],
      );
      const jobs = await client.query<{
        id: string;
        channel: string;
        destination: string;
        template_name: string;
        payload: Record<string, string>;
      }>(
        `SELECT id,channel,destination,template_name,payload FROM notification_jobs WHERE tenant_id=$1 AND status='pending' AND scheduled_for<=now() ORDER BY scheduled_for FOR UPDATE SKIP LOCKED LIMIT 20`,
        [tenantId],
      );
      for (const job of jobs.rows) {
        try {
          await client.query(
            "UPDATE notification_jobs SET status='processing',attempts=attempts+1 WHERE tenant_id=$1 AND id=$2",
            [tenantId, job.id],
          );
          if (
            job.channel === "sandbox" ||
            config.WHATSAPP_PROVIDER === "sandbox"
          ) {
            await client.query(
              "UPDATE notification_jobs SET status='sandbox',sent_at=now(),last_error=NULL WHERE tenant_id=$1 AND id=$2",
              [tenantId, job.id],
            );
            continue;
          }
          const providerId = await sendMetaTemplate(job);
          await client.query(
            "UPDATE notification_jobs SET status='sent',provider_message_id=$3,sent_at=now(),last_error=NULL WHERE tenant_id=$1 AND id=$2",
            [tenantId, job.id, providerId],
          );
        } catch (error) {
          await client.query(
            "UPDATE notification_jobs SET status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,last_error=$3 WHERE tenant_id=$1 AND id=$2",
            [
              tenantId,
              job.id,
              error instanceof Error ? error.message : "send_failed",
            ],
          );
        }
      }
      return jobs.rowCount ?? 0;
    },
  );
}

let workerRunning = false;
export async function runNotificationWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const tenants = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE status='active'",
    );
    for (const tenant of tenants.rows) await processTenant(tenant.id);
  } finally {
    workerRunning = false;
  }
}
