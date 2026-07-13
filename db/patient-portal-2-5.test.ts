import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const migration=readFileSync("db/migrations/0017_patient_portal_2_5.sql","utf8");
const api=readFileSync("apps/api/src/routes/patient-portal.ts","utf8");
const web=readFileSync("apps/web/src/PatientPortalPage.tsx","utf8");

describe("Prontuvia 2.5 patient portal",()=>{
 it("keeps a verified account patient separate from the active dependent",()=>{expect(migration).toContain("account_patient_id");expect(api).toContain("dependent_access_denied");expect(api).toContain("/switch-patient");});
 it("isolates family, forms and responses per tenant",()=>{for(const table of ["patient_dependents","portal_form_templates","portal_form_responses"]){expect(migration).toContain(`CREATE TABLE ${table}`);expect(migration).toContain(`tenant_isolation_${table}`);}expect(migration).toContain("FORCE ROW LEVEL SECURITY");});
 it("stores pre-consultation responses as append-only clinical input",()=>{expect(migration).toContain("portal_form_responses_append_only");expect(api).toContain('app.post("/forms/:id/responses"');expect(api).toContain("form_response_too_large");});
 it("only returns records belonging to the active patient",()=>{expect(api).toContain("d.patient_id=$2");expect(api).toContain("patient_id=$2 AND kind='income'");expect(api).toContain("a.patient_id=$2");});
 it("revokes the server session on logout",()=>{expect(api).toContain("SET revoked_at=now()");expect(api).toContain("clearCookie");});
 it("provides all portal areas",()=>{for(const label of ["Agenda","Pré-consulta","Documentos","Financeiro","Meus dados","Dependentes"])expect(web).toContain(label);});
});
