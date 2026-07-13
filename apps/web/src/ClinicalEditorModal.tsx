import { useState } from "react";
import { ClassificationPicker } from "./ClassificationPicker";
import { formatExactAge } from "./age";
import { EncounterDocuments } from "./EncounterDocuments";

export type ClinicalContent = {
  chiefComplaint: string;
  historyPresentIllness: string;
  subjective: string;
  objective: string;
  medicalHistory: string;
  familyHistory: string;
  medicationsInUse: string;
  allergies: string;
  bloodPressure: string;
  heartRate: string;
  respiratoryRate: string;
  temperature: string;
  oxygenSaturation: string;
  weight: string;
  height: string;
  assessment: string;
  diagnosisCid: string;
  diagnosisCid11: string;
  diagnosisDescription: string;
  classificationMappingNote: string;
  plan: string;
  prescriptions: string;
  examRequests: string;
  returnInstructions: string;
};

export type ClinicalEditorState = {
  patientId: string;
  patientName: string;
  patientBirthDate: string | null;
  patientPhone: string | null;
  patientAlerts: string[];
  appointmentId?: string;
  encounterId: string;
  noteId: string;
  updatedAt: string;
  content: ClinicalContent;
};

type Props = {
  editor: ClinicalEditorState;
  setEditor: (editor: ClinicalEditorState) => void;
  save: () => Promise<unknown>;
  finalize: () => Promise<void>;
  close: () => void;
};

export function ClinicalEditorModal({ editor, setEditor, save, finalize, close }: Props) {
  const [section, setSection] = useState<"consultation" | "conduct">("consultation");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (key: keyof ClinicalContent, value: string) => {
    setEditor({ ...editor, content: { ...editor.content, [key]: value } });
    setFeedback("");
  };

  const area = (key: keyof ClinicalContent, label: string, placeholder: string, wide = false) => (
    <label className={wide ? "wide-field" : ""}>
      {label}
      <textarea value={editor.content[key] ?? ""} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} />
    </label>
  );

  const vital = (key: keyof ClinicalContent, label: string, placeholder: string, suffix: string) => (
    <label>
      {label}
      <div className="clinical-input">
        <input value={editor.content[key] ?? ""} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} />
        <span>{suffix}</span>
      </div>
    </label>
  );

  const saveDraft = async () => {
    setSaving(true);
    setFeedback("");
    try {
      await save();
      setFeedback("Rascunho salvo.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  };

  const finalizeNote = async () => {
    if (!editor.content.chiefComplaint.trim()) {
      setSection("consultation");
      setFeedback("Preencha a queixa principal antes de finalizar.");
      return;
    }
    if (!editor.content.plan.trim()) {
      setSection("conduct");
      setFeedback("Preencha a conduta e o plano terapêutico antes de finalizar.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await finalize();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível finalizar o atendimento.");
      setSaving(false);
    }
  };

  return (
    <div className="clinical-layer" role="dialog" aria-modal="true" aria-label={`Atendimento de ${editor.patientName}`}>
      <section className="clinical-editor expanded">
        <header>
          <div>
            <span className="eyebrow">Atendimento em andamento</span>
            <h2>{editor.patientName}</h2>
            <div className="patient-clinical-summary">
              <span>{formatExactAge(editor.patientBirthDate)}</span>
              <span>{editor.patientPhone || "Sem telefone"}</span>
              {(editor.patientAlerts ?? []).map((alert) => <span className="clinical-alert" key={alert}>⚠ {alert}</span>)}
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Fechar atendimento">×</button>
        </header>

        <nav className="clinical-tabs">
          <button type="button" className={section === "consultation" ? "active" : ""} onClick={() => setSection("consultation")}>Consulta e anamnese</button>
          <button type="button" className={section === "conduct" ? "active" : ""} onClick={() => setSection("conduct")}>Diagnóstico e conduta</button>
        </nav>

        <div className="editor-warning">Use somente dados fictícios nesta versão de desenvolvimento.</div>
        {feedback && <div className={`editor-feedback ${feedback === "Rascunho salvo." ? "success" : "error"}`}>{feedback}</div>}

        <div className="clinical-scroll">
          {section === "consultation" && <div className="editor-form clinical-section">
            {area("chiefComplaint", "Queixa principal *", "Motivo principal da consulta", true)}
            {area("historyPresentIllness", "História da doença atual", "Início, duração, evolução, fatores de melhora e piora", true)}
            {area("medicalHistory", "Antecedentes pessoais", "Doenças, cirurgias, internações e condições anteriores")}
            {area("familyHistory", "Histórico familiar", "Condições relevantes na família")}
            {area("medicationsInUse", "Medicamentos em uso", "Nome, dose e frequência")}
            {area("allergies", "Alergias", "Medicamentos, alimentos e outras alergias")}
            <section className="consultation-subsection wide-field">
              <h3>Sinais vitais</h3>
              <div className="vitals-grid">
                {vital("bloodPressure", "Pressão arterial", "120/80", "mmHg")}
                {vital("heartRate", "Frequência cardíaca", "72", "bpm")}
                {vital("respiratoryRate", "Frequência respiratória", "18", "irpm")}
                {vital("temperature", "Temperatura", "36,5", "°C")}
                {vital("oxygenSaturation", "Saturação", "98", "%")}
                {vital("weight", "Peso", "70,0", "kg")}
                {vital("height", "Altura", "170", "cm")}
              </div>
            </section>
            {area("objective", "Exame físico", "Estado geral, exame por aparelhos e achados relevantes", true)}
          </div>}

          {section === "conduct" && <div className="editor-form clinical-section">
            <ClassificationPicker value={{ cid10: editor.content.diagnosisCid ?? "", cid11: editor.content.diagnosisCid11 ?? "", description: editor.content.diagnosisDescription ?? "", mappingNote: editor.content.classificationMappingNote ?? "" }} onChange={(value) => setEditor({ ...editor, content: { ...editor.content, diagnosisCid: value.cid10, diagnosisCid11: value.cid11, diagnosisDescription: value.description, classificationMappingNote: value.mappingNote } })} />
            {area("plan", "Conduta e plano terapêutico *", "Tratamento, orientações e acompanhamento", true)}
            <EncounterDocuments patientId={editor.patientId} patientName={editor.patientName} encounterId={editor.encounterId} diagnosisCid={editor.content.diagnosisCid ?? ""} />
          </div>}
        </div>

        <footer>
          <button type="button" className="secondary-button" onClick={close} disabled={saving}>Fechar</button>
          <button type="button" className="secondary-button" onClick={saveDraft} disabled={saving}>{saving ? "Salvando…" : "Salvar rascunho"}</button>
          <button type="button" className="primary-button compact" onClick={finalizeNote} disabled={saving}>Finalizar e assinar</button>
        </footer>
      </section>
    </div>
  );
}
