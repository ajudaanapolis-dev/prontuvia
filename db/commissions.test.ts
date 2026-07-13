import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("db/migrations/0008_commissions_and_plan_catalog.sql","utf8");
describe("comissões e planos",()=>{
 it("preserva a taxa aplicada no momento do lançamento",()=>{expect(migration).toContain("commission_rate_snapshot");expect(migration).toContain("commission_amount");});
 it("controla repasses sem apagar o histórico",()=>{expect(migration).toContain("commission_status");expect(migration).toContain("commission_paid_at");});
 it("configura os três planos comerciais",()=>{expect(migration).toContain("price_monthly=99.00");expect(migration).toContain("price_monthly=199.00");expect(migration).toContain("prioritySupport");});
});
