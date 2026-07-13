import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { pool, withTenant } from "./db.js";
import type { Role } from "@pep/security";

export const SESSION_COOKIE = "pep_session";

export type AuthSession = {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
  name: string;
  requestId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthSession;
  }
}

function tokenHash(token: string): string {
  return createHash("sha256")
    .update(`${config.SESSION_PEPPER}:${token}`)
    .digest("hex");
}

export async function createSession(input: {
  userId: string;
  tenantId: string;
  userAgent?: string;
  ip?: string;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, tenant_id, token_hash, expires_at, user_agent, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.userId,
      input.tenantId,
      tokenHash(token),
      expiresAt,
      input.userAgent ?? null,
      input.ip ? createHash("sha256").update(input.ip).digest("hex") : null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Session creation failed");
  return { id: row.id, token, expiresAt };
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    signed: true,
    expires: expiresAt,
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const signedValue = request.cookies[SESSION_COOKIE];
  if (!signedValue) return reply.code(401).send({ error: "authentication_required" });
  const unsigned = request.unsignCookie(signedValue);
  if (!unsigned.valid || !unsigned.value) {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(401).send({ error: "invalid_session" });
  }

  const result = await pool.query<{
    session_id: string;
    user_id: string;
    tenant_id: string;
    email: string;
    name: string;
  }>(
    `SELECT s.id AS session_id, s.user_id, s.tenant_id, u.email, u.name
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.status = 'active'
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [tokenHash(unsigned.value)],
  );
  const row = result.rows[0];
  if (!row) {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(401).send({ error: "session_expired" });
  }
  const membership = await withTenant(
    { tenantId: row.tenant_id, userId: row.user_id, requestId: request.id },
    async (client) => {
      const membershipResult = await client.query<{ role: Role }>(
        `SELECT role FROM tenant_memberships
          WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
        [row.tenant_id, row.user_id],
      );
      return membershipResult.rows[0];
    },
  );
  if (!membership) {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(401).send({ error: "membership_inactive" });
  }
  request.auth = {
    sessionId: row.session_id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: membership.role,
    email: row.email,
    name: row.name,
    requestId: request.id,
  };
}
