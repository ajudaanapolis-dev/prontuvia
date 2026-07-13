import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "db/migrations/0009_clinic_operations.sql"), "utf8");
const fixedPayoutMigration = readFileSync(resolve(process.cwd(), "db/migrations/0010_fixed_procedure_payout.sql"), "utf8");

describe("clinic operations migration", () => {
  it("isolates procedures, schedules and blocks by tenant", () => {
    for (const table of ["procedures", "professional_schedules", "schedule_blocks"]) {
      expect(migration).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`tenant_isolation_${table}`);
    }
  });

  it("prevents duplicate active receivables for one appointment", () => {
    expect(migration).toContain("financial_transactions_appointment_income_unique");
    expect(migration).toContain("WHERE kind='income' AND appointment_id IS NOT NULL AND status<>'cancelled'");
  });

  it("provisions a default procedure for new trial clinics", () => {
    expect(migration).toContain("INSERT INTO procedures");
    expect(migration).toContain("'Consulta',30,0,'#2fb99d'");
  });

  it("stores a fixed professional payout on both procedure and appointment", () => {
    expect(fixedPayoutMigration).toContain("ADD COLUMN professional_amount");
    expect(fixedPayoutMigration).toContain("ADD COLUMN professional_amount_snapshot");
    expect(fixedPayoutMigration).toContain("professional_amount <= price");
    expect(fixedPayoutMigration).toContain("professional_amount_snapshot <= price_snapshot");
  });
});
