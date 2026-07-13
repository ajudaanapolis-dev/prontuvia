import { FormEvent, useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
type Patient = { id: string; full_name: string };
type Unit = { id: string; name: string };
type Professional = { id: string; name: string };
type Context = { units: Unit[]; professionals: Professional[] };
export type WaitlistItem = {
  id: string; patient_id: string; patient_name: string; phone: string | null;
  unit_id: string | null; unit_name: string | null; professional_user_id: string | null;
  professional_name: string | null; procedure_name: string; preferred_period: "morning" | "afternoon" | "evening" | "any";
  preferred_days: string | null; notes: string | null; priority: number; status: "waiting" | "contacted";
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "waitlist_request_failed");
  return payload;
}

const periodLabels = { morning: "Manhã", afternoon: "Tarde", evening: "Noite", any: "Qualquer horário" };

export function WaitlistPanel({ patients, context, close, onSchedule }: { patients: Patient[]; context: Context | null; close: () => void; onSchedule: (item: WaitlistItem) => void }) {
  const [items, setItems] = useState<WaitlistItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ patientId: "", unitId: "", professionalUserId: "", procedureName: "Consulta", preferredPeriod: "any", preferredDays: "", notes: "", priority: 0 });

  const load = async () => { try { const data = await api<{ items: WaitlistItem[] }>("/v1/waitlist"); setItems(data.items); setError(""); } catch { setError("Não foi possível carregar a lista de espera."); } };
  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/v1/waitlist", { method: "POST", body: JSON.stringify({ ...form, unitId: form.unitId || undefined, professionalUserId: form.professionalUserId || undefined, preferredDays: form.preferredDays || undefined, notes: form.notes || undefined }) });
      setForm({ patientId: "", unitId: "", professionalUserId: "", procedureName: "Consulta", preferredPeriod: "any", preferredDays: "", notes: "", priority: 0 });
      setFormOpen(false); await load();
    } catch { setError("Não foi possível incluir o paciente na lista de espera."); }
  };

  const changeStatus = async (item: WaitlistItem, status: "contacted" | "cancelled") => {
    try { await api(`/v1/waitlist/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); }
    catch { setError("Não foi possível atualizar a lista de espera."); }
  };

  return <div className="modal-layer"><section className="waitlist-modal" role="dialog" aria-modal="true" aria-label="Lista de espera">
    <header><div><span className="eyebrow">Agenda operacional</span><h2>Lista de espera</h2></div><button type="button" onClick={close}>×</button></header>
    <div className="waitlist-toolbar"><p>Organize pacientes que desejam antecipar ou encontrar um horário.</p><button className="primary-button compact" type="button" onClick={() => setFormOpen(!formOpen)}>{formOpen ? "Fechar cadastro" : "+ Adicionar paciente"}</button></div>
    {error && <div className="form-message error">{error}</div>}
    {formOpen && <form className="waitlist-form" onSubmit={submit}>
      <label>Paciente<select value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })} required><option value="">Selecione</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}</select></label>
      <label>Procedimento<input value={form.procedureName} onChange={(event) => setForm({ ...form, procedureName: event.target.value })} required /></label>
      <label>Período<select value={form.preferredPeriod} onChange={(event) => setForm({ ...form, preferredPeriod: event.target.value })}><option value="any">Qualquer horário</option><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="evening">Noite</option></select></label>
      <label>Prioridade<select value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}><option value={0}>Normal</option><option value={1}>Preferencial</option><option value={2}>Alta</option><option value={3}>Urgente</option></select></label>
      <label>Unidade<select value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}><option value="">Qualquer unidade</option>{context?.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label>Profissional<select value={form.professionalUserId} onChange={(event) => setForm({ ...form, professionalUserId: event.target.value })}><option value="">Qualquer profissional</option>{context?.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
      <label className="wide-field">Dias preferenciais<input value={form.preferredDays} onChange={(event) => setForm({ ...form, preferredDays: event.target.value })} placeholder="Ex.: segunda e quarta" /></label>
      <label className="wide-field">Observações<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <div className="wide-field waitlist-form-actions"><button className="primary-button compact">Salvar na lista</button></div>
    </form>}
    <div className="waitlist-list">{items.length ? items.map((item) => <article key={item.id} className={`priority-${item.priority}`}><div><b>{item.patient_name}</b><span>{item.phone ?? "Sem telefone"} · {item.procedure_name}</span><small>{periodLabels[item.preferred_period]}{item.preferred_days ? ` · ${item.preferred_days}` : ""}{item.professional_name ? ` · ${item.professional_name}` : ""}</small></div><span className={`waitlist-status ${item.status}`}>{item.status === "contacted" ? "Contatado" : item.priority >= 2 ? "Prioridade" : "Aguardando"}</span><div className="waitlist-actions"><button type="button" onClick={() => void changeStatus(item, "contacted")}>Contatado</button><button type="button" onClick={() => onSchedule(item)}>Agendar</button><button type="button" onClick={() => void changeStatus(item, "cancelled")}>Remover</button></div></article>) : <div className="empty large">Nenhum paciente aguardando.</div>}</div>
  </section></div>;
}
