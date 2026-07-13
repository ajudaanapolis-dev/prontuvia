import argon2 from "argon2";
import pg from "pg";

const required = [
  "MIGRATION_DATABASE_URL",
  "BOOTSTRAP_TENANT_NAME",
  "BOOTSTRAP_ADMIN_NAME",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
] as const;

for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const slug = process.env.BOOTSTRAP_TENANT_NAME!.toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const passwordHash = await argon2.hash(process.env.BOOTSTRAP_ADMIN_PASSWORD!, {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
});

const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  const existing = await client.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [slug]);
  if (existing.rows[0]) {
    console.log(`bootstrap already completed for ${slug}`);
  } else {
  await client.query("BEGIN");
  const tenant = await client.query<{ id: string }>(
    "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
    [process.env.BOOTSTRAP_TENANT_NAME, slug],
  );
  const user = await client.query<{ id: string }>(
    "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id",
    [process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_NAME, passwordHash],
  );
  const tenantId = tenant.rows[0]!.id;
  const userId = user.rows[0]!.id;
  await client.query("SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)", [tenantId, userId]);
  await client.query(
    "INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')",
    [tenantId, userId],
  );
  const unit = await client.query<{id:string}>(
    "INSERT INTO clinic_units (tenant_id, name) VALUES ($1, 'Unidade principal') RETURNING id",
    [tenantId],
  );
  const unitId=unit.rows[0]!.id;
  await client.query("INSERT INTO tenant_profiles(tenant_id,entity_type,display_name,onboarding_status,onboarding_step,updated_by) VALUES($1,'clinic',$2,'completed',10,$3)",[tenantId,process.env.BOOTSTRAP_TENANT_NAME,userId]);
  await client.query("INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,billing_provider,trial_ends_at) VALUES($1,'professional','trialing','manual',now()+interval '30 days')",[tenantId]);
  await client.query("INSERT INTO legal_acceptances(tenant_id,user_id,terms_version,privacy_version) VALUES($1,$2,'2.0.0','2.0.0')",[tenantId,userId]);
  await client.query("INSERT INTO procedures(tenant_id,name,duration_minutes,price,professional_amount,color,automatic_receivable,created_by,updated_by) VALUES($1,'Consulta',30,0,0,'#2fb99d',true,$2,$2)",[tenantId,userId]);
  await client.query("INSERT INTO tenant_communication_settings(tenant_id,updated_by) VALUES($1,$2)",[tenantId,userId]);
  await client.query("INSERT INTO professional_schedules(tenant_id,professional_user_id,unit_id,weekday,starts_at,ends_at,created_by) SELECT $1,$2,$3,weekday,'08:00','18:00',$2 FROM generate_series(1,5) weekday",[tenantId,userId,unitId]);
  await client.query("INSERT INTO cost_centers(tenant_id,name,code) VALUES($1,'Unidade principal','UNIDADE-01')",[tenantId]);
  await client.query("INSERT INTO bank_accounts(tenant_id,name,opening_balance) VALUES($1,'Caixa principal',0)",[tenantId]);
  await client.query("INSERT INTO tiss_operators(tenant_id,name,ans_registry,tiss_version,status) VALUES($1,'Operadora demonstração','000000','4.01.00','active')",[tenantId]);
  await client.query("COMMIT");
  console.log("bootstrap completed");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
