import { FormEvent, useEffect, useState } from "react";
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
type Data = {
  clinic: { name: string };
  portalEnabled: boolean;
  booking: { autoConfirm:boolean;minimumNoticeHours:number;cancellationNoticeHours:number;requireBirthDate:boolean;terms:string };
  units: Array<{ id: string; name: string }>;
  specialties: Array<{ id: string; name: string }>;
  professionals: Array<{ id: string; name: string; specialty_ids: string[] }>;
  procedures: Array<{
    id: string;
    name: string;
    duration_minutes: number;
    price: string;
    color: string;
    specialty_ids: string[];
    professional_ids: string[];
  }>;
};
async function api<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? "request_failed");
  return payload;
}
export function OnlineBookingPage({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [slots, setSlots] = useState<Array<{startsAt:string;professionalUserId:string;professionalName:string}>>([]);
  const [availableDates,setAvailableDates]=useState<Array<{date:string;firstSlot:{startsAt:string;professionalUserId:string;professionalName:string};count:number}>>([]);
  const [success, setSuccess] = useState<{
    startsAt: string;
    clinicName: string;
    status:string;
    managementToken:string;
  } | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    birthDate: "",
    specialtyId: "",
    procedureId: "",
    professionalUserId: "",
    unitId: "",
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    startsAt: "",
    consentAccepted: false,
  });
  useEffect(() => {
    api<Data>(`/v1/public/booking/${slug}`)
      .then((value) => {
        setData(value);
        const specialtyId=value.specialties[0]?.id??"";
        const professionalUserId="";
        const procedureId=value.procedures.find(item=>item.specialty_ids.includes(specialtyId))?.id??"";
        setForm((current) => ({
          ...current,
          specialtyId,
          procedureId,
          professionalUserId,
          unitId: value.units[0]?.id ?? "",
        }));
      })
      .catch(() =>
        setError("O agendamento online desta clínica não está disponível."),
      );
  }, [slug]);
  const availableProfessionals=data?.professionals.filter(item=>item.specialty_ids.includes(form.specialtyId))??[];
  const availableProcedures=data?.procedures.filter(item=>item.specialty_ids.includes(form.specialtyId)&&(!form.professionalUserId||item.professional_ids.includes(form.professionalUserId)))??[];
  const loadSlots = async () => {
    setError("");
    try {
      const query = new URLSearchParams({
        date: form.date,
        specialtyId: form.specialtyId,
        procedureId: form.procedureId,
        unitId: form.unitId,
      });
      if(form.professionalUserId)query.set("professionalUserId",form.professionalUserId);
      const result = await api<{ items: Array<{startsAt:string;professionalUserId:string;professionalName:string}> }>(
        `/v1/public/booking/${slug}/slots?${query}`,
      );
      setSlots(result.items);
      if (!result.items.length)
        setError("Nenhum horário disponível nesta data.");
    } catch {
      setError("Não foi possível consultar os horários.");
    }
  };
  const loadAvailableDates=async()=>{setError("");try{const query=new URLSearchParams({from:form.date,specialtyId:form.specialtyId,procedureId:form.procedureId,unitId:form.unitId,days:"21"});if(form.professionalUserId)query.set("professionalUserId",form.professionalUserId);const result=await api<{items:typeof availableDates}>(`/v1/public/booking/${slug}/availability?${query}`);setAvailableDates(result.items);if(!result.items.length)setError("Nenhum horário disponível nos próximos dias.");}catch{setError("Não foi possível buscar os próximos dias disponíveis.");}};
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await api<{ startsAt: string; clinicName: string;status:string;managementToken:string }>(
        `/v1/public/booking/${slug}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            email: form.email || undefined,
            birthDate: form.birthDate || undefined,
          }),
        },
      );
      setSuccess(result);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "slot_unavailable"
          ? "Este horário acabou de ser ocupado. Escolha outro."
          : "Não foi possível concluir o agendamento.",
      );
    }
  };
  if (success)
    return (
      <main className="patient-public-page">
        <section className="public-patient-card success-card">
          <img src="/prontuvia-symbol.png" />
          <span className="eyebrow">{success.status==="confirmed"?"Agendamento confirmado":"Solicitação recebida"}</span>
          <h1>{success.status==="confirmed"?"Horário reservado":"Aguardando aprovação"}</h1>
          <p>{success.clinicName}</p>
          <strong>
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "full",
              timeStyle: "short",
            }).format(new Date(success.startsAt))}
          </strong>
          <p>
            Você receberá a confirmação e os lembretes pelo canal configurado
            pela clínica.
          </p>
          <a className="primary-button" href={`/agendar/${slug}/gerenciar/${success.managementToken}`}>Gerenciar agendamento</a>
        </section>
      </main>
    );
  return (
    <main className="patient-public-page">
      <section className="public-patient-card booking-card">
        <header>
          <img src="/prontuvia-symbol.png" />
          <div>
            <span className="eyebrow">Agendamento online</span>
            <h1>{data?.clinic.name ?? "Prontuvia"}</h1>
          </div>
        </header>
        {error && <div className="form-message error">{error}</div>}
        <form onSubmit={submit}>
          <label>
            Especialidade
            <select
              value={form.specialtyId}
              onChange={(e) => {
                const specialtyId=e.target.value;
                const professionalUserId="";
                const procedureId=data?.procedures.find(item=>item.specialty_ids.includes(specialtyId))?.id??"";
                setSlots([]);
                setAvailableDates([]);
                setForm({...form,specialtyId,professionalUserId,procedureId,startsAt:""});
              }}
            >
              {data?.specialties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profissional
            <select
              value={form.professionalUserId}
              onChange={(e) => {
                const professionalUserId=e.target.value;
                const procedureId=data?.procedures.find(item=>item.specialty_ids.includes(form.specialtyId)&&(!professionalUserId||item.professional_ids.includes(professionalUserId)))?.id??"";
                setSlots([]);
                setAvailableDates([]);
                setForm({...form,professionalUserId,procedureId,startsAt:""});
              }}
            >
              <option value="">Qualquer profissional disponível</option>
              {availableProfessionals.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {!availableProfessionals.length&&<small>Nenhum profissional disponível nesta especialidade.</small>}
          </label>
          <div className="public-form-grid">
            <label>
              Procedimento
              <select value={form.procedureId} onChange={(e)=>{setSlots([]);setForm({...form,procedureId:e.target.value,startsAt:""});}}>
                {availableProcedures.map((item)=><option key={item.id} value={item.id}>{item.name} · {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(item.price))}</option>)}
              </select>
            </label>
            <label>
              Unidade
              <select
                value={form.unitId}
                onChange={(e) =>
                  setForm({ ...form, unitId: e.target.value, startsAt: "" })
                }
              >
                {data?.units.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Data
            <input
              type="date"
              value={form.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) =>
                setForm({ ...form, date: e.target.value, startsAt: "" })
              }
            />
          </label>
          {(data?.booking?.minimumNoticeHours??0)>0&&<small>Agendamentos com pelo menos {data?.booking?.minimumNoticeHours} hora(s) de antecedência.</small>}
          <button
            type="button"
            className="secondary-button"
            disabled={!form.specialtyId||!form.procedureId||!form.unitId}
            onClick={() => void loadSlots()}
          >
            Consultar horários
          </button>
          <button type="button" className="booking-link-button" disabled={!form.specialtyId||!form.procedureId||!form.unitId} onClick={()=>void loadAvailableDates()}>Ver próximos dias disponíveis</button>
          {availableDates.length>0&&<div className="available-date-strip">{availableDates.map(item=><button type="button" key={item.date} onClick={()=>{setAvailableDates([]);setForm({...form,date:item.date,startsAt:item.firstSlot.startsAt,professionalUserId:item.firstSlot.professionalUserId});setSlots([item.firstSlot]);}}><b>{new Intl.DateTimeFormat("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(`${item.date}T12:00:00Z`))}</b><small>{item.count} horário(s) · a partir de {new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date(item.firstSlot.startsAt))}</small></button>)}</div>}
          {slots.length > 0 && (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  type="button"
                  key={`${slot.startsAt}-${slot.professionalUserId}`}
                  className={form.startsAt === slot.startsAt&&form.professionalUserId===slot.professionalUserId ? "selected" : ""}
                  onClick={() => setForm({ ...form, startsAt: slot.startsAt,professionalUserId:slot.professionalUserId })}
                >
                  {new Intl.DateTimeFormat("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(slot.startsAt))}
                  {!form.professionalUserId&&<small>{slot.professionalName}</small>}
                </button>
              ))}
            </div>
          )}
          <hr />
          <label>
            Nome completo
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <div className="public-form-grid">
            <label>
              WhatsApp
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </label>
            <label>
              Data de nascimento
              <input
                type="date"
                required={data?.booking?.requireBirthDate}
                value={form.birthDate}
                onChange={(e) =>
                  setForm({ ...form, birthDate: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            E-mail opcional
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="operation-check booking-consent"><input type="checkbox" checked={form.consentAccepted} onChange={e=>setForm({...form,consentAccepted:e.target.checked})} required/>{data?.booking?.terms??"Aceito os termos e a política de privacidade."}</label>
          <button className="primary-button" disabled={!form.startsAt||!form.consentAccepted}>
            {data?.booking?.autoConfirm?"Confirmar agendamento":"Solicitar agendamento"}
          </button>
        </form>
        {data?.portalEnabled && (
          <a href={`/portal/${slug}`}>Já sou paciente · acessar portal</a>
        )}
      </section>
    </main>
  );
}

type BookingManageData={clinic:{name:string};appointment:{id:string;starts_at:string;ends_at:string;type:string;status:string;professional_name:string;unit_name:string;cancellation_notice_hours:number}};
export function BookingManagePage({slug,token}:{slug:string;token:string}){
 const[data,setData]=useState<BookingManageData|null>(null);const[error,setError]=useState("");const[message,setMessage]=useState("");const[cancelled,setCancelled]=useState(false);const[date,setDate]=useState(new Date(Date.now()+86400000).toISOString().slice(0,10));const[availability,setAvailability]=useState<Array<{date:string;items:Array<{startsAt:string;professionalUserId:string;professionalName:string}>}>>([]);const[rescheduling,setRescheduling]=useState(false);
 const load=()=>api<BookingManageData>(`/v1/public/booking/${slug}/manage/${token}`).then(setData).catch(()=>setError("Este link não é válido ou expirou."));useEffect(()=>{void load();},[slug,token]);
 const cancel=async()=>{const reason=window.prompt("Informe o motivo do cancelamento:");if(!reason)return;try{await api(`/v1/public/booking/${slug}/manage/${token}/cancel`,{method:"PATCH",body:JSON.stringify({reason})});setCancelled(true);setMessage("Agendamento cancelado. A clínica foi informada.");}catch{setError("O prazo de cancelamento encerrou. Entre em contato com a clínica.");}};
 const findAvailability=async()=>{setError("");try{const result=await api<{items:typeof availability}>(`/v1/public/booking/${slug}/manage/${token}/availability?from=${date}&days=21`);setAvailability(result.items);if(!result.items.length)setError("Não encontramos novos horários nos próximos dias.");}catch{setError("Não foi possível consultar novos horários.");}};
 const reschedule=async(startsAt:string)=>{setRescheduling(true);setError("");try{await api(`/v1/public/booking/${slug}/manage/${token}/reschedule`,{method:"PATCH",body:JSON.stringify({startsAt})});setAvailability([]);setMessage("Consulta reagendada e novos lembretes programados.");await load();}catch{setError("Este horário não está mais disponível. Escolha outro.");}finally{setRescheduling(false);}};
 return <main className="patient-public-page"><section className="public-patient-card booking-card manage-booking-card"><header><img src="/prontuvia-symbol.png"/><div><span className="eyebrow">Gerenciar agendamento</span><h1>{data?.clinic.name??"Prontuvia"}</h1></div></header>{error&&<div className="form-message error">{error}</div>}{message&&<div className="form-message success">{message}</div>}{cancelled&&<p>Não há outras ações disponíveis para este agendamento.</p>}{data&&!cancelled&&<><div className="manage-current-booking"><span>Consulta atual</span><h2>{data.appointment.type}</h2><strong>{new Intl.DateTimeFormat("pt-BR",{dateStyle:"full",timeStyle:"short"}).format(new Date(data.appointment.starts_at))}</strong><p>{data.appointment.professional_name} · {data.appointment.unit_name}</p><small>Status: {data.appointment.status}</small></div>{["scheduled","confirmed"].includes(data.appointment.status)&&<><div className="reschedule-box"><label>Buscar nova data<input type="date" min={new Date().toISOString().slice(0,10)} value={date} onChange={event=>setDate(event.target.value)}/></label><button type="button" className="secondary-button" onClick={()=>void findAvailability()}>Ver próximos horários</button></div>{availability.map(group=><div className="manage-slot-day" key={group.date}><b>{new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long",timeZone:"UTC"}).format(new Date(`${group.date}T12:00:00Z`))}</b><div className="slot-grid">{group.items.map(slot=><button type="button" disabled={rescheduling} key={slot.startsAt} onClick={()=>void reschedule(slot.startsAt)}>{new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date(slot.startsAt))}</button>)}</div></div>)}<small>Cancelamento e reagendamento permitidos até {data.appointment.cancellation_notice_hours} hora(s) antes.</small><button className="booking-danger-button" onClick={()=>void cancel()}>Cancelar agendamento</button></>}</>}</section></main>;
}
