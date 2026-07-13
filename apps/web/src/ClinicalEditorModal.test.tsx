import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClinicalEditorModal, type ClinicalEditorState } from "./ClinicalEditorModal";

const editor: ClinicalEditorState = {
  patientId: "patient",
  patientName: "Paciente de Teste",
  patientBirthDate: "1990-03-26",
  patientPhone: "(62) 99999-0000",
  patientAlerts: ["Alergia de teste"],
  encounterId: "encounter",
  noteId: "note",
  updatedAt: new Date().toISOString(),
  content: {
    chiefComplaint: "", historyPresentIllness: "", subjective: "", objective: "",
    medicalHistory: "", familyHistory: "", medicationsInUse: "", allergies: "",
    bloodPressure: "", heartRate: "", respiratoryRate: "", temperature: "",
    oxygenSaturation: "", weight: "", height: "", assessment: "", diagnosisCid: "", diagnosisCid11: "",
    diagnosisDescription: "", classificationMappingNote: "", plan: "", prescriptions: "", examRequests: "", returnInstructions: "",
  },
};

describe("ClinicalEditorModal", () => {
  it("renders an in-progress appointment without crashing", () => {
    const html = renderToStaticMarkup(<ClinicalEditorModal editor={editor} setEditor={() => undefined} save={async () => undefined} finalize={async () => undefined} close={() => undefined} />);
    expect(html).toContain("Paciente de Teste");
    expect(html).toContain("Consulta e anamnese");
    expect(html).toContain("Queixa principal");
    expect(html).toContain("Sinais vitais");
    expect(html).toContain("Exame físico");
    expect(html).not.toContain("Sinais vitais e exame");
  });
});
