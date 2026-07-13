import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration=readFileSync("db/migrations/0007_commercial_onboarding.sql","utf8");
describe("onboarding comercial",()=>{
 it("provisiona tenant, proprietário, unidade, perfil e assinatura",()=>{for(const value of ["INSERT INTO tenants","INSERT INTO tenant_memberships","INSERT INTO clinic_units","INSERT INTO tenant_profiles","INSERT INTO tenant_subscriptions"])expect(migration).toContain(value);});
 it("registra aceite legal e isola dados comerciais",()=>{expect(migration).toContain("INSERT INTO legal_acceptances");expect(migration).toContain("tenant_isolation_tenant_profiles");expect(migration).toContain("tenant_isolation_tenant_subscriptions");});
 it("mantém webhooks idempotentes",()=>{expect(migration).toContain("PRIMARY KEY(provider,event_id)");});
});
