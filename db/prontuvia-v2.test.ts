import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("db/migrations/0012_prontuvia_2_enterprise.sql","utf8");
const compose=readFileSync("compose.yaml","utf8");

describe("Prontuvia 2.0",()=>{
  it("inclui a fundação Medplum self-hosted",()=>{
    expect(compose).toContain("medplum-server:");
    expect(compose).toContain("medplum-postgres:");
    expect(compose).toContain("medplum-redis:");
    expect(compose).toContain("MEDPLUM_BASE_URL");
  });

  it("implementa os domínios das três fases",()=>{
    for(const table of ["tiss_guides","tiss_denials","tiss_appeals","fiscal_invoices","bank_statement_items","inventory_items","migration_jobs","ai_jobs","teleconsultations"]){
      expect(migration).toContain(`CREATE TABLE ${table}`);
      expect(migration).toContain(`'${table}'`);
    }
  });

  it("força isolamento RLS em todos os novos domínios",()=>{
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("current_setting(''app.tenant_id'',true)");
  });

  it("mantém filas de IA sob revisão humana",()=>{
    expect(migration).toContain("requires_human_review boolean NOT NULL DEFAULT true");
  });
});
