import { FormEvent, useEffect, useState } from "react";
import { ClinicalEditorModal } from "./ClinicalEditorModal";
import { ClinicalErrorBoundary } from "./ClinicalErrorBoundary";
import { EncounterLaunchModal } from "./EncounterLaunchModal";
import { AppointmentDetailsModal } from "./AppointmentDetailsModal";
import { clinicalDescriptions } from "./clinicalData";
import { DocumentCenter } from "./DocumentCenter";
import { SidebarIcon } from "./SidebarIcon";
import { formatExactAge } from "./age";
import { WaitlistPanel, type WaitlistItem } from "./WaitlistPanel";
import { SignupPage } from "./SignupPage";
import { ProfileSettings } from "./ProfileSettings";
import { ProfileMenu } from "./ProfileMenu";
import { AccessManagementPanel } from "./AccessManagementPanel";
import { FinancialReports } from "./FinancialReports";
import { PublicAccessPage } from "./PublicAccessPage";
import { OperationalReports } from "./OperationalReports";
import { ClinicOperationsSettings } from "./ClinicOperationsSettings";
import { CommunicationCenter } from "./CommunicationCenter";
import { EnterpriseSuite } from "./EnterpriseSuite";
import { ClinicalWorkspace } from "./ClinicalWorkspace";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Session = {
  user: { id: string; email: string; name: string };
  tenantId: string;
  role: string;
};
type Patient = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  gender_identity: string | null;
  phone: string | null;
  email: string | null;
  insurance: { name?: string } | null;
  allergies: Array<{ description?: string }>;
  alerts: Array<{ description?: string }>;
  status: string;
};
type Unit = { id: string; name: string; timezone: string };
type Professional = { id: string; name: string; role: string };
type Procedure = {
  id: string;
  name: string;
  duration_minutes: number;
  price: string;
  professional_amount: string;
  color: string;
  tuss_code: string | null;
  automatic_receivable: boolean;
  status: string;
};
type ClinicContext = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    profile: {
      entityType: "clinic" | "individual";
      displayName: string;
      legalName: string | null;
      professionalName: string | null;
      professionalRegistration: string | null;
      documentHeaderNote: string | null;
      onboardingStatus: string;
    };
  };
  units: Unit[];
  professionals: Professional[];
  procedures: Procedure[];
};
type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "waiting"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";
type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  type: string;
  status: AppointmentStatus;
  notes: string | null;
  source:"staff"|"online"|"portal";
  patient_id: string;
  patient_name: string;
  professional_user_id: string;
  professional_name: string;
  unit_id: string;
  unit_name: string;
  procedure_id: string | null;
  price_snapshot: string;
  professional_amount_snapshot: string;
  procedure_color: string | null;
  encounter_id: string | null;
  note_id: string | null;
  note_updated_at: string | null;
  note_status: "draft" | "finalized" | null;
  note_content: Partial<ClinicalContent> | null;
};
type TimelineItem = {
  encounter_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  note_id: string;
  content: ClinicalContent;
  note_status: string;
  finalized_at: string | null;
  author_name: string;
};
type FhirPatientSummary={fhirPatientId:string;conditions:Array<{id?:string;code?:{text?:string;coding?:Array<{code?:string;display?:string}>}}> ;allergies:Array<{id?:string;code?:{text?:string}}> ;medications:Array<{id?:string;medicationCodeableConcept?:{text?:string};status?:string}>;exams:Array<{id?:string;code?:{text?:string};status?:string}>;documents:Array<{id?:string;description?:string;date?:string}>;encounters:Array<{id?:string;status?:string;period?:{start?:string}}>};
type ClinicalContent = {
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
type Editor = {
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

const emptyContent: ClinicalContent = {
  chiefComplaint: "",
  historyPresentIllness: "",
  subjective: "",
  objective: "",
  medicalHistory: "",
  familyHistory: "",
  medicationsInUse: "",
  allergies: "",
  bloodPressure: "",
  heartRate: "",
  respiratoryRate: "",
  temperature: "",
  oxygenSaturation: "",
  weight: "",
  height: "",
  assessment: "",
  diagnosisCid: "",
  diagnosisCid11: "",
  diagnosisDescription: "",
  classificationMappingNote: "",
  plan: "",
  prescriptions: "",
  examRequests: "",
  returnInstructions: "",
};
const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  completed: "Finalizado",
  cancelled: "Cancelado",
  no_show: "Faltou",
};

class ApiError extends Error {
  constructor(
    public code: string,
    public issues: Array<{ path: string; message: string }> = [],
  ) {
    super(code);
  }
}

const apiErrorMessages: Record<string, string> = {
  appointment_conflict:
    "Este profissional já possui atendimento nesse horário.",
  appointment_patient_invalid:
    "O paciente selecionado não está mais disponível. Atualize a página e tente novamente.",
  appointment_unit_invalid: "A unidade selecionada está inativa ou inválida.",
  appointment_professional_invalid:
    "O profissional selecionado não pode receber agendamentos.",
  appointment_procedure_invalid:
    "O procedimento selecionado está inativo ou não existe.",
  appointment_outside_schedule:
    "Este horário está fora da escala configurada para o profissional.",
  appointment_blocked: "A agenda do profissional está bloqueada nesse período.",
  appointment_not_found:
    "O agendamento não foi encontrado. Atualize a agenda e tente novamente.",
  appointment_not_startable:
    "Este agendamento não está em uma situação que permita iniciar o atendimento.",
  appointment_already_completed:
    "Este atendimento já foi finalizado e está disponível no histórico do paciente.",
  appointment_not_editable:
    "Atendimentos iniciados, finalizados ou cancelados não podem ser reagendados.",
  validation_failed:
    "Revise os horários e os campos obrigatórios do agendamento.",
  invalid_reference: "Paciente, unidade ou profissional inválido.",
  authentication_required: "Sua sessão expirou. Entre novamente.",
  note_not_finalizable:
    "O prontuário foi alterado ou já finalizado. Reabra o atendimento e tente novamente.",
  internal_error:
    "A API encontrou um erro interno. Consulte o terminal da API usando o código exibido.",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({ error: "request_failed" }))) as {
      error?: string;
      issues?: Array<{ path: string; message: string }>;
      requestId?: string;
    };
    const code = payload.error ?? "request_failed";
    const suffix = payload.requestId ? ` Código: ${payload.requestId}` : "";
    const apiError = new ApiError(code, payload.issues);
    apiError.message = `${apiErrorMessages[code] ?? `Falha na operação (${code}).`}${suffix}`;
    throw apiError;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function localDate(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}
