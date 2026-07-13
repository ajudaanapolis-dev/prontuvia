import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "db/migrations/0001_foundation.sql"), "utf8");
const runtimeRole = readFileSync(resolve(process.cwd(), "db/init/00_runtime_role.sql"), "utf8");

describe("database security invariants", () => {
  it("forces RLS on every clinical domain table", () => {
    const tables = [
      "tenant_memberships",
      "clinic_units",
      "patients",
      "appointments",
      "encounters",
      "clinical_notes",
      "clinical_note_addenda",
      "clinical_documents",
      "audit_events",
    ];
    for (const table of tables) {
      expect(migration).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`);
    }
  });

  it("protects finalized records and audit history at database level", () => {
    expect(migration).toContain("finalized clinical notes are immutable; create an addendum");
    expect(migration).toContain("CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE");
    expect(migration).toContain("CREATE TRIGGER addenda_append_only BEFORE UPDATE OR DELETE");
  });

  it("uses a runtime role that cannot bypass RLS", () => {
    expect(runtimeRole).toContain("NOSUPERUSER");
    expect(runtimeRole).toContain("NOCREATEROLE");
    expect(runtimeRole).toContain("NOBYPASSRLS");
  });

  it("binds patient and appointment references to the same tenant", () => {
    expect(migration).toContain("FOREIGN KEY (tenant_id, patient_id) REFERENCES patients(tenant_id, id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, unit_id) REFERENCES clinic_units(tenant_id, id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, professional_user_id) REFERENCES tenant_memberships(tenant_id, user_id)");
  });
});
