import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("db/migrations/0013_fhir_clinical_bridge.sql", "utf8");
const bridge = readFileSync("apps/api/src/fhir-sync.ts", "utf8");
const patientRoutes = readFileSync("apps/api/src/routes/patients.ts", "utf8");
const appointmentRoutes = readFileSync("apps/api/src/routes/appointments.ts", "utf8");
const recordRoutes = readFileSync("apps/api/src/routes/records.ts", "utf8");
const documentRoutes = readFileSync("apps/api/src/routes/documents.ts", "utf8");

describe("ponte clínica FHIR", () => {
  it("mantém vínculos idempotentes e uma fila durável isolada por clínica", () => {
    expect(migration).toContain("CREATE TABLE fhir_resource_links");
    expect(migration).toContain("CREATE TABLE fhir_sync_jobs");
    expect(migration).toContain("logical_key text NOT NULL");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("tenant_isolation_fhir_sync_jobs");
  });

  it("mapeia o ciclo clínico para os recursos FHIR vendáveis", () => {
    for (const resource of [
      "Patient", "Appointment", "Encounter", "Composition", "Condition",
      "AllergyIntolerance", "MedicationRequest", "ServiceRequest", "DocumentReference", "Provenance",
    ]) expect(bridge).toContain(`resourceType: \"${resource}\"`);
  });

  it("enfileira automaticamente cada ponto do fluxo local", () => {
    expect(patientRoutes).toContain('"patient", id');
    expect(appointmentRoutes).toContain('"appointment", id');
    expect(recordRoutes).toContain('"encounter", encounterId');
    expect(documentRoutes).toContain('"document", document.id');
  });

  it("faz retentativa exponencial e não bloqueia a operação local", () => {
    expect(bridge).toContain("next_attempt_at");
    expect(bridge).toContain("2 ** Math.min");
    expect(bridge).toContain("ON CONFLICT");
    expect(bridge).toContain("SAVEPOINT enqueue_fhir_sync");
    expect(bridge).toContain("ROLLBACK TO SAVEPOINT enqueue_fhir_sync");
  });

  it("não usa parâmetro identifier incompatível ao sincronizar Provenance", () => {
    expect(bridge).toContain('resource.resourceType !== "Provenance"');
    expect(bridge).toContain("supportsIdentifierSearch");
    expect(bridge).toContain('searchOne("Provenance", { target })');
  });
});
