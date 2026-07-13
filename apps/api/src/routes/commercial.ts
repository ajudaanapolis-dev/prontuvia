import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, createSession, setSessionCookie } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { config } from "../config.js";
import { pool, withTenant } from "../db.js";
import { writeAudit } from "../audit.js";
import { createHash, timingSafeEqual } from "node:crypto";

const signupInput=z.object({
  name:z.string().trim().min(2).max(180),email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(10).max(256),
  displayName:z.string().trim().min(2).max(180),slug:z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  entityType:z.enum(["clinic","individual"]),planCode:z.enum(["essential","professional","clinic"]),acceptTerms:z.literal(true),
});
const profileInput=z.object({displayName:z.string().trim().min(2).max(180),entityType:z.enum(["clinic","individual"]),legalName:z.string().trim().max(180).optional(),professionalName:z.string().trim().max(180).optional(),professionalRegistration:z.string().trim().max(100).optional(),documentHeaderNote:z.string().trim().max(300).optional(),onboardingStatus:z.enum(["pending","in_progress","completed"]).default("completed")});

export async function commercialRoutes(app:FastifyInstance):Promise<void>{
  app.get("/plans",async()=>{const result=await pool.query("SELECT code,name,description,price_monthly,trial_days,limits,features FROM subscription_plans WHERE status='active' ORDER BY CASE code WHEN 'essential' THEN 1 WHEN 'professional' THEN 2 ELSE 3 END");return{items:result.rows};});
  app.post("/signup",{config:{rateLimit:{max:5,timeWindow:"1 hour"}}},async(request,reply)=>{
    const input=signupInput.parse(request.body);const client=await pool.connect();
    try{await client.query("BEGIN");const exists=await client.query("SELECT 1 FROM users WHERE email=$1",[input.email]);if(exists.rows[0]){await client.query("ROLLBACK");return reply.code(409).send({error:"email_already_registered"});}
      const hash=await argon2.hash(input.password,{type:argon2.argon2id,memoryCost:65_536,timeCost:3,parallelism:1});const user=await client.query<{id:string}>("INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id",[input.email,input.name,hash]);
      const provision=await client.query<{tenant_id:string}>("SELECT provision_trial_tenant($1,$2,$3,$4,$5) AS tenant_id",[user.rows[0]!.id,input.displayName,input.slug,input.planCode,input.entityType]);await client.query("COMMIT");
      const tenantId=provision.rows[0]!.tenant_id;const session=await createSession({userId:user.rows[0]!.id,tenantId,userAgent:request.headers["user-agent"],ip:request.ip});setSessionCookie(reply,session.token,session.expiresAt);
      return reply.code(201).send({user:{id:user.rows[0]!.id,email:input.email,name:input.name},tenantId,role:"owner",trial:true});
    }catch(error){await client.query("ROLLBACK");if((error as{code?:string}).code==='23505')return reply.code(409).send({error:"clinic_slug_exists"});throw error;}finally{client.release();}
  });
  app.get("/subscription",{preHandler:[authenticate]},async request=>withTenant(request.auth,async client=>{
    const result=await client.query(`SELECT s.status,s.billing_provider,s.trial_ends_at,s.current_period_ends_at,p.code AS plan_code,p.name AS plan_name,p.price_monthly,p.limits,p.features FROM tenant_subscriptions s JOIN subscription_plans p ON p.code=s.plan_code WHERE s.tenant_id=$1`,[request.auth.tenantId]);return{subscription:result.rows[0]??null,billing:{provider:config.BILLING_PROVIDER,environment:config.ASAAS_ENVIRONMENT,configured:config.BILLING_PROVIDER==='asaas'&&Boolean(config.ASAAS_API_KEY&&config.ASAAS_WEBHOOK_TOKEN)}};
  }));
  app.put("/profile",{preHandler:[authenticate,requirePermission("tenant.manage")]},async(request)=>{const input=profileInput.parse(request.body);return withTenant(request.auth,async client=>{const before=(await client.query("SELECT * FROM tenant_profiles WHERE tenant_id=$1",[request.auth.tenantId])).rows[0];await client.query(`INSERT INTO tenant_profiles(tenant_id,entity_type,display_name,legal_name,professional_name,professional_registration,document_header_note,onboarding_status,onboarding_step,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,10,$9) ON CONFLICT(tenant_id) DO UPDATE SET entity_type=excluded.entity_type,display_name=excluded.display_name,legal_name=excluded.legal_name,professional_name=excluded.professional_name,professional_registration=excluded.professional_registration,document_header_note=excluded.document_header_note,onboarding_status=excluded.onboarding_status,onboarding_step=10,updated_by=excluded.updated_by`,[request.auth.tenantId,input.entityType,input.displayName,input.legalName??null,input.professionalName??null,input.professionalRegistration??null,input.documentHeaderNote??null,input.onboardingStatus,request.auth.userId]);await client.query("UPDATE tenants SET name=$1 WHERE id=$2",[input.displayName,request.auth.tenantId]);await writeAudit(client,{tenantId:request.auth.tenantId,actorUserId:request.auth.userId,action:"tenant.profile_update",resourceType:"tenant",resourceId:request.auth.tenantId,requestId:request.id,ip:request.ip,before,after:input});return{updated:true};});});
  app.post("/checkout",{preHandler:[authenticate,requirePermission("tenant.manage")]},async(request,reply)=>{if(config.BILLING_PROVIDER!=='asaas'||!config.ASAAS_API_KEY||!config.ASAAS_WEBHOOK_TOKEN)return reply.code(503).send({error:"billing_not_configured",message:"Configure o Sandbox Asaas antes de habilitar o checkout."});return reply.code(501).send({error:"billing_activation_pending",message:"Adaptador Asaas configurado. Ative os preços e homologue o checkout no Sandbox antes da produção."});});
  app.post("/webhooks/asaas",async(request,reply)=>{if(!config.ASAAS_WEBHOOK_TOKEN)return reply.code(503).send({error:"billing_not_configured"});const received=String(request.headers["asaas-access-token"]??"");const expected=Buffer.from(config.ASAAS_WEBHOOK_TOKEN);const actual=Buffer.from(received);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return reply.code(401).send({error:"invalid_webhook_token"});const payload=z.object({id:z.string().min(1),event:z.string().min(1)}).passthrough().parse(request.body);const hash=createHash("sha256").update(JSON.stringify(request.body)).digest("hex");const result=await pool.query("INSERT INTO billing_webhook_events(provider,event_id,event_type,payload_hash,processed_at) VALUES('asaas',$1,$2,$3,now()) ON CONFLICT DO NOTHING RETURNING event_id",[payload.id,payload.event,hash]);return reply.code(result.rows[0]?200:202).send({received:true,duplicate:!result.rows[0]});});
}
