import { FormEvent, useEffect, useMemo, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Patient = {
  id: string;
  full_name: string;
  birth_date: string | null;
  phone: string | null;
};

export type Category = "prescription" | "exam_request" | "certificate" | "declaration" | "report" | "referral";

type ClinicalDocument = {
  id: string;
  patient_id: string;
  category: Category;
  title: string;
  content: { body: string; cid?: string; notes?: string };
  content_hash: string;
  finalized_at: string;
  author_name: string;
};

export const categoryLabels: Record<Category, string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exames",
  certificate: "Atestado médico",
  declaration: "Declaração",
  report: "Relatório médico",
  referral: "Encaminhamento",
};

export const categoryIcons: Record<Category, string> = {
  prescription: "Rx", exam_request: "Ex", certificate: "At", declaration: "Dc", report: "Rp", referral: "→",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "request_failed" })) as { error?: string };
    throw new Error(payload.error ?? "request_failed");
  }
  return response.json() as Promise<T>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]!);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

type Branding = { displayName: string; entityType: "clinic" | "individual"; professionalRegistration: string | null; headerNote: string | null };

function printDocument(document: ClinicalDocument, patient: Patient, branding: Branding) {
  const popup = window.open("", "_blank", "width=900,height=760");
  if (!popup) throw new Error("Permita pop-ups para visualizar e imprimir o documento.");
  popup.opener = null;
  const body = escapeHtml(document.content.body).replace(/\n/g, "<br>");
  const notes = document.content.notes ? escapeHtml(document.content.notes).replace(/\n/g, "<br>") : "";
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title><style>
    body{font-family:Arial,sans-serif;color:#163d49;margin:0;padding:48px}header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #0a8e80;padding-bottom:18px}header img{width:64px;height:64px;border-radius:14px}.brand h1{margin:0;font-size:27px}.brand strong{display:block;margin-top:5px;color:#0a8e80;font-size:12px;letter-spacing:.12em;text-transform:uppercase}.brand small{display:block;margin-top:4px;color:#718095}h2{margin:38px 0 8px;font-size:18px;text-align:center;text-transform:uppercase}.meta{margin-top:24px;border-radius:8px;padding:14px;background:#f2f7f8;font-size:13px}.body{min-height:300px;margin-top:28px;font-size:14px;line-height:1.75}.cid{margin-top:16px;font-weight:bold}.notes{margin-top:24px;border-top:1px solid #d9e3e6;padding-top:14px;font-size:12px}.signature{margin-top:70px;text-align:center}.signature:before{display:block;width:280px;margin:0 auto 10px;border-top:1px solid #234b59;content:""}.integrity{margin-top:38px;color:#718095;font-size:9px;word-break:break-all}@media print{body{padding:24px}}</style></head><body>
    <header><img src="${window.location.origin}/prontuvia-symbol.png"><div class="brand"><h1>${escapeHtml(branding.displayName)}</h1><strong>${branding.entityType === "individual" ? "Profissional responsável" : "Clínica responsável"}</strong><small>Sistema Prontuvia${branding.professionalRegistration ? ` · ${escapeHtml(branding.professionalRegistration)}` : ""}</small>${branding.headerNote ? `<small>${escapeHtml(branding.headerNote)}</small>` : ""}</div></header>
    <h2>${escapeHtml(categoryLabels[document.category])}</h2>
    <div class="meta"><strong>Paciente:</strong> ${escapeHtml(patient.full_name)}<br><strong>Data:</strong> ${escapeHtml(formatDate(document.finalized_at))}${patient.birth_date ? `<br><strong>Nascimento:</strong> ${escapeHtml(patient.birth_date.split("-").reverse().join("/"))}` : ""}</div>
    ${document.content.cid ? `<div class="cid">CID-10: ${escapeHtml(document.content.cid)}</div>` : ""}
    <div class="body">${body}</div>${notes ? `<div class="notes"><strong>Observações:</strong><br>${notes}</div>` : ""}
    <div class="signature"><strong>${escapeHtml(document.author_name)}</strong><br>Profissional responsável</div>
    <div class="integrity">Documento registrado no Prontuvia · Integridade SHA-256: ${escapeHtml(document.content_hash)}<br>Assinatura digital ICP-Brasil ainda não habilitada nesta versão de desenvolvimento.</div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script></body></html>`);
  popup.document.close();
}

export function DocumentCenter({ patients, branding }: { patients: Patient[]; branding: Branding }) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [documents, setDocuments] = useState<ClinicalDocument[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ category: Category; title: string; body: string; cid: string; notes: string } | null>(null);

  const selectedPatient = patients.find((patient) => patient.id === patientId) ?? null;
  const visiblePatients = useMemo(() => patients.filter((patient) =>
    patient.full_name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))), [patients, search]);

  const load = async (selectedId = patientId) => {
    if (!selectedId) { setDocuments([]); return; }
    setLoading(true);
    setError("");
    try {
      const data = await request<{ items: ClinicalDocument[] }>(`/v1/documents?patientId=${encodeURIComponent(selectedId)}`);
      setDocuments(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar os documentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(patientId); }, [patientId]);

  const openForm = (category: Category) => setForm({ category, title: categoryLabels[category], body: "", cid: "", notes: "" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !selectedPatient) return;
    setLoading(true);
    setError("");
    try {
      await request("/v1/documents", {
        method: "POST",
        body: JSON.stringify({
          patientId: selectedPatient.id,
          category: form.category,
          title: form.title,
          content: { body: form.body, cid: form.cid || undefined, notes: form.notes || undefined },
        }),
      });
      setForm(null);
      setMessage("Documento finalizado e registrado no histórico.");
      await load(selectedPatient.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o documento.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="documents-layout">
    <aside className="panel document-patients">
      <div className="panel-head"><div><span className="eyebrow">Paciente</span><h2>Documentos clínicos</h2></div></div>
      <div className="document-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar paciente" /></div>
      {visiblePatients.map((patient) => <button key={patient.id} className={patientId === patient.id ? "selected" : ""} onClick={() => setPatientId(patient.id)}><span>{patient.full_name[0]}</span>{patient.full_name}</button>)}
    </aside>
    <section className="documents-main">
      <article className="panel document-actions-panel">
        <div className="panel-head"><div><span className="eyebrow">Novo documento</span><h2>{selectedPatient?.full_name ?? "Selecione um paciente"}</h2></div></div>
        <div className="document-action-grid">{(Object.keys(categoryLabels) as Category[]).map((category) => <button key={category} disabled={!selectedPatient} onClick={() => openForm(category)}><span>{categoryIcons[category]}</span><b>{categoryLabels[category]}</b><small>Criar e registrar</small></button>)}</div>
      </article>
      {message && <div className="form-message success">{message}</div>}{error && <div className="form-message error banner">{error}</div>}
      <article className="panel document-history">
        <div className="panel-head"><div><span className="eyebrow">Histórico imutável</span><h2>Documentos finalizados</h2></div><small>{documents.length} documento(s)</small></div>
        {loading ? <div className="empty">Carregando…</div> : documents.length ? documents.map((document) => <div className="document-row" key={document.id}><span className="document-icon">{categoryIcons[document.category]}</span><div><b>{document.title}</b><small>{formatDate(document.finalized_at)} · {document.author_name}</small></div><span className="status completed">Finalizado</span><button onClick={() => selectedPatient && printDocument(document, selectedPatient, branding)}>Visualizar / imprimir</button></div>) : <div className="empty large"><b>Nenhum documento finalizado</b><span>Escolha um tipo acima para criar o primeiro documento.</span></div>}
      </article>
    </section>
    {form && selectedPatient && <div className="modal-layer"><form className="document-modal" onSubmit={submit}><button type="button" className="close" onClick={() => setForm(null)}>×</button><span className="eyebrow">{categoryLabels[form.category]}</span><h2>{selectedPatient.full_name}</h2><label>Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label><label>Conteúdo<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={form.category === "prescription" ? "Medicamento, apresentação, dose, via, frequência e duração" : form.category === "exam_request" ? "Exames solicitados e indicação clínica" : "Texto completo do documento"} required minLength={2} /></label><div className="document-form-grid"><label>CID-10 opcional<input value={form.cid} onChange={(event) => setForm({ ...form, cid: event.target.value.toUpperCase() })} /></label><label>Observações<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div><div className="document-warning">Ao finalizar, o documento torna-se imutável. Revise o conteúdo antes de continuar.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setForm(null)}>Cancelar</button><button className="primary-button compact" disabled={loading} type="submit">{loading ? "Finalizando…" : "Finalizar documento"}</button></div></form></div>}
  </div>;
}
