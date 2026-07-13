import type { Resource } from "@medplum/fhirtypes";
import type { DbClient, TenantContext } from "./db.js";
import { withTenant } from "./db.js";
import { getMedplum, medplumConfigured } from "./medplum.js";
import { fhirDate } from "./fhir-date.js";

const tenantSystem = "https://prontuvia.com.br/fhir/tenant";
const localSystem = "https://prontuvia.com.br/fhir/local-id";
const codeSystem = "https://prontuvia.com.br/fhir/clinical-field";

type LocalType = "patient" | "appointment" | "encounter" | "document";

function localIdentifier(tenantId: string, localId: string): string {
  return `${tenantId}|${localId}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function listValues(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\n|;/).map((item) => item.trim()).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [item.trim()] : [];
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const candidate = record.description ?? record.name ?? record.value;
      return typeof candidate === "string" && candidate.trim() ? [candidate.trim()] : [];
    }
    return [];
  });
}

async function saveResource(
  db: DbClient,
  tenantId: string,
  localType: LocalType,
  localId: string,
  resource: Resource,
  logicalKey = "primary",
): Promise<Resource> {
  const medplum = await getMedplum();
  const link = await db.query<{ fhir_resource_id: string }>(
    `SELECT fhir_resource_id FROM fhir_resource_links
      WHERE tenant_id=$1 AND local_resource_type=$2 AND local_resource_id=$3 AND fhir_resource_type=$4 AND logical_key=$5`,
    [tenantId, localType, localId, resource.resourceType, logicalKey],
  );
  let existingId = link.rows[0]?.fhir_resource_id;
  const supportsIdentifierSearch = resource.resourceType !== "Provenance";
  if (!existingId && supportsIdentifierSearch) {
    const existing = await medplum.searchOne(resource.resourceType, {
      identifier: `${localSystem}|${localIdentifier(tenantId, localId)}`,
    });
    existingId = existing?.id;
  }
  if (!existingId && resource.resourceType === "Provenance") {
    const target = resource.target?.[0]?.reference;
    if (target) existingId = (await medplum.searchOne("Provenance", { target }))?.id;
  }
  const saved = existingId
    ? await medplum.updateResource({ ...resource, id: existingId })
    : await medplum.createResource(resource);
  if (!saved.id) throw new Error(`fhir_${resource.resourceType}_missing_id`);
  await db.query(
    `INSERT INTO fhir_resource_links
      (tenant_id,local_resource_type,local_resource_id,fhir_resource_type,logical_key,fhir_resource_id,version_id)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(tenant_id,local_resource_type,local_resource_id,fhir_resource_type,logical_key)
     DO UPDATE SET fhir_resource_id=excluded.fhir_resource_id,version_id=excluded.version_id,last_synced_at=now()`,
    [tenantId, localType, localId, saved.resourceType, logicalKey, saved.id, saved.meta?.versionId ?? null],
  );
  return saved;
}

async function patientReference(db: DbClient, tenantId: string, patientId: string): Promise<string> {
  const link = await db.query<{ fhir_resource_id: string }>(
    `SELECT fhir_resource_id FROM fhir_resource_links
      WHERE tenant_id=$1 AND local_resource_type='patient' AND local_resource_id=$2 AND fhir_resource_type='Patient'`,
    [tenantId, patientId],
  );
  if (link.rows[0]) return `Patient/${link.rows[0].fhir_resource_id}`;
  const patient = await syncPatient(db, tenantId, patientId);
  return `Patient/${patient.id}`;
}

async function syncPatient(db: DbClient, tenantId: string, patientId: string): Promise<Resource> {
  const result = await db.query<{
    full_name:string; preferred_name:string|null; birth_date:string|null; sex_at_birth:string|null;
    gender_identity:string|null; phone:string|null; email:string|null; address:Record<string,unknown>|null;
    allergies:unknown;
  }>(`SELECT full_name,preferred_name,birth_date,sex_at_birth,gender_identity,phone,email,address,allergies
        FROM patients WHERE tenant_id=$1 AND id=$2`, [tenantId, patientId]);
  const row = result.rows[0];
  if (!row) throw new Error("patient_not_found");
  const parts = row.full_name.trim().split(/\s+/); const family = parts.pop() ?? row.full_name;
  const patient = await saveResource(db, tenantId, "patient", patientId, {
    resourceType: "Patient",
    identifier: [{ system: tenantSystem, value: tenantId }, { system: localSystem, value: localIdentifier(tenantId, patientId) }],
    active: true,
    name: [{ use: "official", family, given: parts, text: row.full_name }, ...(row.preferred_name ? [{ use: "usual" as const, text: row.preferred_name }] : [])],
    birthDate: fhirDate(row.birth_date),
    gender: row.sex_at_birth === "male" ? "male" : row.sex_at_birth === "female" ? "female" : "unknown",
    telecom: [...(row.phone ? [{ system: "phone" as const, value: row.phone }] : []), ...(row.email ? [{ system: "email" as const, value: row.email }] : [])],
    extension: row.gender_identity ? [{ url: "http://hl7.org/fhir/StructureDefinition/individual-genderIdentity", valueCodeableConcept: { text: row.gender_identity } }] : undefined,
  });
  for (const [index, allergy] of listValues(row.allergies).entries()) {
    await saveResource(db, tenantId, "patient", patientId, {
      resourceType: "AllergyIntolerance",
      identifier: [{ system: localSystem, value: `${localIdentifier(tenantId, patientId)}|allergy|${index}` }],
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }] },
      verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "unconfirmed" }] },
      patient: { reference: `Patient/${patient.id}` }, code: { text: allergy }, recordedDate: new Date().toISOString(),
    }, `allergy-${index}`);
  }
  return patient;
}

async function syncAppointment(db: DbClient, tenantId: string, appointmentId: string): Promise<Resource> {
  const result = await db.query<{patient_id:string;patient_name:string;professional_name:string;starts_at:string;ends_at:string;status:string;type:string;notes:string|null}>(
    `SELECT a.patient_id,p.full_name patient_name,u.name professional_name,a.starts_at,a.ends_at,a.status,a.type,a.notes
       FROM appointments a JOIN patients p ON p.tenant_id=a.tenant_id AND p.id=a.patient_id
       JOIN users u ON u.id=a.professional_user_id WHERE a.tenant_id=$1 AND a.id=$2`, [tenantId, appointmentId]);
  const row = result.rows[0]; if (!row) throw new Error("appointment_not_found");
  const patient = await patientReference(db, tenantId, row.patient_id);
  const status = row.status === "completed" ? "fulfilled" : row.status === "cancelled" ? "cancelled" : row.status === "no_show" ? "noshow" : row.status === "confirmed" ? "booked" : "pending";
  return saveResource(db, tenantId, "appointment", appointmentId, {
    resourceType: "Appointment", identifier: [{ system: tenantSystem, value: tenantId }, { system: localSystem, value: localIdentifier(tenantId, appointmentId) }],
    status, start: new Date(row.starts_at).toISOString(), end: new Date(row.ends_at).toISOString(),
    description: row.type, comment: row.notes ?? undefined,
    participant: [{ actor: { reference: patient, display: row.patient_name }, status: "accepted" }, { actor: { display: row.professional_name }, status: "accepted" }],
  } as Resource);
}

async function syncEncounter(db: DbClient, tenantId: string, encounterId: string): Promise<Resource> {
  const result = await db.query<{patient_id:string;patient_name:string;professional_name:string;appointment_id:string|null;status:string;started_at:string;completed_at:string|null;note_id:string;note_status:string;content:Record<string,unknown>;finalized_at:string|null}>(
    `SELECT e.patient_id,p.full_name patient_name,u.name professional_name,e.appointment_id,e.status,e.started_at,e.completed_at,
            n.id note_id,n.status note_status,n.content,n.finalized_at
       FROM encounters e JOIN patients p ON p.tenant_id=e.tenant_id AND p.id=e.patient_id
       JOIN users u ON u.id=e.professional_user_id JOIN clinical_notes n ON n.tenant_id=e.tenant_id AND n.encounter_id=e.id
      WHERE e.tenant_id=$1 AND e.id=$2`, [tenantId, encounterId]);
  const row = result.rows[0]; if (!row) throw new Error("encounter_not_found");
  const patient = await patientReference(db, tenantId, row.patient_id);
  const encounter = await saveResource(db, tenantId, "encounter", encounterId, {
    resourceType: "Encounter", identifier: [{ system: tenantSystem, value: tenantId }, { system: localSystem, value: localIdentifier(tenantId, encounterId) }],
    status: row.status === "completed" ? "finished" : row.status === "cancelled" ? "cancelled" : "in-progress",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "Ambulatorial" },
    subject: { reference: patient, display: row.patient_name }, participant: [{ individual: { display: row.professional_name } }],
    period: { start: new Date(row.started_at).toISOString(), end: row.completed_at ? new Date(row.completed_at).toISOString() : undefined },
    appointment: row.appointment_id ? [{ identifier: { system: localSystem, value: localIdentifier(tenantId, row.appointment_id) } }] : undefined,
  } as Resource);
  const content = row.content ?? {};
  const diagnosis = textValue(content.diagnosisDescription) ?? textValue(content.assessment);
  if (diagnosis) {
    const code = textValue(content.diagnosisCid11) ?? textValue(content.diagnosisCid);
    await saveResource(db, tenantId, "encounter", encounterId, {
      resourceType: "Condition", identifier: [{ system: localSystem, value: `${localIdentifier(tenantId, encounterId)}|diagnosis` }],
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "provisional" }] },
      code: { coding: code ? [{ system: textValue(content.diagnosisCid11) ? "http://id.who.int/icd/release/11/mms" : "http://hl7.org/fhir/sid/icd-10", code, display: diagnosis }] : undefined, text: diagnosis },
      subject: { reference: patient }, encounter: { reference: `Encounter/${encounter.id}` }, recordedDate: row.finalized_at ?? new Date().toISOString(),
    } as Resource);
  }
  for (const [index, medication] of listValues(content.prescriptions).entries()) {
    await saveResource(db, tenantId, "encounter", encounterId, {
      resourceType: "MedicationRequest", identifier: [{ system: localSystem, value: `${localIdentifier(tenantId, encounterId)}|medication|${index}` }],
      status: row.note_status === "finalized" ? "active" : "draft", intent: "order", medicationCodeableConcept: { text: medication },
      subject: { reference: patient }, encounter: { reference: `Encounter/${encounter.id}` }, authoredOn: row.finalized_at ?? new Date().toISOString(), requester: { display: row.professional_name },
    } as Resource, `medication-${index}`);
  }
  for (const [index, exam] of listValues(content.examRequests).entries()) {
    await saveResource(db, tenantId, "encounter", encounterId, {
      resourceType: "ServiceRequest", identifier: [{ system: localSystem, value: `${localIdentifier(tenantId, encounterId)}|exam|${index}` }],
      status: row.note_status === "finalized" ? "active" : "draft", intent: "order", code: { text: exam }, subject: { reference: patient },
      encounter: { reference: `Encounter/${encounter.id}` }, authoredOn: row.finalized_at ?? new Date().toISOString(), requester: { display: row.professional_name },
    } as Resource, `exam-${index}`);
  }
  const sections = Object.entries(content).filter(([, value]) => textValue(value)).map(([key, value]) => ({
    title: key, code: { coding: [{ system: codeSystem, code: key }] },
    text: { status: "generated" as const, div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>${escapeHtml(value)}</p></div>` },
  }));
  const composition = await saveResource(db, tenantId, "encounter", encounterId, {
    resourceType: "Composition", identifier: { system: localSystem, value: `${localIdentifier(tenantId, encounterId)}|composition` },
    status: row.note_status === "finalized" ? "final" : "preliminary", type: { coding: [{ system: "http://loinc.org", code: "11488-4", display: "Nota de consulta" }] },
    subject: { reference: patient }, encounter: { reference: `Encounter/${encounter.id}` }, date: row.finalized_at ?? new Date().toISOString(),
    author: [{ display: row.professional_name }], title: "Atendimento clínico Prontuvia", section: sections,
  } as Resource);
  if (row.note_status === "finalized") {
    await saveResource(db, tenantId, "encounter", encounterId, {
      resourceType: "Provenance", recorded: row.finalized_at ?? new Date().toISOString(),
      target: [{ reference: `Encounter/${encounter.id}` }, { reference: `Composition/${composition.id}` }],
      agent: [{ type: { text: "Autor" }, who: { display: row.professional_name } }],
      signature: [{ type: [{ system: "urn:iso-astm:E1762-95:2013", code: "1.2.840.10065.1.12.1.1", display: "Assinatura do autor" }], when: row.finalized_at ?? new Date().toISOString(), who: { display: row.professional_name }, data: "UHJvbnR1dmlh" }],
    } as Resource);
  }
  return encounter;
}

