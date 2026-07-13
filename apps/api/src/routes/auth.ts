import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, createSession, SESSION_COOKIE, setSessionCookie } from "../auth.js";
import { pool, withTenant } from "../db.js";
import type { Role } from "@pep/security";
import { writeAudit } from "../audit.js";

const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
  tenantSlug: z.string().min(2).max(80),
});
const switchSchema=z.object({tenantId:z.uuid()});
const changePasswordSchema=z.object({currentPassword:z.string().min(8).max(256),newPassword:z.string().min(10).max(256)}).refine(value=>value.currentPassword!==value.newPassword,{path:["newPassword"],message:"A nova senha deve ser diferente da atual"});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", {
    config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const account = await pool.query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      status: string;
      locked_until: Date | null;
    }>(
      "SELECT id, email, name, password_hash, status, locked_until FROM users WHERE email = $1",
      [input.email],
    );
    const tenant = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM tenants WHERE slug = $1 AND status = 'active'",
      [input.tenantSlug],
    );
    const user = account.rows[0];
    const selectedTenant = tenant.rows[0];

    if (!user || !selectedTenant || user.status !== "active" || (user.locked_until && user.locked_until > new Date())) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const passwordValid = await argon2.verify(user.password_hash, input.password);
    if (!passwordValid) {
      await pool.query(
        `UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
         WHERE id = $1`,
        [user.id],
      );
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const membership = await withTenant(
      { tenantId: selectedTenant.id, userId: user.id, requestId: request.id },
      async (client) => {
        const result = await client.query<{ role: Role }>(
          "SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'",
          [selectedTenant.id, user.id],
        );
        return result.rows[0];
      },
    );
    if (!membership) return reply.code(401).send({ error: "invalid_credentials" });

    await pool.query("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
    const session = await createSession({
      userId: user.id,
      tenantId: selectedTenant.id,
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    setSessionCookie(reply, session.token, session.expiresAt);
    return reply.send({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: selectedTenant.id, name: selectedTenant.name },
      tenantId: selectedTenant.id,
      role: membership.role,
    });
  });

  app.post("/logout", { preHandler: [authenticate] }, async (request, reply) => {
    await pool.query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [request.auth.sessionId]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: [authenticate] }, async (request) => ({
    user: { id: request.auth.userId, email: request.auth.email, name: request.auth.name },
    tenantId: request.auth.tenantId,
    role: request.auth.role,
  }));

  app.get("/tenants",{preHandler:[authenticate]},async request=>{
    const client=await pool.connect();
    try{await client.query("BEGIN");await client.query("SELECT set_config('app.user_id',$1,true)",[request.auth.userId]);const result=await client.query("SELECT * FROM current_user_tenants()");await client.query("COMMIT");return {items:result.rows};}
    catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  });

  app.post("/switch-tenant",{preHandler:[authenticate]},async(request,reply)=>{
    const input=switchSchema.parse(request.body);
    const membership=await withTenant({tenantId:input.tenantId,userId:request.auth.userId,requestId:request.id},async client=>(await client.query<{role:Role}>("SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 AND status='active'",[input.tenantId,request.auth.userId])).rows[0]);
    if(!membership)return reply.code(403).send({error:"membership_inactive"});
    await pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1",[request.auth.sessionId]);
    const session=await createSession({userId:request.auth.userId,tenantId:input.tenantId,userAgent:request.headers["user-agent"],ip:request.ip});
    setSessionCookie(reply,session.token,session.expiresAt);
    return {tenantId:input.tenantId,role:membership.role};
  });

  app.post("/change-password",{preHandler:[authenticate],config:{rateLimit:{max:5,timeWindow:"15 minutes"}}},async(request,reply)=>{
    const input=changePasswordSchema.parse(request.body);
    const account=await pool.query<{password_hash:string}>("SELECT password_hash FROM users WHERE id=$1 AND status='active'",[request.auth.userId]);
    const current=account.rows[0];
    if(!current||!await argon2.verify(current.password_hash,input.currentPassword)) return reply.code(400).send({error:"current_password_invalid"});
    const passwordHash=await argon2.hash(input.newPassword,{type:argon2.argon2id,memoryCost:65_536,timeCost:3,parallelism:1});
    await pool.query("UPDATE users SET password_hash=$1,password_changed_at=now(),failed_login_attempts=0,locked_until=NULL WHERE id=$2",[passwordHash,request.auth.userId]);
    await pool.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",[request.auth.userId,request.auth.sessionId]);
    await withTenant(request.auth,async client=>writeAudit(client,{tenantId:request.auth.tenantId,actorUserId:request.auth.userId,action:"user.password_change",resourceType:"user",resourceId:request.auth.userId,requestId:request.id,ip:request.ip,after:{otherSessionsRevoked:true}}));
    return reply.code(204).send();
  });
}
