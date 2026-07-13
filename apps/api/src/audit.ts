import { createHash } from "node:crypto";
import type { DbClient } from "./db.js";

type AuditInput = {
  tenantId: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId: string;
  ip?: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(client: DbClient, input: AuditInput): Promise<void> {
  const ipHash = input.ip
    ? createHash("sha256").update(input.ip).digest("hex")
    : null;

  await client.query(
    `INSERT INTO audit_events
      (tenant_id, actor_user_id, action, resource_type, resource_id, request_id, ip_hash, before_json, after_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.tenantId,
      input.actorUserId,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.requestId,
      ipHash,
      input.before ?? null,
      input.after ?? null,
    ],
  );
}
