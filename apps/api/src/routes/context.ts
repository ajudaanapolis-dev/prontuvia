import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { withTenant } from "../db.js";

export async function contextRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", async (request) => withTenant(request.auth, async (client) => {
    const [tenant, units, professionals, procedures] = await Promise.all([
      client.query(`SELECT t.id,t.name,t.slug,
        jsonb_build_object('entityType',coalesce(p.entity_type,'clinic'),'displayName',coalesce(p.display_name,t.name),'legalName',p.legal_name,'professionalName',p.professional_name,'professionalRegistration',p.professional_registration,'documentHeaderNote',p.document_header_note,'onboardingStatus',coalesce(p.onboarding_status,'pending')) AS profile
        FROM tenants t LEFT JOIN tenant_profiles p ON p.tenant_id=t.id WHERE t.id=$1`, [request.auth.tenantId]),
      client.query(
        "SELECT id, name, timezone FROM clinic_units WHERE tenant_id = $1 AND status = 'active' ORDER BY name",
        [request.auth.tenantId],
      ),
      client.query(
        `SELECT u.id, u.name, m.role
           FROM tenant_memberships m
           JOIN users u ON u.id = m.user_id
          WHERE m.tenant_id = $1 AND m.status = 'active'
            AND m.role IN ('owner', 'admin', 'clinician')
          ORDER BY u.name`,
        [request.auth.tenantId],
      ),
      client.query("SELECT id,name,duration_minutes,price,professional_amount,color,tuss_code,automatic_receivable,status FROM procedures WHERE tenant_id=$1 AND status='active' ORDER BY name",[request.auth.tenantId]),
    ]);
    return { tenant: tenant.rows[0], units: units.rows, professionals: professionals.rows, procedures: procedures.rows };
  }));
}