async function syncDocument(db: DbClient, tenantId: string, documentId: string): Promise<Resource> {
  const result = await db.query<{patient_id:string;encounter_id:string|null;category:string;title:string;content:{body?:string;cid?:string;notes?:string};content_hash:string;finalized_at:string;author_name:string}>(
    `SELECT d.patient_id,d.encounter_id,d.category,d.title,d.content,d.content_hash,d.finalized_at,u.name author_name
       FROM clinical_document_records d JOIN users u ON u.id=d.author_user_id
      WHERE d.tenant_id=$1 AND d.id=$2`, [tenantId, documentId]);
  const row = result.rows[0]; if (!row) throw new Error("clinical_document_not_found");
  const patient = await patientReference(db, tenantId, row.patient_id);
  let encounterReference: string | undefined;
  if (row.encounter_id) {
    const encounter = await syncEncounter(db, tenantId, row.encounter_id);
    encounterReference = `Encounter/${encounter.id}`;
  }
  const body = row.content?.body ?? row.title;
  const document = await saveResource(db, tenantId, "document", documentId, {
    resourceType: "DocumentReference",
    identifier: [{ system: localSystem, value: localIdentifier(tenantId, documentId) }, { system: "urn:ietf:rfc:3986", value: `urn:sha256:${row.content_hash}` }],
    status: "current", type: { text: row.category }, category: [{ text: "Documento clínico" }],
    subject: { reference: patient }, date: new Date(row.finalized_at).toISOString(), author: [{ display: row.author_name }],
    description: row.title,
    content: [{ attachment: { contentType: "text/plain; charset=utf-8", data: Buffer.from(body, "utf8").toString("base64"), title: row.title, creation: new Date(row.finalized_at).toISOString() } }],
    context: encounterReference ? { encounter: [{ reference: encounterReference }] } : undefined,
  } as Resource);
  if (row.category === "prescription") {
    await saveResource(db, tenantId, "document", documentId, {
      resourceType: "MedicationRequest", identifier: [{ system: localSystem, value: `${localIdentifier(tenantId, documentId)}|medication` }],
      status: "active", intent: "order", medicationCodeableConcept: { text: body }, subject: { reference: patient },
      encounter: encounterReference ? { reference: encounterReference } : undefined, authoredOn: new Date(row.finalized_at).toISOString(), requester: { display: row.author_name },
      note: row.content?.notes ? [{ text: row.content.notes }] : undefined,
    } as Resource);
  }
  if (row.category === "exam_request") {
    await saveResource(db, tenantId, "document", documentId, {
      resourceType: "ServiceRequest", identifier: [{ system: localSystem, value: `${localIdentifier(tenantId, documentId)}|exam` }],
      status: "active", intent: "order", code: { text: body }, subject: { reference: patient },
      encounter: encounterReference ? { reference: encounterReference } : undefined, authoredOn: new Date(row.finalized_at).toISOString(), requester: { display: row.author_name },
      reasonCode: row.content?.cid ? [{ text: row.content.cid }] : undefined, note: row.content?.notes ? [{ text: row.content.notes }] : undefined,
    } as Resource);
  }
  return document;
}

