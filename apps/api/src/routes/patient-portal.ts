import { randomBytes, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { pool, withTenant } from "../db.js";
import { normalizePhone, secretHash } from "../notifications.js";

const COOKIE = "prontuvia_patient_session";
async function tenant(slug: string) {
  return (
    await pool.query<{ id: string; name: string }>(
      "SELECT id,name FROM tenants WHERE slug=$1 AND status='active'",
      [slug],
    )
  ).rows[0];
}
async function portalAuth(request: FastifyRequest) {
  const signed = request.cookies[COOKIE];
  if (!signed) return null;
  const unsigned = request.unsignCookie(signed);
  if (!unsigned.valid || !unsigned.value) return null;
  const [tenantId, token] = unsigned.value.split(".");
  if (!tenantId || !token) return null;
  return withTenant(
    {
      tenantId,
      userId: "00000000-0000-0000-0000-000000000000",
      requestId: request.id,
    },
    async (client) => {
      const session = (
        await client.query<{ id:string;patient_id: string;account_patient_id:string }>(
          "SELECT id,patient_id,account_patient_id FROM patient_portal_sessions WHERE tenant_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>now()",
          [tenantId, secretHash(token)],
        )
      ).rows[0];
      return session ? { tenantId, patientId: session.patient_id,accountPatientId:session.account_patient_id,sessionId:session.id } : null;
    },
  );
}
export async function patientPortalRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/request-code",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = z
        .object({
          tenantSlug: z.string().min(2),
          phone: z.string().min(8),
          birthDate: z.iso.date(),
        })
        .parse(request.body);
      const clinic = await tenant(input.tenantSlug);
      if (!clinic) return reply.code(404).send({ error: "clinic_not_found" });
      return withTenant(
        {
          tenantId: clinic.id,
          userId: "00000000-0000-0000-0000-000000000000",
          requestId: request.id,
        },
        async (client) => {
          const settings = (
            await client.query<{
              patient_portal_enabled: boolean;
              access_code_template: string;
              whatsapp_enabled: boolean;
            }>(
              "SELECT patient_portal_enabled,access_code_template,whatsapp_enabled FROM tenant_communication_settings WHERE tenant_id=$1",
              [clinic.id],
            )
          ).rows[0];
          if (!settings?.patient_portal_enabled)
            return reply.code(404).send({ error: "patient_portal_disabled" });
          const phone = normalizePhone(input.phone);
          const patient = (
            await client.query<{ id: string; full_name: string }>(
              "SELECT id,full_name FROM patients WHERE tenant_id=$1 AND birth_date=$2 AND regexp_replace(coalesce(phone,''),'\\D','','g') LIKE '%'||right($3,11) AND status='active' LIMIT 1",
              [clinic.id, input.birthDate, phone],
            )
          ).rows[0];
          if (!patient) return { requested: true };
          const code = String(randomInt(100000, 1000000));
          await client.query(
            "UPDATE patient_portal_access_codes SET used_at=now() WHERE tenant_id=$1 AND patient_id=$2 AND used_at IS NULL",
            [clinic.id, patient.id],
          );
          await client.query(
            "INSERT INTO patient_portal_access_codes(tenant_id,patient_id,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
            [clinic.id, patient.id, secretHash(code)],
          );
          await client.query(
            `INSERT INTO notification_jobs(tenant_id,patient_id,channel,kind,destination,template_name,payload,scheduled_for) VALUES($1,$2,$3,'portal_access_code',$4,$5,$6,now())`,
            [
              clinic.id,
              patient.id,
              settings.whatsapp_enabled &&
              config.WHATSAPP_PROVIDER === "meta" &&
              Boolean(
                config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN,
              )
                ? "whatsapp"
                : "sandbox",
              phone,
              settings.access_code_template,
              { patientName: patient.full_name, code, clinicName: clinic.name },
            ],
          );
          return {
            requested: true,
            developmentCode:
              config.NODE_ENV === "production" ? undefined : code,
          };
        },
      );
    },
  );
  app.post(
    "/verify-code",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = z
        .object({
          tenantSlug: z.string().min(2),
          phone: z.string().min(8),
          birthDate: z.iso.date(),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(request.body);
      const clinic = await tenant(input.tenantSlug);
      if (!clinic) return reply.code(404).send({ error: "clinic_not_found" });
      return withTenant(
        {
          tenantId: clinic.id,
          userId: "00000000-0000-0000-0000-000000000000",
          requestId: request.id,
        },
        async (client) => {
          const patient = (
            await client.query<{ id: string }>(
              "SELECT id FROM patients WHERE tenant_id=$1 AND birth_date=$2 AND regexp_replace(coalesce(phone,''),'\\D','','g') LIKE '%'||right($3,11) AND status='active' LIMIT 1",
              [clinic.id, input.birthDate, normalizePhone(input.phone)],
            )
          ).rows[0];
          if (!patient)
            return reply.code(401).send({ error: "portal_code_invalid" });
          const code = (
            await client.query<{
              id: string;
              code_hash: string;
              attempts: number;
            }>(
              "SELECT id,code_hash,attempts FROM patient_portal_access_codes WHERE tenant_id=$1 AND patient_id=$2 AND used_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
              [clinic.id, patient.id],
            )
          ).rows[0];
          if (
            !code ||
            code.attempts >= 5 ||
            code.code_hash !== secretHash(input.code)
          ) {
            if (code)
              await client.query(
                "UPDATE patient_portal_access_codes SET attempts=attempts+1 WHERE tenant_id=$1 AND id=$2",
                [clinic.id, code.id],
              );
            return reply.code(401).send({ error: "portal_code_invalid" });
          }
          await client.query(
            "UPDATE patient_portal_access_codes SET used_at=now() WHERE tenant_id=$1 AND id=$2",
            [clinic.id, code.id],
          );
          const token = randomBytes(32).toString("base64url");
          await client.query(
            "INSERT INTO patient_portal_sessions(tenant_id,patient_id,account_patient_id,token_hash,expires_at) VALUES($1,$2,$2,$3,now()+interval '12 hours')",
            [clinic.id, patient.id, secretHash(token)],
          );
          reply.setCookie(COOKIE, `${clinic.id}.${token}`, {
            path: "/",
            httpOnly: true,
            signed: true,
            sameSite: "strict",
            secure: config.NODE_ENV === "production",
            maxAge: 43200,
          });
          return { authenticated: true };
        },
      );
    },
  );
  app.get("/me", async (request, reply) => {
    const auth = await portalAuth(request);
    if (!auth)
      return reply.code(401).send({ error: "portal_authentication_required" });
    return withTenant(
      {
        tenantId: auth.tenantId,
        userId: "00000000-0000-0000-0000-000000000000",
        requestId: request.id,
      },
      async (client) => {
        const [patient,appointments,dependents,documents,finances,forms]=await Promise.all([
          client.query("SELECT id,full_name,preferred_name,birth_date,phone,email,address,insurance FROM patients WHERE tenant_id=$1 AND id=$2",[auth.tenantId,auth.patientId]),
          client.query(
          `SELECT a.id,a.starts_at,a.ends_at,a.type,a.status,u.name AS professional_name,cu.name AS unit_name FROM appointments a JOIN users u ON u.id=a.professional_user_id JOIN clinic_units cu ON cu.tenant_id=a.tenant_id AND cu.id=a.unit_id WHERE a.tenant_id=$1 AND a.patient_id=$2 ORDER BY a.starts_at DESC LIMIT 50`,
          [auth.tenantId, auth.patientId],
          ),
          client.query(`SELECT p.id,p.full_name,p.birth_date,pd.relationship,(p.id=$3) AS active FROM patient_dependents pd JOIN patients p ON p.tenant_id=pd.tenant_id AND p.id=pd.dependent_patient_id WHERE pd.tenant_id=$1 AND pd.account_patient_id=$2 UNION ALL SELECT p.id,p.full_name,p.birth_date,'Titular' relationship,(p.id=$3) active FROM patients p WHERE p.tenant_id=$1 AND p.id=$2 ORDER BY relationship,full_name`,[auth.tenantId,auth.accountPatientId,auth.patientId]),
          client.query(`SELECT d.id,d.category,d.title,d.content,d.content_hash,d.finalized_at,u.name author_name FROM clinical_document_records d JOIN users u ON u.id=d.author_user_id WHERE d.tenant_id=$1 AND d.patient_id=$2 ORDER BY d.finalized_at DESC LIMIT 100`,[auth.tenantId,auth.patientId]),
          client.query(`SELECT id,description,amount,due_date,status,paid_at,payment_method FROM financial_transactions WHERE tenant_id=$1 AND patient_id=$2 AND kind='income' AND status<>'cancelled' ORDER BY due_date DESC LIMIT 100`,[auth.tenantId,auth.patientId]),
          client.query(`SELECT f.id,f.title,f.description,f.fields,r.id response_id,r.submitted_at,(SELECT a.id FROM appointments a WHERE a.tenant_id=$1 AND a.patient_id=$2 AND a.starts_at>now() AND a.status IN('scheduled','confirmed') ORDER BY a.starts_at LIMIT 1) appointment_id FROM portal_form_templates f LEFT JOIN LATERAL(SELECT id,submitted_at FROM portal_form_responses WHERE tenant_id=f.tenant_id AND template_id=f.id AND patient_id=$2 ORDER BY submitted_at DESC LIMIT 1)r ON true WHERE f.tenant_id=$1 AND f.status='active' ORDER BY f.title`,[auth.tenantId,auth.patientId]),
        ]);
        const clinic=(await client.query("SELECT name FROM tenants WHERE id=$1",[auth.tenantId])).rows[0];
        return {clinic,patient:patient.rows[0],appointments:appointments.rows,dependents:dependents.rows,documents:documents.rows,finances:finances.rows,forms:forms.rows};
      },
    );
  });
  app.patch("/profile",async(request,reply)=>{const auth=await portalAuth(request);if(!auth)return reply.code(401).send({error:"portal_authentication_required"});const input=z.object({preferredName:z.string().trim().max(120).optional(),phone:z.string().trim().min(8).max(40),email:z.email().or(z.literal("")).optional(),address:z.object({street:z.string().trim().max(180).optional(),number:z.string().trim().max(30).optional(),city:z.string().trim().max(100).optional(),state:z.string().trim().max(2).optional(),zipCode:z.string().trim().max(20).optional()}).optional()}).parse(request.body);return withTenant({tenantId:auth.tenantId,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{const actor=(await client.query<{user_id:string}>("SELECT user_id FROM tenant_memberships WHERE tenant_id=$1 AND role IN('owner','admin') AND status='active' ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END LIMIT 1",[auth.tenantId])).rows[0];if(!actor)return reply.code(409).send({error:"clinic_not_ready"});await client.query("UPDATE patients SET preferred_name=$1,phone=$2,email=$3,address=$4,updated_by=$5 WHERE tenant_id=$6 AND id=$7",[input.preferredName||null,input.phone,input.email||null,input.address??{},actor.user_id,auth.tenantId,auth.patientId]);return{updated:true};});});

  app.post("/dependents",async(request,reply)=>{const auth=await portalAuth(request);if(!auth)return reply.code(401).send({error:"portal_authentication_required"});const input=z.object({fullName:z.string().trim().min(2).max(180),birthDate:z.iso.date(),relationship:z.string().trim().min(2).max(60),sexAtBirth:z.enum(["female","male","intersex","unknown"]).optional()}).parse(request.body);return withTenant({tenantId:auth.tenantId,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{const actor=(await client.query<{user_id:string}>("SELECT user_id FROM tenant_memberships WHERE tenant_id=$1 AND role IN('owner','admin') AND status='active' ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END LIMIT 1",[auth.tenantId])).rows[0];if(!actor)return reply.code(409).send({error:"clinic_not_ready"});const dependent=(await client.query<{id:string}>("INSERT INTO patients(tenant_id,full_name,birth_date,sex_at_birth,legal_guardian,created_by,updated_by) VALUES($1,$2,$3,$4,jsonb_build_object('accountPatientId',$5,'relationship',$6),$7,$7) RETURNING id",[auth.tenantId,input.fullName,input.birthDate,input.sexAtBirth??"unknown",auth.accountPatientId,input.relationship,actor.user_id])).rows[0]!;await client.query("INSERT INTO patient_dependents(tenant_id,account_patient_id,dependent_patient_id,relationship) VALUES($1,$2,$3,$4)",[auth.tenantId,auth.accountPatientId,dependent.id,input.relationship]);return reply.code(201).send({id:dependent.id});});});

  app.post("/switch-patient",async(request,reply)=>{const auth=await portalAuth(request);if(!auth)return reply.code(401).send({error:"portal_authentication_required"});const{patientId}=z.object({patientId:z.uuid()}).parse(request.body);return withTenant({tenantId:auth.tenantId,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{const allowed=await client.query("SELECT 1 FROM patients WHERE tenant_id=$1 AND id=$2 AND ($2=$3 OR EXISTS(SELECT 1 FROM patient_dependents WHERE tenant_id=$1 AND account_patient_id=$3 AND dependent_patient_id=$2))",[auth.tenantId,patientId,auth.accountPatientId]);if(!allowed.rows[0])return reply.code(403).send({error:"dependent_access_denied"});await client.query("UPDATE patient_portal_sessions SET patient_id=$1 WHERE tenant_id=$2 AND id=$3",[patientId,auth.tenantId,auth.sessionId]);return{activePatientId:patientId};});});

  app.post("/forms/:id/responses",async(request,reply)=>{const auth=await portalAuth(request);if(!auth)return reply.code(401).send({error:"portal_authentication_required"});const{id}=z.object({id:z.uuid()}).parse(request.params);const input=z.object({appointmentId:z.uuid().optional(),answers:z.record(z.string(),z.union([z.string().max(5000),z.boolean(),z.number()]))}).parse(request.body);if(JSON.stringify(input.answers).length>20000)return reply.code(400).send({error:"form_response_too_large"});return withTenant({tenantId:auth.tenantId,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{const valid=await client.query(`SELECT EXISTS(SELECT 1 FROM portal_form_templates WHERE tenant_id=$1 AND id=$2 AND status='active') template_ok,($3::uuid IS NULL OR EXISTS(SELECT 1 FROM appointments WHERE tenant_id=$1 AND id=$3 AND patient_id=$4)) appointment_ok`,[auth.tenantId,id,input.appointmentId??null,auth.patientId]);if(!valid.rows[0]?.template_ok||!valid.rows[0]?.appointment_ok)return reply.code(400).send({error:"portal_form_reference_invalid"});const result=await client.query<{id:string}>("INSERT INTO portal_form_responses(tenant_id,template_id,patient_id,appointment_id,answers) VALUES($1,$2,$3,$4,$5) RETURNING id",[auth.tenantId,id,auth.patientId,input.appointmentId??null,input.answers]);return reply.code(201).send({id:result.rows[0]!.id});});});

  app.patch("/appointments/:id/cancel", async (request, reply) => {
    const auth = await portalAuth(request);
    if (!auth)
      return reply.code(401).send({ error: "portal_authentication_required" });
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    return withTenant(
      {
        tenantId: auth.tenantId,
        userId: "00000000-0000-0000-0000-000000000000",
        requestId: request.id,
      },
      async (client) => {
        const result = await client.query(
          "UPDATE appointments SET status='cancelled',cancellation_reason='Cancelado pelo portal do paciente' WHERE tenant_id=$1 AND id=$2 AND patient_id=$3 AND starts_at>now() AND status IN('scheduled','confirmed') RETURNING id",
          [auth.tenantId, id, auth.patientId],
        );
        if (!result.rows[0])
          return reply.code(409).send({ error: "appointment_not_cancellable" });
        await client.query("INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,reason) VALUES($1,$2,'cancelled','patient','Cancelado pelo portal do paciente')",[auth.tenantId,id]);
        await client.query(
          "UPDATE notification_jobs SET status='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND status='pending'",
          [auth.tenantId, id],
        );
        return { id, status: "cancelled" };
      },
    );
  });
  app.post("/logout", async (request, reply) => {
    const auth=await portalAuth(request);
    if(auth)await withTenant({tenantId:auth.tenantId,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},client=>client.query("UPDATE patient_portal_sessions SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",[auth.tenantId,auth.sessionId]));
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.code(204).send();
  });
}
