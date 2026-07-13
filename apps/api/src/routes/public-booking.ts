import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { pool, withTenant } from "../db.js";
import {
  enqueueAppointmentNotifications,
  normalizePhone,
  secretHash,
} from "../notifications.js";
import { enqueueFhirSync, processPendingFhirSync } from "../fhir-sync.js";
import type { PoolClient } from "pg";

type PublicSlot={startsAt:string;professionalUserId:string;professionalName:string};
async function calculatePublicSlots(client:PoolClient,input:{tenantId:string;date:string;specialtyId:string;procedureId:string;unitId:string;professionalUserId?:string;minimumNoticeHours:number}):Promise<PublicSlot[]>{
  const procedure=(await client.query<{duration_minutes:number}>("SELECT duration_minutes FROM procedures WHERE tenant_id=$1 AND id=$2 AND status='active'",[input.tenantId,input.procedureId])).rows[0];
  if(!procedure)return[];
  const professionals=await client.query<{id:string;name:string}>(`SELECT DISTINCT u.id,u.name FROM professional_services pv JOIN professional_specialties ps ON ps.tenant_id=pv.tenant_id AND ps.professional_user_id=pv.professional_user_id AND ps.specialty_id=pv.specialty_id JOIN tenant_memberships m ON m.tenant_id=pv.tenant_id AND m.user_id=pv.professional_user_id AND m.status='active' JOIN users u ON u.id=pv.professional_user_id WHERE pv.tenant_id=$1 AND pv.specialty_id=$2 AND pv.procedure_id=$3 AND pv.public_booking_enabled AND ps.public_booking_enabled AND ($4::uuid IS NULL OR pv.professional_user_id=$4) ORDER BY u.name`,[input.tenantId,input.specialtyId,input.procedureId,input.professionalUserId??null]);
  const items:PublicSlot[]=[];
  for(const professional of professionals.rows){
    const schedules=await client.query<{starts_at:Date;ends_at:Date}>(`SELECT ($4::date+s.starts_at) AT TIME ZONE cu.timezone AS starts_at,($4::date+s.ends_at) AT TIME ZONE cu.timezone AS ends_at FROM professional_schedules s JOIN clinic_units cu ON cu.tenant_id=s.tenant_id AND cu.id=s.unit_id WHERE s.tenant_id=$1 AND s.professional_user_id=$2 AND s.unit_id=$3 AND s.weekday=extract(dow FROM $4::date) AND s.status='active'`,[input.tenantId,professional.id,input.unitId,input.date]);
    const busy=await client.query<{starts_at:Date;ends_at:Date}>(`SELECT starts_at,ends_at FROM appointments WHERE tenant_id=$1 AND professional_user_id=$2 AND unit_id=$3 AND starts_at>=$4::date AND starts_at<$4::date+interval '1 day' AND status NOT IN('cancelled','no_show') UNION ALL SELECT starts_at,ends_at FROM schedule_blocks WHERE tenant_id=$1 AND professional_user_id=$2 AND (unit_id IS NULL OR unit_id=$3) AND starts_at<$4::date+interval '1 day' AND ends_at>$4::date`,[input.tenantId,professional.id,input.unitId,input.date]);
    for(const schedule of schedules.rows){
      const finish=new Date(schedule.ends_at);
      for(let cursor=new Date(schedule.starts_at);cursor.getTime()+procedure.duration_minutes*60000<=finish.getTime();cursor=new Date(cursor.getTime()+30*60000)){
        const end=new Date(cursor.getTime()+procedure.duration_minutes*60000);
        const unavailable=busy.rows.some(item=>new Date(item.starts_at)<end&&new Date(item.ends_at)>cursor);
        if(!unavailable&&cursor.getTime()>Date.now()+input.minimumNoticeHours*3_600_000)items.push({startsAt:cursor.toISOString(),professionalUserId:professional.id,professionalName:professional.name});
      }
    }
  }
  return items.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.professionalName.localeCompare(b.professionalName));
}

