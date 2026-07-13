import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const finance = readFileSync("db/migrations/0005_finance.sql", "utf8");
const multiClinic = readFileSync("db/migrations/0006_multi_clinic_access.sql", "utf8");

describe("financeiro e administração multi-clínica", () => {
  it("isola lançamentos financeiros por tenant e não permite exclusão", () => {
    expect(finance).toContain("financial_transactions FORCE ROW LEVEL SECURITY");
    expect(finance).toContain("tenant_isolation_financial_transactions");
    expect(finance).toContain("REVOKE DELETE ON financial_transactions");
  });

  it("mantém integridade de status e pagamento", () => {
    expect(finance).toContain("status = 'paid' AND paid_at IS NOT NULL");
    expect(finance).toContain("amount > 0");
  });

  it("não expõe funções multi-clínica ao papel público", () => {
    expect(multiClinic).toContain("REVOKE ALL ON FUNCTION current_user_tenants() FROM PUBLIC");
    expect(multiClinic).toContain("SECURITY DEFINER SET search_path = public");
    expect(multiClinic).toContain("current_setting('app.user_id'");
  });
});
