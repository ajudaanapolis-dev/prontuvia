import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "prontuvia-api",
});

export type DbClient = pg.PoolClient;

export type TenantContext = {
  tenantId: string;
  userId: string;
  requestId: string;
};

export async function withTenant<T>(
  context: TenantContext,
  operation: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), set_config('app.request_id', $3, true)",
      [context.tenantId, context.userId, context.requestId],
    );
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
