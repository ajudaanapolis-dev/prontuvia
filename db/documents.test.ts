import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("db/migrations/0002_clinical_document_records.sql", "utf8");
const declarationMigration = readFileSync("db/migrations/0004_document_declaration.sql", "utf8");

describe("clinical document records migration", () => {
  it("isolates documents by tenant and makes them append-only", () => {
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("tenant_isolation_clinical_document_records");
    expect(migration).toContain("clinical_document_records_append_only");
    expect(migration).toContain("prevent_mutation()");
    expect(migration).toContain("REVOKE UPDATE, DELETE");
  });

  it("binds documents to patients, authors and optional encounters", () => {
    expect(migration).toContain("FOREIGN KEY (tenant_id, patient_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, encounter_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, author_user_id)");
  });

  it("separates medical certificates from attendance declarations", () => {
    expect(declarationMigration).toContain("'certificate', 'declaration'");
    expect(declarationMigration).toContain("clinical_document_records_category_check");
  });
});
