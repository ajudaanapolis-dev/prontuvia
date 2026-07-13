import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("apps/web/src/App.tsx", "utf8");

describe("fluxo do cadastro de pacientes", () => {
  it("fecha o modal antes de recarregar a lista", () => {
    const close = app.indexOf("setShowPatientForm(false)", app.indexOf("const submitPatient"));
    const reload = app.indexOf("await loadPatients().catch", app.indexOf("const submitPatient"));
    expect(close).toBeGreaterThan(0);
    expect(reload).toBeGreaterThan(close);
  });

  it("impede envio duplicado e informa salvamento", () => {
    expect(app).toContain("if (savingPatient) return");
    expect(app).toContain('saving ? "Salvando..."');
  });
});
