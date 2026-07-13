import type { FastifyInstance } from "fastify";
import type { Appointment, Composition, Encounter, Patient } from "@medplum/fhirtypes";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { config } from "../config.js";
import { withTenant } from "../db.js";
import { getMedplum, medplumConfigured } from "../medplum.js";
import { enqueueFhirSync, processPendingFhirSync } from "../fhir-sync.js";

const idParam = z.object({ id: z.uuid() });
const tenantIdentifier = "https://prontuvia.com.br/fhir/tenant";
const localIdentifier = "https://prontuvia.com.br/fhir/local-id";

export async function medplumBridgeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/status", async () => {
    if (!medplumConfigured()) return { configured:false, connected:false, baseUrl:config.MEDPLUM_BASE_URL };
    try { const medplum=await getMedplum(); const profile=medplum.getProfile(); return {configured:true,connected:true,baseUrl:config.MEDPLUM_BASE_URL,profile:profile?{resourceType:profile.resourceType,id:profile.id}:null}; }
    catch(error){ return {configured:true,connected:false,baseUrl:config.MEDPLUM_BASE_URL,error:error instanceof Error?error.message:"connection_failed"}; }
  });

  app.get("/sync", async (request) => withTenant(request.auth, async (db) => {
    const jobs = await db.query(
      `SELECT local_resource_type,local_resource_id,status,attempts,last_error,last_synced_at,updated_at
         FROM (SELECT j.*,l.last_synced_at FROM fhir_sync_jobs j
           LEFT JOIN LATERAL (SELECT max(last_synced_at) last_synced_at FROM fhir_resource_links l
             WHERE l.tenant_id=j.tenant_id AND l.local_resource_type=j.local_resource_type AND l.local_resource_id=j.local_resource_id) l ON true) state
        WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 100`, [request.auth.tenantId]);
    const summary = await db.query(
      `SELECT count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='processing')::int processing,
              count(*) FILTER(WHERE status='completed')::int completed,count(*) FILTER(WHERE status='failed')::int failed
         FROM fhir_sync_jobs WHERE tenant_id=$1`, [request.auth.tenantId]);
    return { summary: summary.rows[0], items: jobs.rows };
  }));

  app.post("/sync/retry", async (request) => {
    await withTenant(request.auth, async (db) => {
      await db.query("UPDATE fhir_sync_jobs SET status='pending',last_error=null,next_attempt_at=now() WHERE tenant_id=$1 AND status='failed'", [request.auth.tenantId]);
    });
    return processPendingFhirSync({ ...request.auth, requestId: `${request.id}:retry` }, 50);
  });

  app.post("/sync/all", async (request) => {
    await withTenant(request.auth, async (db) => {
      for (const [type,table] of [["patient","patients"],["appointment","appointments"],["encounter","encounters"],["document","clinical_document_records"]] as const) {
        const rows=await db.query<{id:string}>(`SELECT id FROM ${table} WHERE tenant_id=$1`,[request.auth.tenantId]);
        for(const row of rows.rows) await enqueueFhirSync(db,request.auth.tenantId,request.auth.userId,type,row.id);
      }
    });
    return processPendingFhirSync({ ...request.auth, requestId: `${request.id}:all` }, 200);
  });

  app.get("/patients/:id/summary", async (request,reply) => {
    const{id}=idParam.parse(request.params);
    const patientLink=await withTenant(request.auth,async db=>(await db.query<{fhir_resource_id:string}>("SELECT fhir_resource_id FROM fhir_resource_links WHERE tenant_id=$1 AND local_resource_type='patient' AND local_resource_id=$2 AND fhir_resource_type='Patient'",[request.auth.tenantId,id])).rows[0]);
    if(!patientLink)return reply.code(404).send({error:"patient_not_synced"});
    const medplum=await getMedplum();const patientRef=`Patient/${patientLink.fhir_resource_id}`;
    const [conditions,allergies,medications,exams,documents,encounters]=await Promise.all([
      medplum.searchResources("Condition",{patient:patientRef,"_sort":"-_lastUpdated","_count":"20"}),
      medplum.searchResources("AllergyIntolerance",{patient:patientRef,"_sort":"-_lastUpdated","_count":"20"}),
      medplum.searchResources("MedicationRequest",{patient:patientRef,"_sort":"-_lastUpdated","_count":"20"}),
      medplum.searchResources("ServiceRequest",{patient:patientRef,"_sort":"-_lastUpdated","_count":"20"}),
      medplum.searchResources("DocumentReference",{patient:patientRef,"_sort":"-_lastUpdated","_count":"20"}),
      medplum.searchResources("Encounter",{patient:patientRef,"_sort":"-date","_count":"20"}),
    ]);
    return{fhirPatientId:patientLink.fhir_resource_id,conditions,allergies,medications,exams,documents,encounters};
  });

  app.post("/patients/:id/resync", async (request) => {
    const { id } = idParam.parse(request.params);
    await withTenant(request.auth, (db) => enqueueFhirSync(db, request.auth.tenantId, request.auth.userId, "patient", id));
    return processPendingFhirSync({ ...request.auth, requestId: `${request.id}:patient` });
  });

  app.post("/appointments/:id/resync", async (request) => {
    const { id } = idParam.parse(request.params);
    await withTenant(request.auth, (db) => enqueueFhirSync(db, request.auth.tenantId, request.auth.userId, "appointment", id));
    return processPendingFhirSync({ ...request.auth, requestId: `${request.id}:appointment` });
  });

  app.post("/encounters/:id/resync", async (request) => {
    const { id } = idParam.parse(request.params);
    await withTenant(request.auth, (db) => enqueueFhirSync(db, request.auth.tenantId, request.auth.userId, "encounter", id));
    return processPendingFhirSync({ ...request.auth, requestId: `${request.id}:encounter` });
  });

  app.post("/patients/:id/sync", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    return withTenant(request.auth, async (db) => {
      const result = await db.query<{full_name:string;preferred_name:string|null;birth_date:string|null;sex_at_birth:string|null;phone:string|null;email:string|null}>("SELECT full_name,preferred_name,birth_date,sex_at_birth,phone,email FROM patients WHERE tenant_id=$1 AND id=$2",[request.auth.tenantId,id]);
      const row=result.rows[0]; if(!row)return reply.code(404).send({error:"patient_not_found"});
      const medplum=await getMedplum(); const identifier=`${request.auth.tenantId}|${id}`;
      const existing=await medplum.searchOne("Patient",{identifier:`${localIdentifier}|${identifier}`});
      const nameParts=row.full_name.trim().split(/\s+/); const family=nameParts.pop()??row.full_name;
      const resource:Patient={resourceType:"Patient",id:existing?.id,identifier:[{system:tenantIdentifier,value:request.auth.tenantId},{system:localIdentifier,value:identifier}],active:true,name:[{use:"official",family,given:nameParts,text:row.full_name},...(row.preferred_name?[{use:"usual" as const,text:row.preferred_name}]:[])],birthDate:row.birth_date??undefined,gender:row.sex_at_birth==="male"?"male":row.sex_at_birth==="female"?"female":"unknown",telecom:[...(row.phone?[{system:"phone" as const,value:row.phone}]:[]),...(row.email?[{system:"email" as const,value:row.email}]:[])]};
      const saved=existing?await medplum.updateResource(resource):await medplum.createResource(resource);
      return {localId:id,fhirId:saved.id,created:!existing};
    });
  });

  app.post("/appointments/:id/sync", async(request,reply)=>{const{id}=idParam.parse(request.params);return withTenant(request.auth,async db=>{const result=await db.query<{patient_id:string;patient_name:string;starts_at:string;ends_at:string;status:string;type:string}>("SELECT a.patient_id,p.full_name AS patient_name,a.starts_at,a.ends_at,a.status,a.type FROM appointments a JOIN patients p ON p.tenant_id=a.tenant_id AND p.id=a.patient_id WHERE a.tenant_id=$1 AND a.id=$2",[request.auth.tenantId,id]);const row=result.rows[0];if(!row)return reply.code(404).send({error:'appointment_not_found'});const medplum=await getMedplum();const patientIdentifier=`${request.auth.tenantId}|${row.patient_id}`;const patient=await medplum.searchOne('Patient',{identifier:`${localIdentifier}|${patientIdentifier}`});if(!patient)return reply.code(409).send({error:'patient_not_synced'});const identifier=`${request.auth.tenantId}|${id}`;const existing=await medplum.searchOne('Appointment',{identifier:`${localIdentifier}|${identifier}`});const status:Appointment['status']=row.status==='completed'?'fulfilled':row.status==='cancelled'?'cancelled':row.status==='no_show'?'noshow':row.status==='confirmed'?'booked':'pending';const resource:Appointment={resourceType:'Appointment',id:existing?.id,identifier:[{system:tenantIdentifier,value:request.auth.tenantId},{system:localIdentifier,value:identifier}],status,start:new Date(row.starts_at).toISOString(),end:new Date(row.ends_at).toISOString(),description:row.type,participant:[{actor:{reference:`Patient/${patient.id}`,display:row.patient_name},status:'accepted'}]};const saved=existing?await medplum.updateResource(resource):await medplum.createResource(resource);return{localId:id,fhirId:saved.id,created:!existing};});});

  app.post("/encounters/:id/sync",async(request,reply)=>{const{id}=idParam.parse(request.params);return withTenant(request.auth,async db=>{const result=await db.query<{patient_id:string;patient_name:string;status:string;started_at:string;completed_at:string|null;content:Record<string,string>;note_status:string}>("SELECT e.patient_id,p.full_name AS patient_name,e.status,e.started_at,e.completed_at,n.content,n.status AS note_status FROM encounters e JOIN patients p ON p.tenant_id=e.tenant_id AND p.id=e.patient_id JOIN clinical_notes n ON n.tenant_id=e.tenant_id AND n.encounter_id=e.id WHERE e.tenant_id=$1 AND e.id=$2 ORDER BY n.created_at DESC LIMIT 1",[request.auth.tenantId,id]);const row=result.rows[0];if(!row)return reply.code(404).send({error:'encounter_not_found'});const medplum=await getMedplum();const patient=await medplum.searchOne('Patient',{identifier:`${localIdentifier}|${request.auth.tenantId}|${row.patient_id}`});if(!patient)return reply.code(409).send({error:'patient_not_synced'});const identifier=`${request.auth.tenantId}|${id}`;const existing=await medplum.searchOne('Encounter',{identifier:`${localIdentifier}|${identifier}`});const encounter:Encounter={resourceType:'Encounter',id:existing?.id,identifier:[{system:tenantIdentifier,value:request.auth.tenantId},{system:localIdentifier,value:identifier}],status:row.status==='completed'?'finished':'in-progress',class:{system:'http://terminology.hl7.org/CodeSystem/v3-ActCode',code:'AMB',display:'Ambulatorial'},subject:{reference:`Patient/${patient.id}`,display:row.patient_name},period:{start:new Date(row.started_at).toISOString(),end:row.completed_at?new Date(row.completed_at).toISOString():undefined}};const saved=existing?await medplum.updateResource(encounter):await medplum.createResource(encounter);const composition:Composition={resourceType:'Composition',status:row.note_status==='finalized'?'final':'preliminary',type:{coding:[{system:'http://loinc.org',code:'11488-4',display:'Nota de consulta'}],text:'Evolução clínica'},subject:{reference:`Patient/${patient.id}`},encounter:{reference:`Encounter/${saved.id}`},date:new Date().toISOString(),author:[{display:'Prontuvia'}],title:'Atendimento clínico',section:Object.entries(row.content??{}).filter(([,value])=>Boolean(value)).map(([key,value])=>({title:key,text:{status:'generated',div:`<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>${String(value).replace(/[<>&]/g,(character)=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[character]!))}</p></div>`}}))};const existingComposition=await medplum.searchOne('Composition',{encounter:`Encounter/${saved.id}`});if(existingComposition)await medplum.updateResource({...composition,id:existingComposition.id});else await medplum.createResource(composition);return{localId:id,fhirId:saved.id,created:!existing};});});
}