export async function enqueueFhirSync(db: DbClient, tenantId: string, userId: string, localType: LocalType, localId: string): Promise<void> {
  if (!medplumConfigured()) return;
  await db.query("SAVEPOINT enqueue_fhir_sync");
  try {
    await db.query(
      `INSERT INTO fhir_sync_jobs(tenant_id,local_resource_type,local_resource_id,requested_by)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(tenant_id,local_resource_type,local_resource_id)
       DO UPDATE SET status='pending',last_error=null,next_attempt_at=now(),requested_by=excluded.requested_by`,
      [tenantId, localType, localId, userId],
    );
    await db.query("RELEASE SAVEPOINT enqueue_fhir_sync");
  } catch {
    await db.query("ROLLBACK TO SAVEPOINT enqueue_fhir_sync");
    await db.query("RELEASE SAVEPOINT enqueue_fhir_sync");
  }
}

export async function processPendingFhirSync(context: TenantContext, limit = 10): Promise<{ completed:number; failed:number }> {
  if (!medplumConfigured()) return { completed: 0, failed: 0 };
  return withTenant(context, async (db) => {
    const jobs = await db.query<{id:string;local_resource_type:LocalType;local_resource_id:string;attempts:number}>(
      `SELECT id,local_resource_type,local_resource_id,attempts FROM fhir_sync_jobs
        WHERE tenant_id=$1 AND status IN('pending','failed') AND next_attempt_at<=now()
        ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [context.tenantId, limit]);
    let completed = 0; let failed = 0;
    for (const job of jobs.rows) {
      await db.query("UPDATE fhir_sync_jobs SET status='processing',attempts=attempts+1 WHERE tenant_id=$1 AND id=$2", [context.tenantId, job.id]);
      try {
        if (job.local_resource_type === "patient") await syncPatient(db, context.tenantId, job.local_resource_id);
        else if (job.local_resource_type === "appointment") await syncAppointment(db, context.tenantId, job.local_resource_id);
        else if (job.local_resource_type === "encounter") await syncEncounter(db, context.tenantId, job.local_resource_id);
        else if (job.local_resource_type === "document") await syncDocument(db, context.tenantId, job.local_resource_id);
        await db.query("UPDATE fhir_sync_jobs SET status='completed',last_error=null WHERE tenant_id=$1 AND id=$2", [context.tenantId, job.id]);
        completed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "fhir_sync_failed";
        const delay = Math.min(3600, 2 ** Math.min(job.attempts + 1, 10));
        await db.query("UPDATE fhir_sync_jobs SET status='failed',last_error=$3,next_attempt_at=now()+($4||' seconds')::interval WHERE tenant_id=$1 AND id=$2", [context.tenantId, job.id, message.slice(0, 1000), delay]);
        failed++;
      }
    }
    return { completed, failed };
  });
}
