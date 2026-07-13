import { formatExactAge } from "./age";

type AppointmentStatus = "scheduled" | "confirmed" | "waiting" | "in_progress" | "completed" | "cancelled" | "no_show";

type Appointment = {
  patient_name: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  type: string;
  professional_name: string;
  notes: string | null;
  price_snapshot?: string;
  professional_amount_snapshot?: string;
  source?:"staff"|"online"|"portal";
};

type Patient = { birth_date: string | null; phone: string | null };

type Props = {
  appointment: Appointment;
  patient: Patient | null;
  onStatus: (status: AppointmentStatus) => void;
  onStart: () => void;
  onEdit: () => void;
  close: () => void;
};

const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendado", confirmed: "Confirmado", waiting: "Aguardando",
  in_progress: "Em atendimento", completed: "Finalizado", cancelled: "Cancelado", no_show: "Faltou",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function AppointmentDetailsModal({ appointment, patient, onStatus, onStart, onEdit, close }: Props) {
  const start = () => {
    onStart();
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={`Agendamento de ${appointment.patient_name}`}>
      <section className="appointment-details">
        <header>
          <div><span className="eyebrow">Detalhes do agendamento</span><h2>{appointment.patient_name}</h2></div>
          <button type="button" onClick={close} aria-label="Fechar">×</button>
        </header>
        <div className="appointment-person">
          <span className="detail-avatar">{appointment.patient_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
          <div><b>{appointment.patient_name}</b><span>{patient?.phone ?? "Telefone não informado"}</span><small>{formatExactAge(patient?.birth_date ?? null)}</small></div>
        </div>
        <div className="detail-date">
          <strong>{formatDateTime(appointment.starts_at)} até {formatTime(appointment.ends_at)}</strong>
          <span className={`status ${appointment.status}`}>{statusLabels[appointment.status]}</span>
        </div>
        <div className="detail-section">
          <span>PROCEDIMENTO</span>
          <div><b>{appointment.type} {appointment.source==="online"&&<span className="status scheduled">Agendado online</span>}</b><small>Profissional: {appointment.professional_name}{Number(appointment.price_snapshot)>0?` · Consulta ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(appointment.price_snapshot))}`:""}{Number(appointment.professional_amount_snapshot)>0?` · Repasse ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(appointment.professional_amount_snapshot))}`:""}</small></div>
        </div>
        {appointment.notes && <div className="detail-notes"><span>Observações</span><p>{appointment.notes}</p></div>}
        <footer>
          {["scheduled", "confirmed", "waiting"].includes(appointment.status) && <button type="button" className="secondary-button" onClick={onEdit}>Editar / reagendar</button>}
          {appointment.status === "scheduled" && <button type="button" className="secondary-button" onClick={() => onStatus("confirmed")}>Confirmar</button>}
          {["scheduled", "confirmed"].includes(appointment.status) && <button type="button" className="secondary-button" onClick={() => onStatus("waiting")}>Marcar chegada</button>}
          {["scheduled", "confirmed", "waiting", "in_progress"].includes(appointment.status) && <button type="button" className="primary-button compact" onClick={start}>{appointment.status === "in_progress" ? "Continuar atendimento" : "Iniciar atendimento"}</button>}
          {["scheduled", "confirmed", "waiting"].includes(appointment.status) && <button type="button" className="danger-button" onClick={() => onStatus("cancelled")}>Cancelar</button>}
        </footer>
      </section>
    </div>
  );
}
