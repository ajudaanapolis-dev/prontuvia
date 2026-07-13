import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { roles } from "@pep/security";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { writeAudit } from "../audit.js";
import { withTenant } from "../db.js";

const memberInput=z.object({name:z.string().trim().min(2).max(180),email:z.email().max(254).transform(v=>v.toLowerCase()),temporaryPassword:z.string().min(10).max(256),adminPassword:z.string().min(8).max(256),role:z.enum(roles)});
const memberUpdate=z.object({role:z.enum(roles).optional(),status:z.enum(["active","suspended","revoked"]).optional()}).refine(v=>v.role||v.status,{message:"Informe papel ou status"});
const clinicInput=z.object({name:z.string().trim().min(2).max(180),slug:z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)});

export async function adminRoutes(app:FastifyInstance):Promise<void>{
  app.addHook("preHandler",authenticate);
  app.get("/members",{preHandler:[requirePermission("users.manage")]},async request=>withTenant(request.auth,async client=>{
    const result=await client.query(`SELECT u.id,u.name,u.email,u.status AS user_status,m.role,m.status AS membership_status,m.created_at
      FROM tenant_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.name`,[request.auth.tenantId]);
    return {items:result.rows};
  }));
  app.post("/members",{preHandler:[requirePermission("users.manage")]},async(request,reply)=>{
    const input=memberInput.parse(request.body);
    return withTenant(request.auth,async client=>{
      const administrator=(await client.query<{password_hash:string}>("SELECT password_hash FROM users WHERE id=$1",[request.auth.userId])).rows[0];
      if(!administrator||!await argon2.verify(administrator.password_hash,input.adminPassword)) return reply.code(403).send({error:"administrator_password_invalid"});
      const plan=await client.query<{user_limit:number;professional_limit:number;receptionist_limit:number;active_users:string;active_professionals:string;active_receptionists:string}>(`SELECT (p.limits->>'users')::int AS user_limit,(p.limits->>'professionals')::int AS professional_limit,(p.limits->>'receptionists')::int AS receptionist_limit,
        count(*) FILTER(WHERE m.status='active')::text AS active_users,count(*) FILTER(WHERE m.status='active' AND m.role='clinician')::text AS active_professionals,count(*) FILTER(WHERE m.status='active' AND m.role='receptionist')::text AS active_receptionists
        FROM tenant_subscriptions s JOIN subscription_plans p ON p.code=s.plan_code LEFT JOIN tenant_memberships m ON m.tenant_id=s.tenant_id WHERE s.tenant_id=$1 GROUP BY p.limits`,[request.auth.tenantId]);
      const limits=plan.rows[0];
      if(limits&&Number(limits.active_users)>=limits.user_limit)return reply.code(409).send({error:"plan_user_limit_reached"});
      if(limits&&input.role==='clinician'&&Number(limits.active_professionals)>=limits.professional_limit)return reply.code(409).send({error:"plan_professional_limit_reached"});
      if(limits&&input.role==='receptionist'&&Number(limits.active_receptionists)>=limits.receptionist_limit)return reply.code(409).send({error:"plan_receptionist_limit_reached"});
      let user=(await client.query<{id:string}>("SELECT id FROM users WHERE email=$1",[input.email])).rows[0];
      let created=false;
      if(!user){const hash=await argon2.hash(input.temporaryPassword,{type:argon2.argon2id,memoryCost:65_536,timeCost:3,parallelism:1}); user=(await client.query<{id:string}>("INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id",[input.email,input.name,hash])).rows[0]!;created=true;}
      const exists=await client.query("SELECT 1 FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2",[request.auth.tenantId,user!.id]);
      if(exists.rows[0]) return reply.code(409).send({error:"membership_already_exists"});
      await client.query("INSERT INTO tenant_memberships(tenant_id,user_id,role,status,commission_rate) VALUES($1,$2,$3,'active',0)",[request.auth.tenantId,user!.id,input.role]);
      await writeAudit(client,{tenantId:request.auth.tenantId,actorUserId:request.auth.userId,action:"member.create",resourceType:"user",resourceId:user!.id,requestId:request.id,ip:request.ip,after:{role:input.role,created}});
      return reply.code(201).send({id:user!.id,created});
    });
  });
  app.patch("/members/:userId",{preHandler:[requirePermission("users.manage")]},async(request,reply)=>{
    const {userId}=z.object({userId:z.uuid()}).parse(request.params);const input=memberUpdate.parse(request.body);
    return withTenant(request.auth,async client=>{
      if(userId===request.auth.userId&&(input.status&&input.status!=="active")) return reply.code(409).send({error:"cannot_suspend_current_user"});
      const current=await client.query<{role:string;status:string}>("SELECT role,status FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2",[request.auth.tenantId,userId]);
      if(!current.rows[0]) return reply.code(404).send({error:"membership_not_found"});
      if(current.rows[0].role==='owner'&&input.role&&input.role!=='owner'){
        const count=await client.query<{count:string}>("SELECT count(*) FROM tenant_memberships WHERE tenant_id=$1 AND role='owner' AND status='active'",[request.auth.tenantId]);
        if(Number(count.rows[0]!.count)<=1) return reply.code(409).send({error:"last_owner_required"});
      }
      await client.query("UPDATE tenant_memberships SET role=coalesce($1,role),status=coalesce($2,status) WHERE tenant_id=$3 AND user_id=$4",[input.role??null,input.status??null,request.auth.tenantId,userId]);
      await writeAudit(client,{tenantId:request.auth.tenantId,actorUserId:request.auth.userId,action:"member.update",resourceType:"user",resourceId:userId,requestId:request.id,ip:request.ip,before:current.rows[0],after:input});
      return {userId};
    });
  });
  app.post("/clinics",{preHandler:[requirePermission("tenant.manage")]},async(request,reply)=>{
    const input=clinicInput.parse(request.body);
    return withTenant(request.auth,async client=>{
      try{const result=await client.query<{id:string}>("SELECT create_tenant_for_current_owner($1,$2) AS id",[input.name,input.slug]);return reply.code(201).send({id:result.rows[0]!.id});}
      catch(error){if((error as {code?:string}).code==='23505') return reply.code(409).send({error:"clinic_slug_exists"});throw error;}
    });
  });
}