const bookingInput = z.object({
  fullName: z.string().trim().min(2).max(180),
  phone: z.string().trim().min(8).max(40),
  email: z.email().optional(),
  birthDate: z.iso.date().optional(),
  specialtyId: z.uuid(),
  procedureId: z.uuid(),
  professionalUserId: z.uuid(),
  unitId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  consentAccepted: z.literal(true),
});
async function tenantBySlug(slug: string) {
  return (
    await pool.query<{ id: string; name: string }>(
      "SELECT id,name FROM tenants WHERE slug=$1 AND status='active'",
      [slug],
    )
  ).rows[0];
}
export async function publicBookingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:slug", async (request, reply) => {
    const { slug } = z
      .object({ slug: z.string().min(2).max(80) })
      .parse(request.params);
    const tenant = await tenantBySlug(slug);
    if (!tenant) return reply.code(404).send({ error: "clinic_not_found" });
    return withTenant(
      {
        tenantId: tenant.id,
        userId: "00000000-0000-0000-0000-000000000000",
        requestId: request.id,
      },
      async (client) => {
        const settings = (
          await client.query(
            "SELECT online_booking_enabled,patient_portal_enabled,booking_auto_confirm,minimum_booking_notice_hours,cancellation_notice_hours,require_birth_date,booking_terms FROM tenant_communication_settings WHERE tenant_id=$1",
            [tenant.id],
          )
        ).rows[0];
        if (!settings?.online_booking_enabled)
          return reply.code(404).send({ error: "online_booking_disabled" });
        const [units, specialties, professionals, procedures] = await Promise.all([
          client.query(
            "SELECT id,name,timezone FROM clinic_units WHERE tenant_id=$1 AND status='active' ORDER BY name",
            [tenant.id],
          ),
          client.query("SELECT id,name FROM specialties WHERE tenant_id=$1 AND status='active' AND EXISTS(SELECT 1 FROM professional_services pv WHERE pv.tenant_id=$1 AND pv.specialty_id=specialties.id AND pv.public_booking_enabled) ORDER BY name",[tenant.id]),
          client.query(`SELECT u.id,u.name,array_agg(DISTINCT ps.specialty_id) AS specialty_ids FROM professional_specialties ps JOIN tenant_memberships m ON m.tenant_id=ps.tenant_id AND m.user_id=ps.professional_user_id AND m.status='active' JOIN users u ON u.id=ps.professional_user_id WHERE ps.tenant_id=$1 AND ps.public_booking_enabled AND EXISTS(SELECT 1 FROM professional_services pv WHERE pv.tenant_id=ps.tenant_id AND pv.professional_user_id=ps.professional_user_id AND pv.specialty_id=ps.specialty_id AND pv.public_booking_enabled) GROUP BY u.id,u.name ORDER BY u.name`,[tenant.id]),
          client.query(`SELECT p.id,p.name,p.duration_minutes,p.price,p.color,array_agg(DISTINCT pv.specialty_id) AS specialty_ids,array_agg(DISTINCT pv.professional_user_id) AS professional_ids FROM professional_services pv JOIN procedures p ON p.tenant_id=pv.tenant_id AND p.id=pv.procedure_id AND p.status='active' JOIN professional_specialties ps ON ps.tenant_id=pv.tenant_id AND ps.professional_user_id=pv.professional_user_id AND ps.specialty_id=pv.specialty_id AND ps.public_booking_enabled WHERE pv.tenant_id=$1 AND pv.public_booking_enabled GROUP BY p.id,p.name,p.duration_minutes,p.price,p.color ORDER BY p.name`,[tenant.id]),
        ]);
        return {
          clinic: tenant,
          portalEnabled: settings.patient_portal_enabled,
          booking: {
            autoConfirm: settings.booking_auto_confirm,
            minimumNoticeHours: settings.minimum_booking_notice_hours,
            cancellationNoticeHours: settings.cancellation_notice_hours,
            requireBirthDate: settings.require_birth_date,
            terms: settings.booking_terms,
          },
          units: units.rows,
          specialties: specialties.rows,
          professionals: professionals.rows,
          procedures: procedures.rows,
        };
      },
    );
  });
  app.get("/:slug/slots", async (request, reply) => {
    const { slug } = z
      .object({ slug: z.string().min(2) })
      .parse(request.params);
    const query = z
      .object({
        date: z.iso.date(),
        specialtyId: z.uuid(),
        professionalUserId: z.uuid().optional(),
        unitId: z.uuid(),
        procedureId: z.uuid(),
      })
      .parse(request.query);
    const tenant = await tenantBySlug(slug);
    if (!tenant) return reply.code(404).send({ error: "clinic_not_found" });
    return withTenant(
      {
        tenantId: tenant.id,
        userId: "00000000-0000-0000-0000-000000000000",
        requestId: request.id,
      },
      async (client) => {
        const settings = (await client.query<{minimum_booking_notice_hours:number}>("SELECT minimum_booking_notice_hours FROM tenant_communication_settings WHERE tenant_id=$1 AND online_booking_enabled", [tenant.id])).rows[0];
        if (!settings) return reply.code(404).send({ error: "online_booking_disabled" });
        const items=await calculatePublicSlots(client,{tenantId:tenant.id,date:query.date,specialtyId:query.specialtyId,procedureId:query.procedureId,unitId:query.unitId,professionalUserId:query.professionalUserId,minimumNoticeHours:settings.minimum_booking_notice_hours});
        return { items };
      },
    );
  });
  app.get("/:slug/availability",async(request,reply)=>{
    const{slug}=z.object({slug:z.string().min(2)}).parse(request.params);
    const query=z.object({from:z.iso.date(),specialtyId:z.uuid(),professionalUserId:z.uuid().optional(),unitId:z.uuid(),procedureId:z.uuid(),days:z.coerce.number().int().min(1).max(31).default(14)}).parse(request.query);
    const tenant=await tenantBySlug(slug);if(!tenant)return reply.code(404).send({error:"clinic_not_found"});
    return withTenant({tenantId:tenant.id,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{
      const settings=(await client.query<{minimum_booking_notice_hours:number}>("SELECT minimum_booking_notice_hours FROM tenant_communication_settings WHERE tenant_id=$1 AND online_booking_enabled",[tenant.id])).rows[0];
      if(!settings)return reply.code(404).send({error:"online_booking_disabled"});
      const dates:Array<{date:string;firstSlot:PublicSlot;count:number}>=[];
      const start=new Date(`${query.from}T12:00:00Z`);
      for(let index=0;index<query.days;index++){
        const date=new Date(start.getTime()+index*86400000).toISOString().slice(0,10);
        const slots=await calculatePublicSlots(client,{tenantId:tenant.id,date,specialtyId:query.specialtyId,procedureId:query.procedureId,unitId:query.unitId,professionalUserId:query.professionalUserId,minimumNoticeHours:settings.minimum_booking_notice_hours});
        if(slots[0])dates.push({date,firstSlot:slots[0],count:slots.length});
        if(dates.length>=7)break;
      }
      return{items:dates};
    });
  });
  app.post(
    "/:slug",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const { slug } = z
        .object({ slug: z.string().min(2) })
        .parse(request.params);
      const input = bookingInput.parse(request.body);
      const tenant = await tenantBySlug(slug);
      if (!tenant) return reply.code(404).send({ error: "clinic_not_found" });
      return withTenant(
        {
          tenantId: tenant.id,
          userId: "00000000-0000-0000-0000-000000000000",
          requestId: request.id,
        },
        async (client) => {
          const actor = (
            await client.query<{ user_id: string }>(
              "SELECT user_id FROM tenant_memberships WHERE tenant_id=$1 AND role IN('owner','admin') AND status='active' ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END LIMIT 1",
              [tenant.id],
            )
          ).rows[0];
          if (!actor)
            return reply.code(409).send({ error: "clinic_not_ready" });
          const settings = (
            await client.query<{ online_booking_enabled: boolean;booking_auto_confirm:boolean;minimum_booking_notice_hours:number;cancellation_notice_hours:number;require_birth_date:boolean;booking_terms:string }>(
              "SELECT online_booking_enabled,booking_auto_confirm,minimum_booking_notice_hours,cancellation_notice_hours,require_birth_date,booking_terms FROM tenant_communication_settings WHERE tenant_id=$1",
              [tenant.id],
            )
          ).rows[0];
          if (!settings?.online_booking_enabled)
            return reply.code(404).send({ error: "online_booking_disabled" });
          if (settings.require_birth_date && !input.birthDate)
            return reply.code(400).send({ error: "birth_date_required" });
          const service = await client.query("SELECT 1 FROM professional_services pv JOIN professional_specialties ps ON ps.tenant_id=pv.tenant_id AND ps.professional_user_id=pv.professional_user_id AND ps.specialty_id=pv.specialty_id JOIN specialties s ON s.tenant_id=pv.tenant_id AND s.id=pv.specialty_id WHERE pv.tenant_id=$1 AND pv.professional_user_id=$2 AND pv.specialty_id=$3 AND pv.procedure_id=$4 AND pv.public_booking_enabled AND ps.public_booking_enabled AND s.status='active'",[tenant.id,input.professionalUserId,input.specialtyId,input.procedureId]);
          if (!service.rows[0]) return reply.code(400).send({error:"professional_service_unavailable"});
          const procedure = (
            await client.query<{
              name: string;
              duration_minutes: number;
              price: string;
              professional_amount: string;
            }>(
              "SELECT name,duration_minutes,price,professional_amount FROM procedures WHERE tenant_id=$1 AND id=$2 AND status='active'",
              [tenant.id, input.procedureId],
            )
          ).rows[0];
          if (!procedure)
            return reply.code(400).send({ error: "procedure_not_found" });
          const startsAt = new Date(input.startsAt),
            endsAt = new Date(
              startsAt.getTime() + procedure.duration_minutes * 60000,
            );
          if (startsAt.getTime() < Date.now() + settings.minimum_booking_notice_hours * 3_600_000)
            return reply.code(409).send({ error: "minimum_booking_notice" });
          const available = await client.query(
            `SELECT
             EXISTS(
               SELECT 1
                 FROM professional_schedules s
                WHERE s.tenant_id=$1
                  AND s.professional_user_id=$2
                  AND s.unit_id=$5
                  AND s.status='active'
                  AND s.weekday=extract(dow FROM $3::timestamptz AT TIME ZONE (SELECT timezone FROM clinic_units WHERE tenant_id=$1 AND id=$5))
                  AND ($3::timestamptz AT TIME ZONE (SELECT timezone FROM clinic_units WHERE tenant_id=$1 AND id=$5))::time>=s.starts_at
                  AND ($4::timestamptz AT TIME ZONE (SELECT timezone FROM clinic_units WHERE tenant_id=$1 AND id=$5))::time<=s.ends_at
             )
             AND NOT EXISTS(
               SELECT 1 FROM appointments
                WHERE tenant_id=$1 AND professional_user_id=$2
                  AND starts_at<$4 AND ends_at>$3
                  AND status NOT IN('cancelled','no_show')
             )
             AND NOT EXISTS(
               SELECT 1 FROM schedule_blocks
                WHERE tenant_id=$1 AND professional_user_id=$2
                  AND (unit_id IS NULL OR unit_id=$5)
                  AND starts_at<$4 AND ends_at>$3
             ) AS ok`,
            [
              tenant.id,
              input.professionalUserId,
              startsAt,
              endsAt,
              input.unitId,
            ],
          );
          if (!available.rows[0]?.ok)
            return reply.code(409).send({ error: "slot_unavailable" });
          const normalized = normalizePhone(input.phone);
          let patient = (
            await client.query<{ id: string; full_name: string }>(
              `SELECT id,full_name FROM patients WHERE tenant_id=$1 AND status='active' AND
                ((regexp_replace(coalesce(phone,''),'\\D','','g') LIKE '%'||right($2,11) AND ($3::date IS NULL OR birth_date=$3))
                  OR ($4::citext IS NOT NULL AND email=$4)) ORDER BY updated_at DESC LIMIT 1`,
              [tenant.id, normalized, input.birthDate ?? null, input.email ?? null],
            )
          ).rows[0];
          if (!patient)
            patient = (
              await client.query<{ id: string; full_name: string }>(
                `INSERT INTO patients(tenant_id,full_name,birth_date,phone,email,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id,full_name`,
                [
                  tenant.id,
                  input.fullName,
                  input.birthDate ?? null,
                  input.phone,
                  input.email ?? null,
                  actor.user_id,
                ],
              )
            ).rows[0]!;
          const professional = (
            await client.query<{ name: string }>(
              "SELECT name FROM users WHERE id=$1",
              [input.professionalUserId],
            )
          ).rows[0];
          const appointment = (
            await client.query<{ id: string }>(
              `INSERT INTO appointments(tenant_id,unit_id,patient_id,professional_user_id,procedure_id,price_snapshot,professional_amount_snapshot,starts_at,ends_at,type,status,source,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$12,'online',$11,$11) RETURNING id`,
              [
                tenant.id,
                input.unitId,
                patient.id,
                input.professionalUserId,
                input.procedureId,
                procedure.price,
                procedure.professional_amount,
                startsAt,
                endsAt,
                procedure.name,
                actor.user_id,
                settings.booking_auto_confirm ? "confirmed" : "scheduled",
              ],
            )
          ).rows[0]!;
          const managementToken = randomBytes(32).toString("base64url");
          await client.query("INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,new_starts_at,metadata) VALUES($1,$2,'created','patient',$3,jsonb_build_object('source','online'))",[tenant.id,appointment.id,startsAt]);
          await client.query("INSERT INTO online_booking_consents(tenant_id,patient_id,appointment_id,terms_version,terms_text,ip_hash) VALUES($1,$2,$3,'2.2.0',$4,$5)", [tenant.id,patient.id,appointment.id,settings.booking_terms,createHash("sha256").update(request.ip).digest("hex")]);
          await client.query("INSERT INTO online_booking_tokens(tenant_id,appointment_id,patient_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5+interval '30 days')", [tenant.id,appointment.id,patient.id,secretHash(managementToken),startsAt]);
          await enqueueFhirSync(client, tenant.id, actor.user_id, "patient", patient.id);
          await enqueueFhirSync(client, tenant.id, actor.user_id, "appointment", appointment.id);
          reply.raw.once("finish", () => void processPendingFhirSync({tenantId:tenant.id,userId:actor.user_id,requestId:`${request.id}:online-booking`}).catch(()=>undefined));
          await enqueueAppointmentNotifications(client, {
            tenantId: tenant.id,
            patientId: patient.id,
            appointmentId: appointment.id,
            phone: input.phone,
            patientName: patient.full_name,
            clinicName: tenant.name,
            startsAt,
            professionalName: professional?.name ?? "Profissional",
          });
          return reply.code(201).send({
            appointmentId: appointment.id,
            startsAt,
            clinicName: tenant.name,
            status: settings.booking_auto_confirm ? "confirmed" : "awaiting_approval",
            managementToken,
          });
        },
      );
    },
  );

  app.get("/:slug/manage/:token", async (request, reply) => {
    const { slug,token }=z.object({slug:z.string().min(2),token:z.string().min(32)}).parse(request.params);
    const tenant=await tenantBySlug(slug);if(!tenant)return reply.code(404).send({error:"clinic_not_found"});
    return withTenant({tenantId:tenant.id,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{
      const result=await client.query(`SELECT a.id,a.starts_at,a.ends_at,a.type,a.status,a.professional_user_id,a.procedure_id,a.unit_id,u.name professional_name,cu.name unit_name,s.cancellation_notice_hours,s.minimum_booking_notice_hours,(SELECT pv.specialty_id FROM professional_services pv WHERE pv.tenant_id=a.tenant_id AND pv.professional_user_id=a.professional_user_id AND pv.procedure_id=a.procedure_id AND pv.public_booking_enabled LIMIT 1) specialty_id
        FROM online_booking_tokens bt JOIN appointments a ON a.tenant_id=bt.tenant_id AND a.id=bt.appointment_id
        JOIN users u ON u.id=a.professional_user_id JOIN clinic_units cu ON cu.tenant_id=a.tenant_id AND cu.id=a.unit_id
        JOIN tenant_communication_settings s ON s.tenant_id=a.tenant_id WHERE bt.tenant_id=$1 AND bt.token_hash=$2 AND bt.revoked_at IS NULL AND bt.expires_at>now()`,[tenant.id,secretHash(token)]);
      if(!result.rows[0])return reply.code(404).send({error:"booking_link_invalid"});return{clinic:tenant,appointment:result.rows[0]};
    });
  });

  app.get("/:slug/manage/:token/availability",async(request,reply)=>{
    const{slug,token}=z.object({slug:z.string().min(2),token:z.string().min(32)}).parse(request.params);const query=z.object({from:z.iso.date(),days:z.coerce.number().int().min(1).max(31).default(14)}).parse(request.query);
    const tenant=await tenantBySlug(slug);if(!tenant)return reply.code(404).send({error:"clinic_not_found"});
    return withTenant({tenantId:tenant.id,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{
      const current=(await client.query<{professional_user_id:string;procedure_id:string;unit_id:string;specialty_id:string;minimum_booking_notice_hours:number}>(`SELECT a.professional_user_id,a.procedure_id,a.unit_id,s.minimum_booking_notice_hours,(SELECT pv.specialty_id FROM professional_services pv WHERE pv.tenant_id=a.tenant_id AND pv.professional_user_id=a.professional_user_id AND pv.procedure_id=a.procedure_id AND pv.public_booking_enabled LIMIT 1) specialty_id FROM online_booking_tokens bt JOIN appointments a ON a.tenant_id=bt.tenant_id AND a.id=bt.appointment_id JOIN tenant_communication_settings s ON s.tenant_id=a.tenant_id WHERE bt.tenant_id=$1 AND bt.token_hash=$2 AND bt.revoked_at IS NULL AND bt.expires_at>now() AND a.status IN('scheduled','confirmed')`,[tenant.id,secretHash(token)])).rows[0];
      if(!current?.specialty_id)return reply.code(404).send({error:"booking_link_invalid"});
      const dates:Array<{date:string;items:PublicSlot[]}>=[];const start=new Date(`${query.from}T12:00:00Z`);
      for(let index=0;index<query.days;index++){const date=new Date(start.getTime()+index*86400000).toISOString().slice(0,10);const slots=await calculatePublicSlots(client,{tenantId:tenant.id,date,specialtyId:current.specialty_id,procedureId:current.procedure_id,unitId:current.unit_id,professionalUserId:current.professional_user_id,minimumNoticeHours:current.minimum_booking_notice_hours});if(slots.length)dates.push({date,items:slots});if(dates.length>=5)break;}
      return{items:dates};
    });
  });

  app.patch("/:slug/manage/:token/reschedule",async(request,reply)=>{
    const{slug,token}=z.object({slug:z.string().min(2),token:z.string().min(32)}).parse(request.params);const input=z.object({startsAt:z.iso.datetime({offset:true})}).parse(request.body);const tenant=await tenantBySlug(slug);if(!tenant)return reply.code(404).send({error:"clinic_not_found"});
    return withTenant({tenantId:tenant.id,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{
      const current=(await client.query<{id:string;starts_at:Date;duration_minutes:number;professional_user_id:string;unit_id:string;created_by:string;patient_id:string;phone:string|null;patient_name:string;professional_name:string;minimum_booking_notice_hours:number}>(`SELECT a.id,a.starts_at,p.duration_minutes,a.professional_user_id,a.unit_id,a.created_by,a.patient_id,pt.phone,pt.full_name patient_name,u.name professional_name,s.minimum_booking_notice_hours FROM online_booking_tokens bt JOIN appointments a ON a.tenant_id=bt.tenant_id AND a.id=bt.appointment_id JOIN procedures p ON p.tenant_id=a.tenant_id AND p.id=a.procedure_id JOIN patients pt ON pt.tenant_id=a.tenant_id AND pt.id=a.patient_id JOIN users u ON u.id=a.professional_user_id JOIN tenant_communication_settings s ON s.tenant_id=a.tenant_id WHERE bt.tenant_id=$1 AND bt.token_hash=$2 AND bt.revoked_at IS NULL AND bt.expires_at>now() AND a.status IN('scheduled','confirmed') AND a.starts_at>now()+(s.cancellation_notice_hours||' hours')::interval FOR UPDATE`,[tenant.id,secretHash(token)])).rows[0];
      if(!current)return reply.code(409).send({error:"appointment_not_reschedulable"});const startsAt=new Date(input.startsAt),endsAt=new Date(startsAt.getTime()+current.duration_minutes*60000);
      if(startsAt.getTime()<Date.now()+current.minimum_booking_notice_hours*3_600_000)return reply.code(409).send({error:"minimum_booking_notice"});
      const validSchedule=await client.query(`SELECT EXISTS(SELECT 1 FROM professional_schedules s JOIN clinic_units cu ON cu.tenant_id=s.tenant_id AND cu.id=s.unit_id WHERE s.tenant_id=$1 AND s.professional_user_id=$2 AND s.unit_id=$3 AND s.status='active' AND s.weekday=extract(dow FROM $4::timestamptz AT TIME ZONE cu.timezone) AND ($4::timestamptz AT TIME ZONE cu.timezone)::time>=s.starts_at AND ($5::timestamptz AT TIME ZONE cu.timezone)::time<=s.ends_at) ok`,[tenant.id,current.professional_user_id,current.unit_id,startsAt,endsAt]);if(!validSchedule.rows[0]?.ok)return reply.code(409).send({error:"slot_unavailable"});
      const conflict=await client.query("SELECT 1 FROM appointments WHERE tenant_id=$1 AND professional_user_id=$2 AND id<>$3 AND starts_at<$5 AND ends_at>$4 AND status NOT IN('cancelled','no_show') UNION ALL SELECT 1 FROM schedule_blocks WHERE tenant_id=$1 AND professional_user_id=$2 AND (unit_id IS NULL OR unit_id=$6) AND starts_at<$5 AND ends_at>$4 LIMIT 1",[tenant.id,current.professional_user_id,current.id,startsAt,endsAt,current.unit_id]);if(conflict.rows[0])return reply.code(409).send({error:"slot_unavailable"});
      await client.query("UPDATE appointments SET starts_at=$1,ends_at=$2,updated_by=$3 WHERE tenant_id=$4 AND id=$5",[startsAt,endsAt,current.created_by,tenant.id,current.id]);await client.query("UPDATE online_booking_tokens SET expires_at=$3+interval '30 days' WHERE tenant_id=$1 AND appointment_id=$2",[tenant.id,current.id,startsAt]);await client.query("UPDATE notification_jobs SET status='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND status='pending'",[tenant.id,current.id]);await client.query("INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,previous_starts_at,new_starts_at) VALUES($1,$2,'rescheduled','patient',$3,$4)",[tenant.id,current.id,current.starts_at,startsAt]);
      if(current.phone)await enqueueAppointmentNotifications(client,{tenantId:tenant.id,patientId:current.patient_id,appointmentId:current.id,phone:current.phone,patientName:current.patient_name,clinicName:tenant.name,startsAt,professionalName:current.professional_name});await enqueueFhirSync(client,tenant.id,current.created_by,"appointment",current.id);return{id:current.id,startsAt,status:"rescheduled"};
    });
  });

  app.patch("/:slug/manage/:token/cancel", async (request, reply) => {
    const { slug,token }=z.object({slug:z.string().min(2),token:z.string().min(32)}).parse(request.params);
    const input=z.object({reason:z.string().trim().min(3).max(500)}).parse(request.body);
    const tenant=await tenantBySlug(slug);if(!tenant)return reply.code(404).send({error:"clinic_not_found"});
    return withTenant({tenantId:tenant.id,userId:"00000000-0000-0000-0000-000000000000",requestId:request.id},async client=>{
      const result=await client.query(`UPDATE appointments a SET status='cancelled',cancellation_reason=$3 FROM online_booking_tokens bt,tenant_communication_settings s
        WHERE bt.tenant_id=$1 AND bt.token_hash=$2 AND bt.revoked_at IS NULL AND bt.expires_at>now() AND a.tenant_id=bt.tenant_id AND a.id=bt.appointment_id
        AND s.tenant_id=a.tenant_id AND a.starts_at>now()+(s.cancellation_notice_hours||' hours')::interval AND a.status IN('scheduled','confirmed') RETURNING a.id,a.created_by`,[tenant.id,secretHash(token),input.reason]);
      if(!result.rows[0])return reply.code(409).send({error:"appointment_not_cancellable"});
      await client.query("INSERT INTO appointment_events(tenant_id,appointment_id,event_type,actor_type,reason) VALUES($1,$2,'cancelled','patient',$3)",[tenant.id,result.rows[0].id,input.reason]);
      await client.query("UPDATE notification_jobs SET status='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND status='pending'",[tenant.id,result.rows[0].id]);
      await enqueueFhirSync(client,tenant.id,result.rows[0].created_by,"appointment",result.rows[0].id);
      reply.raw.once("finish",()=>void processPendingFhirSync({tenantId:tenant.id,userId:result.rows[0].created_by,requestId:`${request.id}:online-cancel`}).catch(()=>undefined));
      return{id:result.rows[0].id,status:"cancelled"};
    });
  });
}
