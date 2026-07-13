import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "db/migrations/0011_communications_booking_portal.sql",
  ),
  "utf8",
);

describe("communication and patient access migration", () => {
  it("isolates communication, portal codes and sessions by clinic", () => {
    for (const table of [
      "tenant_communication_settings",
      "notification_jobs",
      "patient_portal_access_codes",
      "patient_portal_sessions",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
      );
      expect(migration).toContain(`ON ${table} USING(tenant_id=`);
    }
  });

  it("stores only hashed portal codes and session tokens", () => {
    expect(migration).toContain("code_hash char(64) NOT NULL");
    expect(migration).toContain("token_hash char(64) NOT NULL UNIQUE");
    expect(migration).not.toContain("code_plaintext");
  });

  it("preconfigures digital access for newly purchased clinics", () => {
    expect(migration).toContain(
      "INSERT INTO tenant_communication_settings(tenant_id,updated_by) VALUES(new_id,owner_id)",
    );
    expect(migration).toContain(
      "online_booking_enabled boolean NOT NULL DEFAULT true",
    );
    expect(migration).toContain(
      "patient_portal_enabled boolean NOT NULL DEFAULT true",
    );
    expect(migration).toContain("generate_series(1,5)");
  });

  it("tracks appointment origin and a durable notification queue", () => {
    expect(migration).toContain("source text NOT NULL DEFAULT 'staff'");
    expect(migration).toContain("appointment_confirmation");
    expect(migration).toContain("appointment_reminder");
    expect(migration).toContain("portal_access_code");
  });
});
