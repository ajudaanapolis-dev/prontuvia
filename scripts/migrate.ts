import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const migrationsDirectory = resolve(process.cwd(), "db/migrations");

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (exists.rowCount) continue;
    const sql = await readFile(resolve(migrationsDirectory, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      console.log(`applied ${file}`);
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
