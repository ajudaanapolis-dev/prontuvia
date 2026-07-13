import { FormEvent, useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Professional = { id: string; name: string };
type Summary = {
  total: number; scheduled: number; confirmed: number; waiting: number; in_progress: number;
  completed: number; cancelled: number; no_show: number; unique_patients: number; average_duration_minutes: number;
};
type Report = {
  scope: "clinic" | "professional";
  period: { from: string; to: string };
  summary: Summary;
  byDay: Array<{ date: string; total: number; completed: number; cancelled: number; no_show: number }>;
  byProfessional: Array<{ professional_user_id: string; professional_name: string; total: number; completed: number; cancelled: number; no_show: number; average_duration_minutes: number }>;
};

function monthPeriod() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: value(new Date(now.getFullYear(), now.getMonth(), 1)), to: value(last) };
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));

export function OperationalReports({ professionals, role }: { professionals: Professional[]; role: string }) {
  const [filters, setFilters] = useState({ ...monthPeriod(), professionalUserId: "" });
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ from: filters.from, to: filters.to });
      if (filters.professionalUserId) query.set("professionalUserId", filters.professionalUserId);
      const response = await fetch(`${apiUrl}/v1/reports/operational?${query}`, { credentials: "include" });
      const payload = await response.json().catch(() => ({})) as Report & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "request_failed");
      setReport(payload);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "request_failed";
      setError(code === "permission_denied" ? "Seu perfil não possui acesso aos relatórios operacionais." : "Não foi possível carregar o relatório.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); void load(); };
  const s = report?.summary;
  const attendanceRate = s && s.total ? s.completed / s.total : 0;
  const absenceRate = s && s.total ? s.no_show / s.total : 0;
  const maxDay = Math.max(1, ...(report?.byDay.map((item) => item.total) ?? [1]));

  return <div className="operational-reports">
    <form className="report-toolbar panel" onSubmit={submit}>
      <div><span className="eyebrow">Relatório operacional</span><h2>Atendimentos e pacientes</h2><p>Acompanhe volume, conclusão, faltas e desempenho da agenda.</p></div>
      <label>De<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} required /></label>
      <label>Até<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} required /></label>
      {role !== "clinician" && <label>Profissional<select value={filters.professionalUserId} onChange={(event) => setFilters({ ...filters, professionalUserId: event.target.value })}><option value="">Todos</option>{professionals.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      <button className="primary-button compact" disabled={loading}>{loading ? "Gerando…" : "Gerar relatório"}</button>
    </form>
    {role === "clinician" && <div className="report-scope-note">Você está vendo somente os seus próprios atendimentos.</div>}
    {error && <div className="form-message error banner">{error}</div>}
    {s && <>
      <section className="report-kpis">
        <ReportMetric label="Agendamentos" value={s.total} note={`${s.unique_patients} paciente(s) único(s)`} />
        <ReportMetric label="Atendidos" value={s.completed} note={`${percent(attendanceRate)} do período`} tone="positive" />
        <ReportMetric label="Confirmados" value={s.confirmed} note={`${s.waiting + s.in_progress} no fluxo agora`} />
        <ReportMetric label="Faltas" value={s.no_show} note={`${percent(absenceRate)} do período`} tone="negative" />
        <ReportMetric label="Cancelados" value={s.cancelled} note="Agendamentos cancelados" tone="negative" />
        <ReportMetric label="Duração média" value={`${s.average_duration_minutes} min`} note="Tempo reservado na agenda" />
      </section>
      <section className="report-grid">
        <article className="panel report-chart"><div className="panel-head"><div><span className="eyebrow">Evolução diária</span><h2>Atendimentos no período</h2></div></div>{report!.byDay.length ? <div className="daily-bars">{report!.byDay.map((item) => <div className="daily-bar" key={item.date} title={`${item.total} agendamento(s), ${item.completed} atendido(s)`}><span><i style={{ height: `${Math.max(5, item.total / maxDay * 100)}%` }} /></span><b>{item.total}</b><small>{dateLabel(item.date)}</small></div>)}</div> : <div className="empty large"><b>Sem agendamentos no período</b><span>Altere os filtros para consultar outra data.</span></div>}</article>
        <article className="panel status-breakdown"><div className="panel-head"><div><span className="eyebrow">Situação da agenda</span><h2>Distribuição por status</h2></div></div><div className="status-report-list"><StatusRow label="Agendados" value={s.scheduled} total={s.total} tone="scheduled"/><StatusRow label="Confirmados" value={s.confirmed} total={s.total} tone="confirmed"/><StatusRow label="Aguardando" value={s.waiting} total={s.total} tone="waiting"/><StatusRow label="Em atendimento" value={s.in_progress} total={s.total} tone="in_progress"/><StatusRow label="Finalizados" value={s.completed} total={s.total} tone="completed"/><StatusRow label="Cancelados" value={s.cancelled} total={s.total} tone="cancelled"/><StatusRow label="Faltas" value={s.no_show} total={s.total} tone="no_show"/></div></article>
      </section>
      <section className="panel professional-report"><div className="panel-head"><div><span className="eyebrow">Equipe assistencial</span><h2>Atendimentos por profissional</h2></div></div><div className="professional-report-head"><span>Profissional</span><span>Total</span><span>Atendidos</span><span>Cancelados</span><span>Faltas</span><span>Duração média</span></div>{report!.byProfessional.length ? report!.byProfessional.map((item) => <div className="professional-report-row" key={item.professional_user_id}><b>{item.professional_name}</b><span>{item.total}</span><span className="positive-text">{item.completed}</span><span>{item.cancelled}</span><span className="negative-text">{item.no_show}</span><span>{item.average_duration_minutes} min</span></div>) : <div className="empty">Nenhum profissional com atendimento neste período.</div>}</section>
    </>}
  </div>;
}

function ReportMetric({ label, value, note, tone = "" }: { label: string; value: string | number; note: string; tone?: string }) { return <article className={tone}><span>{label}</span><b>{value}</b><small>{note}</small></article>; }
function StatusRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) { const width = total ? value / total * 100 : 0; return <div><div><span className={`status-dot ${tone}`} /><b>{label}</b><strong>{value}</strong></div><span className="status-track"><i className={tone} style={{ width: `${width}%` }} /></span></div>; }
