import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { withTenant } from "../db.js";

const auditQuery = z.object({
  resourceType: z.string().max(100).optional(),
  resourceId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);
  app.get("/", { preHandler: [requirePermission("security.audit.read")] }, async (request) => {
    const query = auditQuery.parse(request.query);
    return withTenant(request.auth, async (client) => {
      const result = await client.query(
        `SELECT id, actor_user_id, action, resource_type, resource_id, request_id, created_at
           FROM audit_events
          WHERE tenant_id = $1
            AND ($2::text IS NULL OR resource_type = $2)
            AND ($3::uuid IS NULL OR resource_id = $3)
          ORDER BY created_at DESC LIMIT $4`,
        [request.auth.tenantId, query.resourceType ?? null, query.resourceId ?? null, query.limit],
      );
      return { items: result.rows };
    });
  });
}
