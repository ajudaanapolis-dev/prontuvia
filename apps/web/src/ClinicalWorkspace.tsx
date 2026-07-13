import { useEffect, useState } from "react";

const apiUrl=import.meta.env.VITE_API_URL??"http://localhost:4000";
type Status={configured:boolean;connected:boolean;baseUrl:string;error?:string};

export function ClinicalWorkspace(){
 const[key,setKey]=useState(0);const[status,setStatus]=useState<Status|null>(null);const[expanded,setExpanded]=useState(false);
 useEffect(()=>{fetch(`${apiUrl}/v2/medplum/status`,{credentials:"include"}).then(response=>response.json()).then(setStatus).catch(()=>setStatus({configured:false,connected:false,baseUrl:"http://localhost:8103/",error:"API indisponível"}));},[]);
 return <section className={`clinical-workspace ${expanded?"expanded":""}`}>
  <div className="clinical-workspace-toolbar"><div><span className="eyebrow">Núcleo clínico FHIR</span><h2>Prontuvia Clínico</h2><p>Pacientes, agenda, encontros, timeline, exames, medicações e documentos Medplum dentro do painel principal.</p></div><div className="clinical-workspace-actions"><span className={`integration-pill ${status?.connected?"online":""}`}>{status?.connected?"Ponte FHIR conectada":status?.configured?"Medplum iniciando":"Configuração local"}</span><button onClick={()=>setKey(value=>value+1)}>Recarregar</button><button onClick={()=>setExpanded(value=>!value)}>{expanded?"Restaurar":"Tela maior"}</button><a href="http://localhost:5174" target="_blank" rel="noreferrer">Abrir separado</a></div></div>
  <div className="clinical-frame-notice"><b>Primeiro acesso:</b> entre ou registre a conta clínica Medplum uma única vez. Depois, a sessão permanecerá disponível neste painel.</div>
  <iframe key={key} className="clinical-frame" src="http://localhost:5174" title="Prontuvia Clínico FHIR" allow="microphone; camera; clipboard-read; clipboard-write" />
 </section>;
}
