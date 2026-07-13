import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("db/migrations/0003_waitlist.sql", "utf8");

describe("lista de espera", () => {
  it("isola os registros por clínica", () => {
    expect(migration).toContain("ALTER TABLE appointment_waitlist FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("tenant_isolation_appointment_waitlist");
  });

  it("vincula paciente, unidade e profissional ao mesmo tenant", () => {
    expect(migration).toContain("FOREIGN KEY (tenant_id, patient_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, unit_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, professional_user_id)");
  });
});
