import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { requirePermission } from "../authorization.js";
import { withTenant } from "../db.js";

const operationalQuery = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  professionalUserId: z.uuid().optional(),
}).refine((value) => value.to >= value.from, {
  message: "A data final deve ser igual ou posterior à inicial",
  path: ["to"],
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/operational", { preHandler: [requirePermission("reports.operational.read")] }, async (request) => {
    const query = operationalQuery.parse(request.query);
    return withTenant(request.auth, async (client) => {
      const professionalScope = request.auth.role === "clinician"
        ? request.auth.userId
        : query.professionalUserId ?? null;

      const parameters = [request.auth.tenantId, query.from, query.to, professionalScope];
      const scope = `a.tenant_id=$1
        AND a.starts_at >= $2::date
        AND a.starts_at < ($3::date + interval '1 day')
        AND ($4::uuid IS NULL OR a.professional_user_id=$4)`;

      const [summary, byDay, byProfessional] = await Promise.all([
        client.query(`SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE a.status='scheduled')::int AS scheduled,
          count(*) FILTER (WHERE a.status='confirmed')::int AS confirmed,
          count(*) FILTER (WHERE a.status='waiting')::int AS waiting,
          count(*) FILTER (WHERE a.status='in_progress')::int AS in_progress,
          count(*) FILTER (WHERE a.status='completed')::int AS completed,
          count(*) FILTER (WHERE a.status='cancelled')::int AS cancelled,
          count(*) FILTER (WHERE a.status='no_show')::int AS no_show,
          count(DISTINCT a.patient_id)::int AS unique_patients,
          coalesce(round(avg(extract(epoch FROM (a.ends_at-a.starts_at))/60)),0)::int AS average_duration_minutes
        FROM appointments a WHERE ${scope}`, parameters),
        client.query(`SELECT
          to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS date,
          count(*)::int AS total,
          count(*) FILTER (WHERE a.status='completed')::int AS completed,
          count(*) FILTER (WHERE a.status='cancelled')::int AS cancelled,
          count(*) FILTER (WHERE a.status='no_show')::int AS no_show
        FROM appointments a WHERE ${scope}
        GROUP BY 1 ORDER BY 1`, parameters),
        client.query(`SELECT
          a.professional_user_id,
          u.name AS professional_name,
          count(*)::int AS total,
          count(*) FILTER (WHERE a.status='completed')::int AS completed,
          count(*) FILTER (WHERE a.status='cancelled')::int AS cancelled,
          count(*) FILTER (WHERE a.status='no_show')::int AS no_show,
          coalesce(round(avg(extract(epoch FROM (a.ends_at-a.starts_at))/60)),0)::int AS average_duration_minutes
        FROM appointments a
        JOIN users u ON u.id=a.professional_user_id
        WHERE ${scope}
        GROUP BY a.professional_user_id,u.name
        ORDER BY total DESC,u.name`, parameters),
      ]);

      return {
        scope: professionalScope ? "professional" : "clinic",
        period: { from: query.from, to: query.to },
        summary: summary.rows[0],
        byDay: byDay.rows,
        byProfessional: byProfessional.rows,
      };
    });
  });
}
