import { FormEvent, useEffect, useState } from "react";
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
async function api<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? "request_failed");
  return payload;
}
type Settings = {
  online_booking_enabled: boolean;
  patient_portal_enabled: boolean;
  whatsapp_enabled: boolean;
  reminder_hours: number[];
  confirmation_template: string;
  reminder_template: string;
  access_code_template: string;
  locale: string;
  booking_auto_confirm:boolean;
  minimum_booking_notice_hours:number;
  cancellation_notice_hours:number;
  require_birth_date:boolean;
  booking_terms:string;
};
type Job = {
  id: string;
  kind: string;
  destination: string;
  scheduled_for: string;
  status: string;
  attempts: number;
  last_error: string | null;
  patient_name: string | null;
};
export function CommunicationCenter({ slug }: { slug: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [provider, setProvider] = useState<{
    name: string;
    configured: boolean;
    webhookUrl: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, queue] = await Promise.all([
        api<{ settings: Settings; provider: typeof provider }>(
          "/v1/communications/settings",
        ),
        api<{ items: Job[] }>("/v1/communications/jobs"),
      ]);
      setSettings(data.settings);
      setProvider(data.provider);
      setJobs(queue.items);
    } catch {
      setError("Não foi possível carregar a comunicação. Verifique as migrações e tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setError("");
    try {
      await api("/v1/communications/settings", {
        method: "PUT",
        body: JSON.stringify({
        onlineBookingEnabled: settings.online_booking_enabled,
        patientPortalEnabled: settings.patient_portal_enabled,
        whatsappEnabled: settings.whatsapp_enabled,
        reminderHours: settings.reminder_hours,
        confirmationTemplate: settings.confirmation_template,
        reminderTemplate: settings.reminder_template,
        accessCodeTemplate: settings.access_code_template,
        locale: settings.locale,
        bookingAutoConfirm:settings.booking_auto_confirm,
        minimumBookingNoticeHours:settings.minimum_booking_notice_hours,
        cancellationNoticeHours:settings.cancellation_notice_hours,
        requireBirthDate:settings.require_birth_date,
        bookingTerms:settings.booking_terms,
        }),
      });
      setMessage("Configurações de comunicação salvas.");
    } catch {
      setError("Não foi possível salvar as configurações de comunicação.");
    }
  };
  if (loading)
    return <div className="empty large">Carregando comunicação…</div>;
  if (!settings)
    return <div className="empty large"><b>Comunicação indisponível</b><span>{error}</span><button type="button" className="secondary-button" onClick={()=>void load()}>Tentar novamente</button></div>;
  return (
    <div className="communication-center">
      <section className="communication-links">
        <article>
          <span>Agendamento online</span>
          <b>
            {window.location.origin}/agendar/{slug}
          </b>
          <a target="_blank" href={`/agendar/${slug}`}>
            Abrir página →
          </a>
        </article>
        <article>
          <span>Portal do paciente</span>
          <b>
            {window.location.origin}/portal/{slug}
          </b>
          <a target="_blank" href={`/portal/${slug}`}>
            Abrir portal →
          </a>
        </article>
        <article>
          <span>WhatsApp</span>
          <b>
            {provider?.configured ? "Cloud API configurada" : "Modo sandbox"}
          </b>
          <small>
            {provider?.name} · webhook: {provider?.webhookUrl}
          </small>
        </article>
      </section>
      <form className="panel communication-settings" onSubmit={save}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">Automação</span>
            <h2>Confirmações e lembretes</h2>
          </div>
          <button className="primary-button compact">Salvar</button>
        </div>
        {message && <div className="form-message success">{message}</div>}
        {error && <div className="form-message error">{error}</div>}
        <div className="communication-form">
          <label className="operation-check">
            <input
              type="checkbox"
              checked={settings.online_booking_enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  online_booking_enabled: e.target.checked,
                })
              }
            />
            Agendamento online ativo
          </label>
          <label className="operation-check"><input type="checkbox" checked={settings.booking_auto_confirm} onChange={e=>setSettings({...settings,booking_auto_confirm:e.target.checked})}/>Confirmar automaticamente sem aprovação da recepção</label>
          <label>Antecedência mínima (horas)<input type="number" min="0" max="720" value={settings.minimum_booking_notice_hours} onChange={e=>setSettings({...settings,minimum_booking_notice_hours:Number(e.target.value)})}/></label>
          <label>Prazo para cancelamento online (horas)<input type="number" min="0" max="720" value={settings.cancellation_notice_hours} onChange={e=>setSettings({...settings,cancellation_notice_hours:Number(e.target.value)})}/></label>
          <label className="operation-check"><input type="checkbox" checked={settings.require_birth_date} onChange={e=>setSettings({...settings,require_birth_date:e.target.checked})}/>Exigir data de nascimento</label>
          <label className="full-field">Termos e consentimento LGPD<textarea value={settings.booking_terms} onChange={e=>setSettings({...settings,booking_terms:e.target.value})}/></label>
          <label className="operation-check">
            <input
              type="checkbox"
              checked={settings.patient_portal_enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  patient_portal_enabled: e.target.checked,
                })
              }
            />
            Portal do paciente ativo
          </label>
          <label className="operation-check">
            <input
              type="checkbox"
              checked={settings.whatsapp_enabled}
              onChange={(e) =>
                setSettings({ ...settings, whatsapp_enabled: e.target.checked })
              }
            />
            Usar WhatsApp quando as credenciais estiverem configuradas
          </label>
          <label>
            Lembretes antes da consulta
            <select
              value={settings.reminder_hours[0] ?? 24}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  reminder_hours: [Number(e.target.value)],
                })
              }
            >
              <option value="2">2 horas</option>
              <option value="12">12 horas</option>
              <option value="24">24 horas</option>
              <option value="48">48 horas</option>
            </select>
          </label>
          <label>
            Modelo de confirmação
            <input
              value={settings.confirmation_template}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  confirmation_template: e.target.value,
                })
              }
            />
          </label>
          <label>
            Modelo de lembrete
            <input
              value={settings.reminder_template}
              onChange={(e) =>
                setSettings({ ...settings, reminder_template: e.target.value })
              }
            />
          </label>
          <label>
            Modelo de código do portal
            <input
              value={settings.access_code_template}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  access_code_template: e.target.value,
                })
              }
            />
          </label>
        </div>
      </form>
      <section className="panel communication-queue">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Histórico</span>
            <h2>Fila de mensagens</h2>
          </div>
          <button
            onClick={() =>
              api("/v1/communications/process", { method: "POST" }).then(load)
            }
          >
            Processar agora
          </button>
        </div>
        {jobs.length ? (
          jobs.map((job) => (
            <div className="communication-job" key={job.id}>
              <div>
                <b>{job.patient_name ?? job.destination}</b>
                <small>
                  {job.kind} ·{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(job.scheduled_for))}
                </small>
              </div>
              <span
                className={`status ${job.status === "sent" ? "completed" : job.status === "failed" ? "cancelled" : "scheduled"}`}
              >
                {job.status}
              </span>
              <small>{job.last_error ?? `${job.attempts} tentativa(s)`}</small>
            </div>
          ))
        ) : (
          <div className="empty">Nenhuma mensagem gerada.</div>
        )}
      </section>
    </div>
  );
}
