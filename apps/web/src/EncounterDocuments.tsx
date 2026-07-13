import { FormEvent, useState } from "react";
import { categoryIcons, categoryLabels, type Category } from "./DocumentCenter";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "request_failed" })) as { error?: string };
    throw new Error(payload.error ?? "request_failed");
  }
}

const categories = Object.keys(categoryLabels) as Category[];

export function EncounterDocuments({ patientId, patientName, encounterId, diagnosisCid }: { patientId: string; patientName: string; encounterId: string; diagnosisCid: string }) {
  const [form, setForm] = useState<{ category: Category; title: string; body: string; cid: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const open = (category: Category) => {
    setForm({ category, title: categoryLabels[category], body: "", cid: diagnosisCid, notes: "" });
    setMessage(""); setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setError("");
    try {
      await request("/v1/documents", { method: "POST", body: JSON.stringify({ patientId, encounterId, category: form.category, title: form.title, content: { body: form.body, cid: form.cid || undefined, notes: form.notes || undefined } }) });
      setMessage(`${categoryLabels[form.category]} finalizado e vinculado a este atendimento.`);
      setForm(null);
    } catch (caught) {
      setError(caught instanceof Error ? `Não foi possível finalizar o documento (${caught.message}).` : "Não foi possível finalizar o documento.");
    } finally { setSaving(false); }
  };

  return <section className="encounter-documents wide-field">
    <div className="encounter-documents-heading"><div><span className="eyebrow">Documentos do atendimento</span><h3>Gerar documentos clínicos</h3></div><small>Os documentos finalizados ficam no histórico imutável do paciente.</small></div>
    <div className="encounter-document-grid">{categories.map((category) => <button type="button" key={category} onClick={() => open(category)}><span>{categoryIcons[category]}</span><b>{categoryLabels[category]}</b><small>Criar e registrar</small></button>)}</div>
    {message && <div className="form-message success">{message}</div>}{error && <div className="form-message error">{error}</div>}
    {form && <div className="nested-modal-layer"><form className="document-modal encounter-document-modal" onSubmit={submit}><button type="button" className="close" onClick={() => setForm(null)}>×</button><span className="eyebrow">{categoryLabels[form.category]}</span><h2>{patientName}</h2><label>Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label><label>Conteúdo<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={form.category === "prescription" ? "Medicamento, apresentação, dose, via, frequência e duração" : form.category === "exam_request" ? "Exames solicitados e indicação clínica" : form.category === "certificate" ? "Período de afastamento e informações necessárias" : form.category === "declaration" ? "Declare o comparecimento, período e finalidade" : "Texto completo do documento"} required minLength={2} /></label><div className="document-form-grid"><label>CID-10 opcional<input value={form.cid} onChange={(event) => setForm({ ...form, cid: event.target.value.toUpperCase() })} /></label><label>Observações<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div><div className="document-warning">Ao finalizar, o documento torna-se imutável e será vinculado a este atendimento.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setForm(null)}>Cancelar</button><button className="primary-button compact" disabled={saving}>{saving ? "Finalizando…" : "Finalizar documento"}</button></div></form></div>}
  </section>;
}
