import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type Permission } from "@pep/security";

export function requirePermission(permission: Permission) {
  return async function permissionGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!hasPermission(request.auth.role, permission)) {
      return reply.code(403).send({ error: "permission_denied", permission });
    }
  };
}
