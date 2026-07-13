import { FormEvent, useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Patient = { id: string; full_name: string };
type Professional = { id: string; name: string };
type Entry = {
  id: string;
  kind: "income" | "expense";
  due_date: string;
  paid_at: string | null;
  description: string;
  payment_method: string | null;
  amount: string;
  status: "pending" | "paid" | "cancelled";
  commission_amount: string;
  commission_status: "not_applicable" | "pending" | "paid" | "waived";
  commission_paid_at: string | null;
  professional_name: string | null;
};
type Report = {
  scope: "professional" | "clinic";
  summary: {
    total_received: string;
    total_billed: string;
    expenses_paid: string;
    expenses_pending: string;
    total_commissions: string;
    commissions_due: string;
    commissions_paid: string;
    net_after_commissions: number;
    operating_result: number;
  };
  professionals: Array<{
    professional_user_id: string;
    professional_name: string;
    payout_model: string;
    received: string;
    pending: string;
    commission_due: string;
    commission_paid: string;
  }>;
  entries: Entry[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "request_failed");
  return payload;
}

const money = (value: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
        new Date(value.includes("T") ? value : `${value}T12:00:00`),
      )
    : "—";

function currentPeriod() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    to: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
  };
}

export function FinancialReports({ patients, professionals, role }: { patients: Patient[]; professionals: Professional[]; role: string }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [report, setReport] = useState<Report | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patientId: "",
    professionalUserId: "",
    kind: "income",
    description: "Consulta",
    category: "Atendimento",
    accountName: "Caixa principal",
    paymentMethod: "pix",
    amount: "",
    dueDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const canWrite = ["owner", "admin", "finance"].includes(role);
  const canClose = canWrite;

  const load = async () => {
    try {
      setReport(await api<Report>(`/v1/finance/report?from=${period.from}&to=${period.to}`));
      setError("");
    } catch {
      setError("Você não possui acesso a este relatório financeiro.");
    }
  };

  useEffect(() => {
    void load();
  }, [period.from, period.to]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/v1/finance", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          patientId: form.patientId || undefined,
          professionalUserId: form.kind === "income" ? form.professionalUserId || undefined : undefined,
          amount: Number(form.amount),
          notes: form.notes || undefined,
        }),
      });
      setOpen(false);
      setForm((current) => ({ ...current, amount: "", notes: "" }));
      await load();
    } catch {
      setError("Não foi possível registrar o lançamento.");
    }
  };

  const settle = async (entry: Entry, status: "paid" | "cancelled") => {
    try {
      await api(`/v1/finance/${entry.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          paymentMethod: status === "paid" ? entry.payment_method ?? "other" : undefined,
        }),
      });
      await load();
    } catch {
      setError("Não foi possível atualizar o lançamento financeiro.");
    }
  };

  const payCommission = async (id: string) => {
    try {
      await api(`/v1/finance/${id}/commission-paid`, { method: "POST" });
      await load();
    } catch {
      setError("Não foi possível registrar o pagamento do repasse.");
    }
  };

  const summary = report?.summary;
  return (
    <div className="financial-report">
      <div className="financial-toolbar">
        <div>
          <label>De<input type="date" value={period.from} onChange={(event) => setPeriod({ ...period, from: event.target.value })} /></label>
          <label>Até<input type="date" value={period.to} onChange={(event) => setPeriod({ ...period, to: event.target.value })} /></label>
        </div>
        {canWrite && <button className="primary-button compact" onClick={() => setOpen(!open)}>{open ? "Fechar" : "+ Novo lançamento"}</button>}
      </div>

      {error && <div className="form-message error banner">{error}</div>}

      {open && (
        <form className="finance-report-form" onSubmit={create}>
          <label>Tipo<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="income">Receita</option><option value="expense">Despesa</option></select></label>
          {form.kind === "income" && <label>Profissional<select value={form.professionalUserId} onChange={(event) => setForm({ ...form, professionalUserId: event.target.value })}><option value="">Sem profissional</option>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>}
          <label>Paciente<select value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })}><option value="">Sem paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}</select></label>
          <label>Descrição<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label>
          <label>Valor<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
          <label>Vencimento<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /></label>
          <label>Categoria<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
          <label>Pagamento<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="transfer">Transferência</option><option value="bank_slip">Boleto</option><option value="other">Outro</option></select></label>
          <button className="primary-button compact">Salvar</button>
        </form>
      )}

      <section className="financial-kpis">
        {report?.scope === "professional" ? (
          <>
            <article><span>A receber em comissões</span><b>{money(summary?.commissions_due ?? 0)}</b></article>
            <article><span>Comissões recebidas</span><b>{money(summary?.commissions_paid ?? 0)}</b></article>
            <article><span>Atendimentos recebidos</span><b>{money(summary?.total_received ?? 0)}</b></article>
            <article><span>Faturamento vinculado</span><b>{money(summary?.total_billed ?? 0)}</b></article>
          </>
        ) : (
          <>
            <article><span>Recebido pela clínica</span><b>{money(summary?.total_received ?? 0)}</b></article>
            <article><span>Faturamento total</span><b>{money(summary?.total_billed ?? 0)}</b></article>
            <article><span>Despesas pagas</span><b>{money(summary?.expenses_paid ?? 0)}</b></article>
            <article><span>Comissões dos profissionais</span><b>{money(summary?.total_commissions ?? 0)}</b></article>
            <article><span>Líquido após comissões</span><b>{money(summary?.net_after_commissions ?? 0)}</b></article>
            <article><span>Resultado após despesas</span><b>{money(summary?.operating_result ?? 0)}</b></article>
          </>
        )}
      </section>

      {report?.scope === "clinic" && (
        <section className="panel professional-finance">
          <div className="panel-head"><div><span className="eyebrow">Consolidado</span><h2>Resultado por profissional</h2></div></div>
          <div className="professional-finance-head"><span>Profissional</span><span>Repasse</span><span>Recebido</span><span>Pendente</span><span>A receber</span><span>Repasse pago</span></div>
          {report.professionals.map((professional) => (
            <div className="professional-finance-row" key={professional.professional_user_id}>
              <b>{professional.professional_name}</b><span>Por procedimento</span><span>{money(professional.received)}</span><span>{money(professional.pending)}</span><strong>{money(professional.commission_due)}</strong><span>{money(professional.commission_paid)}</span>
            </div>
          ))}
        </section>
      )}

      <section className="panel commission-history">
        <div className="panel-head"><div><span className="eyebrow">Dia e mês</span><h2>{report?.scope === "professional" ? "Meus recebimentos e valores a receber" : "Movimentações, recebimentos e comissões"}</h2></div></div>
        <div className="commission-history-head"><span>Data</span><span>Descrição</span><span>Profissional</span><span>Valor</span><span>Repasse fixo</span><span>Situação</span><span>Ação</span></div>
        {report?.entries.length ? report.entries.map((entry) => (
          <div className="commission-history-row" key={entry.id}>
            <span>{date(entry.paid_at ?? entry.due_date)}</span>
            <b>{entry.description}</b>
            <span>{entry.professional_name ?? "Clínica"}</span>
            <span className={entry.kind === "expense" ? "financial-negative" : "financial-positive"}>{entry.kind === "expense" ? "− " : "+ "}{money(entry.amount)}</span>
            <strong>{entry.kind === "income" ? money(entry.commission_amount) : "—"}</strong>
            <span className={`status ${entry.status === "paid" ? "completed" : entry.status === "pending" ? "waiting" : "scheduled"}`}>{entry.status === "paid" ? "Liquidado" : entry.status === "pending" ? "Pendente" : "Cancelado"}</span>
            <div className="financial-row-actions">
              {canWrite && entry.status === "pending" && <button type="button" onClick={() => void settle(entry, "paid")}>{entry.kind === "income" ? "Receber" : "Pagar"}</button>}
              {canWrite && entry.status === "pending" && <button type="button" onClick={() => void settle(entry, "cancelled")}>Cancelar</button>}
              {canClose && entry.commission_status === "pending" && <button type="button" onClick={() => void payCommission(entry.id)}>Marcar repasse pago</button>}
              {entry.commission_status === "paid" && <small>Repasse pago em {date(entry.commission_paid_at)}</small>}
            </div>
          </div>
        )) : <div className="empty large">Nenhuma movimentação no período.</div>}
      </section>
    </div>
  );
}