function dateTimeValue(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
function dayRange(date: string) {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(`${date}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
function weekStart(date: string) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - value.getDay());
  return value;
}
function weekRange(date: string) {
  const from = weekStart(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from: from.toISOString(), to: to.toISOString() };
}
function ageFromDate(birthDate: string | null) {
  return formatExactAge(birthDate, new Date(), "—");
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<ClinicContext | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [active, setActive] = useState("Visão geral");
  const [agendaDate, setAgendaDate] = useState(localDate());
  const [agendaMode, setAgendaMode] = useState<"day" | "week">("week");
  const [loading, setLoading] = useState(true);
  const [signupPlan, setSignupPlan] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [login, setLogin] = useState({
    email: "admin@example.local",
    password: "",
    tenantSlug: "clinica-demonstracao",
  });
  const [patientForm, setPatientForm] = useState({
    fullName: "",
    preferredName: "",
    birthDate: "",
    sexAtBirth: "",
    genderIdentity: "",
    phone: "",
    email: "",
    insuranceName: "",
    allergies: "",
    alerts: "",
  });
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [savingPatient, setSavingPatient] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistSchedulingId, setWaitlistSchedulingId] = useState<
    string | null
  >(null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    patientId: "",
    unitId: "",
    professionalUserId: "",
    procedureId: "",
    startsAt: dateTimeValue(new Date(Date.now() + 3_600_000)),
    endsAt: dateTimeValue(new Date(Date.now() + 5_400_000)),
    type: "Consulta",
    notes: "",
  });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [encounterLaunch, setEncounterLaunch] = useState<{
    appointment: Appointment;
    error?: string;
  } | null>(null);
  const [timelinePatient, setTimelinePatient] = useState<Patient | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [fhirSummary,setFhirSummary]=useState<FhirPatientSummary|null>(null);

  const flash = (text: string, isError = false) => {
    setMessage(isError ? "" : text);
    setError(isError ? text : "");
  };
  const loadPatients = async () => {
    const data = await request<{ items: Patient[] }>("/v1/patients");
    setPatients(data.items);
  };
  const loadContext = async () => {
    const data = await request<ClinicContext>("/v1/context");
    setContext(data);
    setAppointmentForm((current) => ({
      ...current,
      unitId: current.unitId || data.units[0]?.id || "",
      professionalUserId:
        current.professionalUserId || data.professionals[0]?.id || "",
    }));
  };
  const loadAppointments = async (date = agendaDate, mode = agendaMode) => {
    const range = mode === "week" ? weekRange(date) : dayRange(date);
    const data = await request<{ items: Appointment[] }>(
      `/v1/appointments?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    );
    setAppointments(data.items);
  };
  const loadWorkspace = async () =>
    Promise.all([loadPatients(), loadContext(), loadAppointments()]);

  useEffect(() => {
    request<Session>("/v1/auth/me")
      .then(async (current) => {
        setSession(current);
        await loadWorkspace();
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (session)
      loadAppointments(agendaDate, agendaMode).catch((caught) =>
        flash(
          caught instanceof Error
            ? caught.message
            : "Não foi possível carregar a agenda.",
          true,
        ),
      );
  }, [agendaDate, agendaMode]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    flash("");
    try {
      const current = await request<Session>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(login),
      });
      setSession(current);
      await loadWorkspace();
      flash("Sessão iniciada com sucesso.");
    } catch {
      flash("Confira e-mail, senha e identificador da clínica.", true);
    }
  };
  const logout = async () => {
    await request<void>("/v1/auth/logout", { method: "POST" }).catch(
      () => undefined,
    );
    setSession(null);
    setContext(null);
    setPatients([]);
    setAppointments([]);
  };
  const submitPatient = async (event: FormEvent) => {
    event.preventDefault();
    if (savingPatient) return;
    const wasEditing = Boolean(editingPatient);
    setSavingPatient(true);
    try {
      const payload = {
        fullName: patientForm.fullName,
        preferredName: patientForm.preferredName || undefined,
        birthDate: patientForm.birthDate || undefined,
        sexAtBirth: patientForm.sexAtBirth || undefined,
        genderIdentity: patientForm.genderIdentity || undefined,
        phone: patientForm.phone || undefined,
        email: patientForm.email || undefined,
        insurance: patientForm.insuranceName
          ? { name: patientForm.insuranceName }
          : undefined,
        allergies: patientForm.allergies
          ? patientForm.allergies
              .split(",")
              .map((description) => ({ description: description.trim() }))
              .filter((item) => item.description)
          : [],
        alerts: patientForm.alerts
          ? patientForm.alerts
              .split(",")
              .map((description) => ({ description: description.trim() }))
              .filter((item) => item.description)
          : [],
      };
      await request(
        editingPatient ? `/v1/patients/${editingPatient.id}` : "/v1/patients",
        {
          method: editingPatient ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setPatientForm({
        fullName: "",
        preferredName: "",
        birthDate: "",
        sexAtBirth: "",
        genderIdentity: "",
        phone: "",
        email: "",
        insuranceName: "",
        allergies: "",
        alerts: "",
      });
      setShowPatientForm(false);
      setEditingPatient(null);
      flash(wasEditing ? "Cadastro do paciente atualizado." : "Paciente cadastrado.");
      await loadPatients().catch(() => {
        flash("Paciente salvo. Atualize a lista para visualizar os dados mais recentes.");
      });
    } catch (caught) {
      flash(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o paciente.",
        true,
      );
    } finally {
      setSavingPatient(false);
    }
  };
  const openPatientForm = (patient?: Patient) => {
    setEditingPatient(patient ?? null);
    setPatientForm(
      patient
        ? {
            fullName: patient.full_name,
            preferredName: patient.preferred_name ?? "",
            birthDate: patient.birth_date ?? "",
            sexAtBirth: patient.sex_at_birth ?? "",
            genderIdentity: patient.gender_identity ?? "",
            phone: patient.phone ?? "",
            email: patient.email ?? "",
            insuranceName: patient.insurance?.name ?? "",
            allergies: clinicalDescriptions(patient.allergies, []).join(", "),
            alerts: clinicalDescriptions([], patient.alerts).join(", "),
          }
        : {
            fullName: "",
            preferredName: "",
            birthDate: "",
            sexAtBirth: "",
            genderIdentity: "",
            phone: "",
            email: "",
            insuranceName: "",
            allergies: "",
            alerts: "",
          },
    );
    setShowPatientForm(true);
  };
  const openAppointmentForm = (date = agendaDate, hour = 8, minute = 0) => {
    const start = new Date(
      `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
    );
    const end = new Date(start.getTime() + 30 * 60_000);
    setEditingAppointment(null);
    setWaitlistSchedulingId(null);
    setAppointmentForm((current) => ({
      ...current,
      patientId: "",
      procedureId: "",
      startsAt: dateTimeValue(start),
      endsAt: dateTimeValue(end),
      type: "Consulta",
      notes: "",
    }));
    setShowAppointmentForm(true);
  };
  const editAppointment = (appointment: Appointment) => {
    setSelectedAppointment(null);
    setEditingAppointment(appointment);
    setWaitlistSchedulingId(null);
    setAppointmentForm({
      patientId: appointment.patient_id,
      unitId: appointment.unit_id,
      professionalUserId: appointment.professional_user_id,
      procedureId: appointment.procedure_id ?? "",
      startsAt: dateTimeValue(new Date(appointment.starts_at)),
      endsAt: dateTimeValue(new Date(appointment.ends_at)),
      type: appointment.type,
      notes: appointment.notes ?? "",
    });
    setShowAppointmentForm(true);
  };
  const submitAppointment = async (event: FormEvent) => {
    event.preventDefault();
    const startsAt = new Date(appointmentForm.startsAt);
    const endsAt = new Date(appointmentForm.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      flash("O horário final precisa ser posterior ao horário inicial.", true);
      return;
    }
    if (
      !appointmentForm.patientId ||
      !appointmentForm.unitId ||
      !appointmentForm.professionalUserId
    ) {
      flash("Selecione paciente, unidade e profissional.", true);
      return;
    }
    try {
      await request(
        editingAppointment
          ? `/v1/appointments/${editingAppointment.id}`
          : "/v1/appointments",
        {
          method: editingAppointment ? "PUT" : "POST",
          body: JSON.stringify({
            ...appointmentForm,
            procedureId: appointmentForm.procedureId || undefined,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            notes: appointmentForm.notes || undefined,
          }),
        },
      );
      if (waitlistSchedulingId)
        await request(`/v1/waitlist/${waitlistSchedulingId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "scheduled" }),
        }).catch(() => undefined);
      setShowAppointmentForm(false);
      setEditingAppointment(null);
      setWaitlistSchedulingId(null);
      await loadAppointments(agendaDate, agendaMode);
      flash(
        editingAppointment ? "Agendamento atualizado." : "Agendamento criado.",
      );
    } catch (caught) {
      flash(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o agendamento.",
        true,
      );
    }
  };
  const scheduleWaitlist = (item: WaitlistItem) => {
    const start = new Date(`${agendaDate}T08:00:00`);
    const end = new Date(start.getTime() + 30 * 60_000);
    setShowWaitlist(false);
    setEditingAppointment(null);
    setWaitlistSchedulingId(item.id);
    setAppointmentForm({
      patientId: item.patient_id,
      unitId: item.unit_id ?? context?.units[0]?.id ?? "",
      professionalUserId:
        item.professional_user_id ?? context?.professionals[0]?.id ?? "",
      procedureId: "",
      startsAt: dateTimeValue(start),
      endsAt: dateTimeValue(end),
      type: item.procedure_name,
      notes: item.notes ?? "",
    });
    setShowAppointmentForm(true);
  };
  const updateStatus = async (
    appointment: Appointment,
    status: AppointmentStatus,
  ) => {
    let cancellationReason: string | undefined;
    if (status === "cancelled") {
      cancellationReason = window.prompt("Motivo do cancelamento:")?.trim();
      if (!cancellationReason) return;
    }
    try {
      await request(`/v1/appointments/${appointment.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, cancellationReason }),
      });
      await loadAppointments();
      flash(`Agendamento marcado como ${statusLabels[status].toLowerCase()}.`);
    } catch {
      flash("Essa mudança de status não é permitida.", true);
    }
  };
  const startEncounter = async (appointment: Appointment) => {
    setSelectedAppointment(null);
    setEncounterLaunch({ appointment });
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );

    try {
      const patient = patients.find(
        (item) => item.id === appointment.patient_id,
      );
      const patientContext = {
        patientBirthDate: patient?.birth_date ?? null,
        patientPhone: patient?.phone ?? null,
        patientAlerts: clinicalDescriptions(
          patient?.allergies,
          patient?.alerts,
        ),
      };

      if (
        appointment.note_id &&
        appointment.encounter_id &&
        appointment.note_updated_at
      ) {
        setEditor({
          patientId: appointment.patient_id,
          patientName: appointment.patient_name,
          ...patientContext,
          appointmentId: appointment.id,
          encounterId: appointment.encounter_id,
          noteId: appointment.note_id,
          updatedAt: appointment.note_updated_at,
          content: { ...emptyContent, ...(appointment.note_content ?? {}) },
        });
        setEncounterLaunch(null);
        return;
      }

      const data = await request<{
        encounterId: string;
        resumed?: boolean;
        note: {
          id: string;
          updated_at: string;
          content?: Partial<ClinicalContent>;
        };
      }>("/v1/records/encounters", {
        method: "POST",
        body: JSON.stringify({
          unitId: appointment.unit_id,
          patientId: appointment.patient_id,
          appointmentId: appointment.id,
        }),
      });

      setEditor({
        patientId: appointment.patient_id,
        patientName: appointment.patient_name,
        ...patientContext,
        appointmentId: appointment.id,
        encounterId: data.encounterId,
        noteId: data.note.id,
        updatedAt: data.note.updated_at,
        content: { ...emptyContent, ...(data.note.content ?? {}) },
      });
      setEncounterLaunch(null);
      await loadAppointments();
    } catch (caught) {
      const text =
        caught instanceof Error
          ? caught.message
          : "Não foi possível iniciar este atendimento.";
      setEncounterLaunch({ appointment, error: text });
      flash(text, true);
    }
  };
  const saveDraft = async () => {
    if (!editor) return null;
    const data = await request<{ updatedAt: string }>(
      `/v1/records/notes/${editor.noteId}/draft`,
      {
        method: "PUT",
        body: JSON.stringify({
          content: editor.content,
          expectedUpdatedAt: editor.updatedAt,
        }),
      },
    );
    setEditor({ ...editor, updatedAt: data.updatedAt });
    return data;
  };
  const finalize = async () => {
    if (!editor) return;
    if (!editor.content.chiefComplaint.trim() || !editor.content.plan.trim()) {
      const validationError = new Error(
        "Preencha ao menos a queixa principal e a conduta.",
      );
      flash(validationError.message, true);
      throw validationError;
    }
    try {
      const result = await request<{ receivableCreated: boolean }>(
        `/v1/records/notes/${editor.noteId}/finalize`,
        {
          method: "POST",
          body: JSON.stringify({
            content: editor.content,
            expectedUpdatedAt: editor.updatedAt,
          }),
        },
      );
      setEditor(null);
      await loadAppointments();
      flash(
        result.receivableCreated
          ? "Atendimento finalizado, prontuário assinado e conta a receber gerada."
          : "Atendimento finalizado e prontuário assinado no sistema.",
      );
    } catch (caught) {
      const text =
        caught instanceof Error
          ? caught.message
          : "Não foi possível finalizar o atendimento.";
      flash(text, true);
      throw caught;
    }
  };
  const openTimeline = async (patient: Patient) => {
    try {
      const [data,fhir]=await Promise.all([request<{ items: TimelineItem[] }>(`/v1/records/patients/${patient.id}/timeline`),request<FhirPatientSummary>(`/v2/medplum/patients/${patient.id}/summary`).catch(()=>null)]);
      setTimelinePatient(patient);
      setTimeline(data.items);
      setFhirSummary(fhir);
      setActive("Prontuários");
    } catch {
      flash("Não foi possível abrir o histórico clínico.", true);
    }
  };

  if (loading) return <div className="page-loader">Carregando Prontuvia…</div>;
  if (!session)
    return signupPlan ? (
      <SignupPage initialPlan={signupPlan} back={() => setSignupPlan(null)} />
    ) : (
      <PublicAccessPage
        login={login}
        setLogin={setLogin}
        submit={submitLogin}
        error={error}
        onSignup={setSignupPlan}
      />
    );

  const navItems = [
    { label: "Visão geral", icon: "home" },
    { label: "Agenda", icon: "calendar" },
    { label: "Pacientes", icon: "patients" },
    { label: "Prontuários", icon: "record" },
    ...(["owner", "admin", "clinician"].includes(session.role)
      ? [{ label: "Clínico FHIR", icon: "record" as const }]
      : []),
    { label: "Documentos", icon: "documents" },
    { label: "Financeiro", icon: "finance" },
    { label: "Relatórios", icon: "reports" },
    ...(["owner", "admin", "finance"].includes(session.role)
      ? [{ label: "Gestão avançada", icon: "reports" as const }]
      : []),
    ...(["owner", "admin"].includes(session.role)
      ? [{ label: "Comunicação", icon: "communication" as const }]
      : []),
    { label: "Segurança", icon: "security" },
    ...(["owner", "admin"].includes(session.role)
      ? [{ label: "Configurações", icon: "settings" as const }]
      : []),
  ] as const;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img
            className="brand-logo small"
            src="/prontuvia-symbol.png"
            alt="Símbolo Prontuvia"
          />
          <div>
            <b>Prontuvia</b>
            <span>PEP clínico</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.label}
              className={active === item.label ? "active" : ""}
              onClick={() => setActive(item.label)}
            >
              <SidebarIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>Prontuvia 2.0</span>
          <small>Versão 2.0.1 · modo integrado</small>
        </div>
      </aside>
      <main className="dashboard">
        <header>
          <div className="search-placeholder">
            ⌕&nbsp;&nbsp; Buscar paciente ou atendimento
          </div>
          <ProfileMenu
            user={session.user}
            tenantName={context?.tenant.name ?? session.role}
            onLogout={logout}
          />
        </header>
        <div className="dashboard-content">
          <div className="heading">
            <div>
              <span className="eyebrow">
                {context?.tenant.name} · dados fictícios
              </span>
              <h1>
                {active === "Visão geral"
                  ? `Olá, ${context?.professionals.some((professional) => professional.id === session.user.id) ? "Dr(a). " : ""}${session.user.name.split(" ")[0]}`
                  : active}
              </h1>
              <p>
                {active === "Agenda"
                  ? "Organize e conduza o fluxo de atendimento."
                  : active === "Prontuários"
                    ? "Histórico clínico protegido e auditável."
                    : active === "Relatórios"
                      ? "Indicadores operacionais da sua clínica."
                      : active === "Clínico FHIR"
                        ? "Núcleo clínico Medplum integrado ao Prontuvia."
                      : active === "Gestão avançada"
                        ? "TISS, glosas, fiscal, conciliação, migração e inteligência."
                      : active === "Comunicação"
                        ? "Confirmações, lembretes e acesso digital do paciente."
                        : "Núcleo local do Prontuvia."}
              </p>
            </div>
            {active === "Pacientes" && (
              <button
                className="primary-button compact"
                onClick={() => setShowPatientForm(true)}
              >
                + Novo paciente
              </button>
            )}
            {active === "Agenda" && (
              <button
                className="primary-button compact"
                onClick={() => openAppointmentForm()}
              >
                + Novo agendamento
              </button>
            )}
          </div>
          {message && <div className="form-message success">{message}</div>}
          {error && <div className="form-message error banner">{error}</div>}
          {active === "Visão geral" && (
            <Overview
              patients={patients}
              appointments={appointments}
              setActive={setActive}
            />
          )}
          {active === "Agenda" && (
            <Agenda
              date={agendaDate}
              setDate={setAgendaDate}
              mode={agendaMode}
              setMode={setAgendaMode}
              appointments={appointments}
              context={context}
              onStatus={updateStatus}
              onStart={startEncounter}
              onNew={openAppointmentForm}
              onDetails={setSelectedAppointment}
              onWaitlist={() => setShowWaitlist(true)}
            />
          )}
          {active === "Pacientes" && (
            <Patients
              patients={patients}
              onNew={() => openPatientForm()}
              onEdit={openPatientForm}
              onTimeline={openTimeline}
            />
          )}
          {active === "Prontuários" && (
            <Records
              patients={patients}
              selected={timelinePatient}
              timeline={timeline}
              fhirSummary={fhirSummary}
              onSelect={openTimeline}
            />
          )}
          {active === "Clínico FHIR" && <ClinicalWorkspace />}
          {active === "Documentos" && (
            <DocumentCenter
              patients={patients}
              branding={
                context?.tenant.profile
                  ? {
                      displayName: context.tenant.profile.displayName,
                      entityType: context.tenant.profile.entityType,
                      professionalRegistration:
                        context.tenant.profile.professionalRegistration,
                      headerNote: context.tenant.profile.documentHeaderNote,
                    }
                  : {
                      displayName: context?.tenant.name ?? "Prontuvia",
                      entityType: "clinic",
                      professionalRegistration: null,
                      headerNote: null,
                    }
              }
            />
          )}
          {active === "Financeiro" && (
            <FinancialReports
              patients={patients}
              professionals={context?.professionals ?? []}
              role={session.role}
            />
          )}
          {active === "Segurança" && context && (
            <div className="settings-stack">
              <ProfileSettings
                profile={context.tenant.profile}
                onSaved={() => void loadContext()}
              />
              <AccessManagementPanel
                currentUserId={session.user.id}
                currentTenantId={session.tenantId}
                onTenantChanged={() => window.location.reload()}
              />
            </div>
          )}
          {active === "Relatórios" && (
            <OperationalReports
              professionals={context?.professionals ?? []}
              role={session.role}
            />
          )}
          {active === "Gestão avançada" && (
            <EnterpriseSuite patients={patients} appointments={appointments} />
          )}
          {active === "Comunicação" && context && (
            <CommunicationCenter slug={context.tenant.slug} />
          )}
          {active === "Configurações" && context && (
            <ClinicOperationsSettings
              professionals={context.professionals}
              units={context.units}
              onProceduresChanged={() => void loadContext()}
            />
          )}
        </div>
      </main>
      {showPatientForm && (
        <PatientModal
          form={patientForm}
          setForm={setPatientForm}
          submit={submitPatient}
          editing={Boolean(editingPatient)}
          saving={savingPatient}
          close={() => {
            setShowPatientForm(false);
            setEditingPatient(null);
          }}
        />
      )}
      {showAppointmentForm && (
        <AppointmentModal
          form={appointmentForm}
          setForm={setAppointmentForm}
          patients={patients}
          context={context}
          submit={submitAppointment}
          editing={Boolean(editingAppointment)}
          close={() => {
            setShowAppointmentForm(false);
            setEditingAppointment(null);
            setWaitlistSchedulingId(null);
          }}
        />
      )}
      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          patient={
            patients.find(
              (item) => item.id === selectedAppointment.patient_id,
            ) ?? null
          }
          onStatus={async (status) => {
            await updateStatus(selectedAppointment, status);
            setSelectedAppointment(null);
          }}
          onStart={() => startEncounter(selectedAppointment)}
          onEdit={() => editAppointment(selectedAppointment)}
          close={() => setSelectedAppointment(null)}
        />
      )}
      {showWaitlist && (
        <WaitlistPanel
          patients={patients}
          context={context}
          close={() => setShowWaitlist(false)}
          onSchedule={scheduleWaitlist}
        />
      )}
      {encounterLaunch && (
        <EncounterLaunchModal
          patientName={encounterLaunch.appointment.patient_name}
          error={encounterLaunch.error}
          retry={() => startEncounter(encounterLaunch.appointment)}
          close={() => setEncounterLaunch(null)}
        />
      )}
      {editor && (
        <ClinicalErrorBoundary
          key={editor.noteId}
          onClose={() => setEditor(null)}
        >
          <ClinicalEditorModal
            editor={editor}
            setEditor={setEditor}
            save={saveDraft}
            finalize={finalize}
            close={() => setEditor(null)}
          />
        </ClinicalErrorBoundary>
      )}
      {error && selectedAppointment && (
        <div className="floating-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function Login({
  login,
  setLogin,
  submit,
  error,
  onSignup,
}: {
  login: { email: string; password: string; tenantSlug: string };
  setLogin: (value: typeof login) => void;
  submit: (event: FormEvent) => void;
  error: string;
  onSignup: () => void;
}) {
  return (
    <main className="login-page">
      <section className="login-brand">
        <img
          className="brand-logo"
          src="/prontuvia-symbol.png"
          alt="Símbolo Prontuvia"
        />
        <span>Prontuvia</span>
        <h1>O cuidado encontra seu caminho.</h1>
        <p>
          PEP multi-clínica para organizar agenda, atendimento e histórico
          clínico.
        </p>
        <div className="login-points">
          <span>✓ Acesso por clínica</span>
          <span>✓ Prontuário auditável</span>
          <span>✓ Dados isolados</span>
        </div>
      </section>
      <section className="login-card">
        <span className="eyebrow">Acesso ao Prontuvia</span>
        <h2>Entrar</h2>
        <p>Use seu e-mail, senha e identificador da clínica.</p>
        <form onSubmit={submit}>
          <label>
            E-mail
            <input
              value={login.email}
              onChange={(event) =>
                setLogin({ ...login, email: event.target.value })
              }
              type="email"
              required
            />
          </label>
          <label>
            Senha
            <input
              value={login.password}
              onChange={(event) =>
                setLogin({ ...login, password: event.target.value })
              }
              type="password"
              required
            />
          </label>
          <label>
            Identificador da clínica
            <input
              value={login.tenantSlug}
              onChange={(event) =>
                setLogin({ ...login, tenantSlug: event.target.value })
              }
              required
            />
          </label>
          {error && <div className="form-message error">{error}</div>}
          <button className="primary-button" type="submit">
            Entrar <span>→</span>
          </button>
          <button className="secondary-button" type="button" onClick={onSignup}>
            Criar nova conta
          </button>
        </form>
      </section>
    </main>
  );
}

function Overview({
  patients,
  appointments,
  setActive,
}: {
  patients: Patient[];
  appointments: Appointment[];
  setActive: (view: string) => void;
}) {
  const count = (status: AppointmentStatus) =>
    appointments.filter((item) => item.status === status).length;
  return (
    <>
      <section className="metrics dashboard-kpis">
        <Metric
          label="Pacientes agendados"
          value={String(
            appointments.filter(
              (item) => !["cancelled", "no_show"].includes(item.status),
            ).length,
          )}
          note="Período carregado"
        />
        <Metric
          label="Pacientes confirmados"
          value={String(count("confirmed"))}
          note="Confirmações registradas"
        />
        <Metric
          label="Pacientes atendidos"
          value={String(count("completed"))}
          note="Prontuários finalizados"
        />
        <Metric
          label="Pacientes que faltaram"
          value={String(count("no_show"))}
          note="Ausências registradas"
        />
      </section>
      <section className="overview-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">
                Agenda clínica · {patients.length} pacientes cadastrados
              </span>
              <h2>Próximos atendimentos</h2>
            </div>
            <button onClick={() => setActive("Agenda")}>Abrir agenda →</button>
          </div>
          {appointments.length ? (
            <div className="patient-list">
              {appointments.slice(0, 5).map((item) => (
                <div className="patient-row" key={item.id}>
                  <span className="time-pill">
                    {formatTime(item.starts_at)}
                  </span>
                  <div>
                    <b>{item.patient_name}</b>
                    <small>
                      {item.type} · {item.professional_name}
                    </small>
                  </div>
                  <span className={`status ${item.status}`}>
                    {statusLabels[item.status]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Nenhum atendimento no período.</div>
          )}
        </article>
        <article className="panel accent">
          <span className="eyebrow">Fluxo clínico ativo</span>
          <h2>Do agendamento ao histórico</h2>
          <p>
            Cadastre um paciente, agende, confirme a chegada, inicie o
            atendimento e finalize o prontuário.
          </p>
          <div className="progress">
            <span />
          </div>
          <small>Primeiro fluxo assistencial conectado</small>
        </article>
      </section>
    </>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Agenda({
  date,
  setDate,
  mode,
  setMode,
  appointments,
  context,
  onNew,
  onDetails,
  onWaitlist,
}: {
  date: string;
  setDate: (date: string) => void;
  mode: "day" | "week";
  setMode: (mode: "day" | "week") => void;
  appointments: Appointment[];
  context: ClinicContext | null;
  onStatus: (item: Appointment, status: AppointmentStatus) => void;
  onStart: (item: Appointment) => void;
  onNew: (date?: string, hour?: number, minute?: number) => void;
  onDetails: (item: Appointment) => void;
  onWaitlist: () => void;
}) {
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const selected = new Date(`${date}T12:00:00`);
  const days =
    mode === "week"
      ? Array.from({ length: 7 }, (_, index) => {
          const value = weekStart(date);
          value.setDate(value.getDate() + index);
          return value;
        })
      : [selected];
  const visibleAppointments = appointments.filter(
    (item) =>
      (!professionalFilter ||
        item.professional_user_id === professionalFilter) &&
      (!unitFilter || item.unit_id === unitFilter),
  );
  const selectedDayAppointments = visibleAppointments.filter(
    (item) =>
      localDate(new Date(item.starts_at)) === date &&
      !["cancelled", "no_show"].includes(item.status),
  );
  const move = (amount: number) => {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + amount);
    setDate(localDate(value));
  };
  return (
    <div className="agenda-layout">
      <aside className="panel day-patients">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Pacientes do dia</span>
            <h2>
              {new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                month: "short",
              }).format(selected)}
            </h2>
          </div>
          <button
            type="button"
            className="waitlist-shortcut"
            onClick={onWaitlist}
          >
            Lista de espera
          </button>
        </div>
        {selectedDayAppointments.length ? (
          selectedDayAppointments.map((item) => (
            <button key={item.id} onClick={() => onDetails(item)}>
              <b>{formatTime(item.starts_at)}</b>
              <span>{item.patient_name}</span>
              <small>{statusLabels[item.status]}</small>
            </button>
          ))
        ) : (
          <div className="empty">Nenhum paciente nesta data.</div>
        )}
      </aside>
      <section className="panel agenda-panel">
        <div className="agenda-filters">
          <label>
            Profissional
            <select
              value={professionalFilter}
              onChange={(event) => setProfessionalFilter(event.target.value)}
            >
              <option value="">Todas as agendas</option>
              {context?.professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unidade
            <select
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
            >
              <option value="">Todas as unidades</option>
              {context?.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="agenda-toolbar">
          <div className="date-navigation">
            <button onClick={() => move(mode === "week" ? -7 : -1)}>‹</button>
            <button onClick={() => setDate(localDate())}>Hoje</button>
            <button onClick={() => move(mode === "week" ? 7 : 1)}>›</button>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="agenda-mode">
            <button type="button" onClick={onWaitlist}>
              Lista de espera
            </button>
            <button
              className={mode === "day" ? "active" : ""}
              onClick={() => setMode("day")}
            >
              Dia
            </button>
            <button
              className={mode === "week" ? "active" : ""}
              onClick={() => setMode("week")}
            >
              Semana
            </button>
          </div>
        </div>
        <CalendarGrid
          days={days}
          appointments={visibleAppointments}
          onNew={onNew}
          onDetails={onDetails}
        />
      </section>
    </div>
  );
}

function CalendarGrid({
  days,
  appointments,
  onNew,
  onDetails,
}: {
  days: Date[];
  appointments: Appointment[];
  onNew: (date?: string, hour?: number, minute?: number) => void;
  onDetails: (item: Appointment) => void;
}) {
  const slots = Array.from({ length: 21 }, (_, index) => ({
    hour: 8 + Math.floor(index / 2),
    minute: index % 2 ? 30 : 0,
  }));
  return (
    <div className={`calendar-grid columns-${days.length}`}>
      <div className="calendar-corner" />
      {days.map((day) => (
        <div
          className={`calendar-day ${localDate(day) === localDate() ? "today" : ""}`}
          key={localDate(day)}
        >
          <b>
            {new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(day)}
          </b>
          <span>
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "short",
            }).format(day)}
          </span>
        </div>
      ))}
      {slots.flatMap((slot) => [
        <div className="calendar-time" key={`time-${slot.hour}-${slot.minute}`}>
          {String(slot.hour).padStart(2, "0")}:
          {String(slot.minute).padStart(2, "0")}
        </div>,
        ...days.map((day) => {
          const dayKey = localDate(day);
          const inCell = appointments.filter((item) => {
            const start = new Date(item.starts_at);
            return (
              localDate(start) === dayKey &&
              start.getHours() === slot.hour &&
              Math.floor(start.getMinutes() / 30) * 30 === slot.minute
            );
          });
          return (
            <div
              className="calendar-cell"
              key={`${dayKey}-${slot.hour}-${slot.minute}`}
              onDoubleClick={() => onNew(dayKey, slot.hour, slot.minute)}
            >
              {inCell.map((item) => (
                <button
                  key={item.id}
                  style={
                    item.procedure_color
                      ? { borderLeftColor: item.procedure_color }
                      : undefined
                  }
                  className={`calendar-event ${item.status}`}
                  onClick={() => onDetails(item)}
                >
                  <b>
                    {formatTime(item.starts_at)} {item.patient_name}
                  </b>
                  <small>{item.type}</small>
                </button>
              ))}
            </div>
          );
        }),
      ])}
    </div>
  );
}

function AppointmentDetails({
  appointment,
  patient,
  onStatus,
  onStart,
  close,
}: {
  appointment: Appointment;
  patient: Patient | null;
  onStatus: (status: AppointmentStatus) => void;
  onStart: () => void;
  close: () => void;
}) {
  return (
    <div className="modal-layer">
      <section className="appointment-details">
        <header>
          <div>
            <span className="eyebrow">Detalhes do agendamento</span>
            <h2>{appointment.patient_name}</h2>
          </div>
          <button onClick={close}>×</button>
        </header>
        <div className="appointment-person">
          <span className="detail-avatar">
            {appointment.patient_name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <b>{appointment.patient_name}</b>
            <span>{patient?.phone ?? "Telefone não informado"}</span>
            <small>
              {ageFromDate(patient?.birth_date ?? null)} · Última consulta será
              calculada pelo histórico
            </small>
          </div>
        </div>
        <div className="detail-date">
          <strong>
            {formatDateTime(appointment.starts_at)} até{" "}
            {formatTime(appointment.ends_at)}
          </strong>
          <span className={`status ${appointment.status}`}>
            {statusLabels[appointment.status]}
          </span>
        </div>
        <div className="detail-section">
          <span>PROCEDIMENTO</span>
          <div>
            <b>{appointment.type}</b>
            <small>Profissional: {appointment.professional_name}</small>
          </div>
        </div>
        {appointment.notes && (
          <div className="detail-notes">
            <span>Observações</span>
            <p>{appointment.notes}</p>
          </div>
        )}
        <footer>
          {appointment.status === "scheduled" && (
            <button
              className="secondary-button"
              onClick={() => onStatus("confirmed")}
            >
              Confirmar
            </button>
          )}
          {["scheduled", "confirmed"].includes(appointment.status) && (
            <button
              className="secondary-button"
              onClick={() => onStatus("waiting")}
            >
              Marcar chegada
            </button>
          )}
          {["scheduled", "confirmed", "waiting", "in_progress"].includes(
            appointment.status,
          ) && (
            <button className="primary-button compact" onClick={onStart}>
              {appointment.status === "in_progress"
                ? "Continuar atendimento"
                : "Iniciar atendimento"}
            </button>
          )}
          {["scheduled", "confirmed", "waiting"].includes(
            appointment.status,
          ) && (
            <button
              className="danger-button"
              onClick={() => onStatus("cancelled")}
            >
              Cancelar
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function Patients({
  patients,
  onNew,
  onEdit,
  onTimeline,
}: {
  patients: Patient[];
  onNew: () => void;
  onEdit: (patient: Patient) => void;
  onTimeline: (patient: Patient) => void;
}) {
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLocaleLowerCase("pt-BR");
  const visible = patients.filter(
    (patient) =>
      !normalized ||
      [
        patient.full_name,
        patient.preferred_name,
        patient.phone,
        patient.email,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalized)),
  );
  return (
    <section className="panel patients-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Cadastro de pacientes</span>
          <h2>Pacientes da clínica</h2>
        </div>
        <button className="primary-button compact" onClick={onNew}>
          + Novo paciente
        </button>
      </div>
      <div className="patient-search">
        <span>⌕</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, nome social, telefone ou e-mail"
        />
        <small>{visible.length} resultado(s)</small>
      </div>
      <div className="table-head">
        <span>Paciente</span>
        <span>Contato</span>
        <span>Idade / convênio</span>
        <span>Ações</span>
      </div>
      {visible.length ? (
        visible.map((patient) => (
          <div className="table-row" key={patient.id}>
            <div className="patient-cell">
              <span className="avatar">{patient.full_name[0]}</span>
              <div>
                <b>{patient.full_name}</b>
                <small>{patient.preferred_name ?? "Cadastro principal"}</small>
              </div>
            </div>
            <span>{patient.phone ?? patient.email ?? "—"}</span>
            <span>
              {ageFromDate(patient.birth_date)}
              {patient.insurance?.name ? ` · ${patient.insurance.name}` : ""}
            </span>
            <div className="patient-row-actions">
              <button className="table-action" onClick={() => onEdit(patient)}>
                Editar
              </button>
              <button
                className="table-action"
                onClick={() => onTimeline(patient)}
              >
                Histórico →
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="empty">Nenhum paciente encontrado.</div>
      )}
    </section>
  );
}

function Records({
  patients,
  selected,
  timeline,
  fhirSummary,
  onSelect,
}: {
  patients: Patient[];
  selected: Patient | null;
  timeline: TimelineItem[];
  fhirSummary:FhirPatientSummary|null;
  onSelect: (patient: Patient) => void;
}) {
  return (
    <section className="records-grid">
      <article className="panel record-patients">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Paciente</span>
            <h2>Selecionar histórico</h2>
          </div>
        </div>
        {patients.map((patient) => (
          <button
            key={patient.id}
            className={selected?.id === patient.id ? "selected" : ""}
            onClick={() => onSelect(patient)}
          >
            <span className="avatar">{patient.full_name[0]}</span>
            {patient.full_name}
          </button>
        ))}
      </article>
      <article className="panel timeline-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Linha do tempo</span>
            <h2>{selected?.full_name ?? "Escolha um paciente"}</h2>
          </div>
        </div>
        {!selected ? (
          <div className="empty large">
            Selecione um paciente para visualizar seus atendimentos.
          </div>
        ) : <><div className="fhir-summary-strip"><span className={`integration-pill ${fhirSummary?"online":""}`}>{fhirSummary?`FHIR conectado · ${fhirSummary.fhirPatientId.slice(0,8)}`:"Aguardando sincronização FHIR"}</span>{fhirSummary&&<>{fhirSummary.allergies.slice(0,3).map((item,index)=><span className="status cancelled" key={item.id??index}>Alergia: {item.code?.text??"registrada"}</span>)}<span>{fhirSummary.conditions.length} diagnóstico(s)</span><span>{fhirSummary.medications.length} prescrição(ões)</span><span>{fhirSummary.exams.length} exame(s)</span><span>{fhirSummary.documents.length} documento(s)</span></>}</div>{timeline.length ? (
          <div className="timeline">
            {timeline.map((item) => (
              <article key={item.encounter_id}>
                <span className="timeline-dot" />
                <div>
                  <div className="timeline-heading">
                    <b>{formatDateTime(item.started_at)}</b>
                    <span
                      className={`status ${item.note_status === "finalized" ? "completed" : "in_progress"}`}
                    >
                      {item.note_status === "finalized"
                        ? "Finalizado"
                        : "Rascunho"}
                    </span>
                  </div>
                  <small>Profissional: {item.author_name}</small>
                  <dl>
                    <dt>Queixa principal</dt>
                    <dd>{item.content?.chiefComplaint || "Não informada"}</dd>
                    <dt>Avaliação</dt>
                    <dd>{item.content?.assessment || "Não informada"}</dd>
                    {item.content?.diagnosisCid && (
                      <>
                        <dt>Diagnóstico</dt>
                        <dd>
                          {item.content.diagnosisCid} ·{" "}
                          {item.content.diagnosisDescription}
                        </dd>
                      </>
                    )}
                    <dt>Plano</dt>
                    <dd>{item.content?.plan || "Não informado"}</dd>
                    {item.content?.prescriptions && (
                      <>
                        <dt>Prescrição</dt>
                        <dd>{item.content.prescriptions}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty large">
            Ainda não existem atendimentos para este paciente.
          </div>
        )}</>}
      </article>
    </section>
  );
}

function PatientModal({
  form,
  setForm,
  submit,
  editing,
  saving,
  close,
}: {
  form: {
    fullName: string;
    preferredName: string;
    birthDate: string;
    sexAtBirth: string;
    genderIdentity: string;
    phone: string;
    email: string;
    insuranceName: string;
    allergies: string;
    alerts: string;
  };
  setForm: (value: typeof form) => void;
  submit: (event: FormEvent) => void;
  editing: boolean;
  saving: boolean;
  close: () => void;
}) {
  return (
    <div className="modal-layer">
      <form className="patient-modal patient-modal-large" onSubmit={submit}>
        <button type="button" className="close" onClick={close}>
          ×
        </button>
        <span className="eyebrow">Cadastro clínico</span>
        <h2>{editing ? "Editar paciente" : "Novo paciente"}</h2>
        <div className="patient-form-grid">
          <label>
            Nome completo
            <input
              value={form.fullName}
              onChange={(event) =>
                setForm({ ...form, fullName: event.target.value })
              }
              required
              minLength={2}
            />
          </label>
          <label>
            Nome social ou preferido
            <input
              value={form.preferredName}
              onChange={(event) =>
                setForm({ ...form, preferredName: event.target.value })
              }
            />
          </label>
          <label>
            Data de nascimento
            <input
              type="date"
              value={form.birthDate}
              onChange={(event) =>
                setForm({ ...form, birthDate: event.target.value })
              }
            />
          </label>
          <label>
            Sexo ao nascimento
            <select
              value={form.sexAtBirth}
              onChange={(event) =>
                setForm({ ...form, sexAtBirth: event.target.value })
              }
            >
              <option value="">Não informado</option>
              <option value="female">Feminino</option>
              <option value="male">Masculino</option>
              <option value="intersex">Intersexo</option>
              <option value="unknown">Desconhecido</option>
            </select>
          </label>
          <label>
            Identidade de gênero
            <input
              value={form.genderIdentity}
              onChange={(event) =>
                setForm({ ...form, genderIdentity: event.target.value })
              }
            />
          </label>
          <label>
            Convênio
            <input
              value={form.insuranceName}
              onChange={(event) =>
                setForm({ ...form, insuranceName: event.target.value })
              }
              placeholder="Particular ou nome do convênio"
            />
          </label>
          <label>
            Telefone
            <input
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </label>
          <label className="full-field">
            Alergias conhecidas
            <input
              value={form.allergies}
              onChange={(event) =>
                setForm({ ...form, allergies: event.target.value })
              }
              placeholder="Separe por vírgulas"
            />
          </label>
          <label className="full-field">
            Alertas clínicos
            <input
              value={form.alerts}
              onChange={(event) =>
                setForm({ ...form, alerts: event.target.value })
              }
              placeholder="Separe por vírgulas"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>
            Cancelar
          </button>
          <button className="primary-button compact" type="submit" disabled={saving}>
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Salvar paciente"}
          </button>
        </div>
      </form>
    </div>
  );
}
function AppointmentModal({
  form,
  setForm,
  patients,
  context,
  submit,
  editing,
  close,
}: {
  form: {
    patientId: string;
    unitId: string;
    professionalUserId: string;
    procedureId: string;
    startsAt: string;
    endsAt: string;
    type: string;
    notes: string;
  };
  setForm: (value: typeof form) => void;
  patients: Patient[];
  context: ClinicContext | null;
  submit: (event: FormEvent) => void;
  editing: boolean;
  close: () => void;
}) {
  const chooseProcedure = (procedureId: string) => {
    const procedure = context?.procedures.find(
      (item) => item.id === procedureId,
    );
    if (!procedure) {
      setForm({ ...form, procedureId });
      return;
    }
    const start = new Date(form.startsAt);
    const end = new Date(start.getTime() + procedure.duration_minutes * 60000);
    setForm({
      ...form,
      procedureId,
      type: procedure.name,
      endsAt: dateTimeValue(end),
    });
  };
  const selected = context?.procedures.find(
    (item) => item.id === form.procedureId,
  );
  return (
    <div className="modal-layer">
      <form
        className="patient-modal appointment-modal appointment-modal-v13"
        onSubmit={submit}
      >
        <button type="button" className="close" onClick={close}>
          ×
        </button>
        <span className="eyebrow">Agenda clínica</span>
        <h2>{editing ? "Editar agendamento" : "Novo agendamento"}</h2>
        <label>
          Paciente
          <select
            value={form.patientId}
            onChange={(event) =>
              setForm({ ...form, patientId: event.target.value })
            }
            required
          >
            <option value="">Selecione</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Procedimento
          <select
            value={form.procedureId}
            onChange={(event) => chooseProcedure(event.target.value)}
          >
            <option value="">Outro / informar manualmente</option>
            {context?.procedures.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.duration_minutes} min ·{" "}
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(Number(item.price))}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <div className="appointment-procedure-summary">
            <i style={{ background: selected.color }} />
            <span>
              <b>{selected.name}</b>
              <small>
                {selected.duration_minutes} min · profissional{" "}
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(Number(selected.professional_amount))}
              </small>
            </span>
            <strong>
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(Number(selected.price))}
            </strong>
          </div>
        )}
        <div className="form-grid">
          <label>
            Início
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm({ ...form, startsAt: event.target.value })
              }
              required
            />
          </label>
          <label>
            Fim
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm({ ...form, endsAt: event.target.value })
              }
              required
            />
          </label>
        </div>
        <label>
          Profissional
          <select
            value={form.professionalUserId}
            onChange={(event) =>
              setForm({ ...form, professionalUserId: event.target.value })
            }
            required
          >
            {context?.professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <select
            value={form.unitId}
            onChange={(event) =>
              setForm({ ...form, unitId: event.target.value })
            }
            required
          >
            {context?.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        {!form.procedureId && (
          <label>
            Tipo
            <input
              value={form.type}
              onChange={(event) =>
                setForm({ ...form, type: event.target.value })
              }
              required
            />
          </label>
        )}
        <label>
          Observações
          <textarea
            value={form.notes}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>
            Cancelar
          </button>
          <button className="primary-button compact" type="submit">
            {editing ? "Salvar alterações" : "Agendar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ClinicalEditor({
  editor,
  setEditor,
  save,
  finalize,
  close,
}: {
  editor: Editor;
  setEditor: (value: Editor) => void;
  save: () => Promise<unknown>;
  finalize: () => Promise<void>;
  close: () => void;
}) {
  const [section, setSection] = useState<"consultation" | "vitals" | "conduct">(
    "consultation",
  );
  const update = (key: keyof ClinicalContent, value: string) =>
    setEditor({ ...editor, content: { ...editor.content, [key]: value } });
  const area = (
    key: keyof ClinicalContent,
    label: string,
    placeholder: string,
    className = "",
  ) => (
    <label className={className}>
      {label}
      <textarea
        value={editor.content[key]}
        onChange={(event) => update(key, event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
  const input = (
    key: keyof ClinicalContent,
    label: string,
    placeholder: string,
    suffix?: string,
  ) => (
    <label>
      {label}
      <div className="clinical-input">
        <input
          value={editor.content[key]}
          onChange={(event) => update(key, event.target.value)}
          placeholder={placeholder}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </label>
  );
  return (
    <div className="clinical-layer">
      <section className="clinical-editor expanded">
        <header>
          <div>
            <span className="eyebrow">Atendimento em andamento</span>
            <h2>{editor.patientName}</h2>
            <div className="patient-clinical-summary">
              <span>{ageFromDate(editor.patientBirthDate)}</span>
              <span>{editor.patientPhone ?? "Sem telefone"}</span>
              {editor.patientAlerts.map((alert) => (
                <span className="clinical-alert" key={alert}>
                  ⚠ {alert}
                </span>
              ))}
            </div>
          </div>
          <button onClick={close}>×</button>
        </header>
        <nav className="clinical-tabs">
          <button
            className={section === "consultation" ? "active" : ""}
            onClick={() => setSection("consultation")}
          >
            Consulta e anamnese
          </button>
          <button
            className={section === "vitals" ? "active" : ""}
            onClick={() => setSection("vitals")}
          >
            Sinais vitais e exame
          </button>
          <button
            className={section === "conduct" ? "active" : ""}
            onClick={() => setSection("conduct")}
          >
            Diagnóstico e conduta
          </button>
        </nav>
        <div className="editor-warning">
          Use somente dados fictícios nesta versão de desenvolvimento.
        </div>
        <div className="clinical-scroll">
          {section === "consultation" && (
            <div className="editor-form clinical-section">
              {area(
                "chiefComplaint",
                "Queixa principal *",
                "Motivo principal da consulta",
                "wide-field",
              )}
              {area(
                "historyPresentIllness",
                "História da doença atual",
                "Início, duração, evolução, fatores de melhora e piora",
                "wide-field",
              )}
              {area(
                "subjective",
                "Relato do paciente",
                "Sintomas e informações relatadas",
              )}
              {area(
                "medicalHistory",
                "Antecedentes pessoais",
                "Doenças, cirurgias, internações e condições anteriores",
              )}
              {area(
                "familyHistory",
                "Histórico familiar",
                "Condições relevantes na família",
              )}
              {area(
                "medicationsInUse",
                "Medicamentos em uso",
                "Nome, dose e frequência",
              )}
              {area(
                "allergies",
                "Alergias",
                "Medicamentos, alimentos e outras alergias",
                "wide-field",
              )}
            </div>
          )}
          {section === "vitals" && (
            <div className="clinical-section">
              <div className="vitals-grid">
                {input("bloodPressure", "Pressão arterial", "120/80", "mmHg")}
                {input("heartRate", "Frequência cardíaca", "72", "bpm")}
                {input(
                  "respiratoryRate",
                  "Frequência respiratória",
                  "18",
                  "irpm",
                )}
                {input("temperature", "Temperatura", "36,5", "°C")}
                {input("oxygenSaturation", "Saturação", "98", "%")}
                {input("weight", "Peso", "70,0", "kg")}
                {input("height", "Altura", "170", "cm")}
              </div>
              <div className="examination-grid">
                {area(
                  "objective",
                  "Exame físico e achados objetivos",
                  "Estado geral, exame por aparelhos e achados relevantes",
                  "wide-field",
                )}
                {area(
                  "assessment",
                  "Avaliação clínica *",
                  "Impressão clínica, hipóteses e interpretação dos achados",
                  "wide-field",
                )}
              </div>
            </div>
          )}
          {section === "conduct" && (
            <div className="editor-form clinical-section">
              <div className="diagnosis-row">
                <label>
                  CID-10
                  <input
                    value={editor.content.diagnosisCid}
                    onChange={(event) =>
                      update("diagnosisCid", event.target.value.toUpperCase())
                    }
                    placeholder="Ex.: J06.9"
                  />
                </label>
                <label>
                  Descrição do diagnóstico
                  <input
                    value={editor.content.diagnosisDescription}
                    onChange={(event) =>
                      update("diagnosisDescription", event.target.value)
                    }
                    placeholder="Descrição clínica"
                  />
                </label>
              </div>
              {area(
                "plan",
                "Conduta e plano terapêutico *",
                "Tratamento, orientações e acompanhamento",
                "wide-field",
              )}
              {area(
                "prescriptions",
                "Prescrição",
                "Medicamento, apresentação, dose, via, frequência e duração",
              )}
              {area(
                "examRequests",
                "Solicitação de exames",
                "Exames solicitados e justificativa",
              )}
              {area(
                "returnInstructions",
                "Orientações de retorno",
                "Prazo e condições para reavaliação",
                "wide-field",
              )}
            </div>
          )}
        </div>
        <footer>
          <button className="secondary-button" onClick={close}>
            Fechar
          </button>
          <button
            className="secondary-button"
            onClick={() => save().then(() => undefined)}
          >
            Salvar rascunho
          </button>
          <button className="primary-button compact" onClick={finalize}>
            Finalizar e assinar
          </button>
        </footer>
      </section>
    </div>
  );
}
function ModulePlaceholder({ name }: { name: string }) {
  return (
    <section className="module-placeholder">
      <div className="placeholder-icon">◈</div>
      <span className="eyebrow">Próxima etapa</span>
      <h2>{name}</h2>
      <p>
        Este módulo continuará sendo construído sobre a segurança, autorização e
        isolamento multi-clínica do Prontuvia.
      </p>
      <div className="placeholder-list">
        <span>✓ Permissões por perfil</span>
        <span>✓ Auditoria</span>
        <span>✓ Isolamento por clínica</span>
      </div>
    </section>
  );
}
