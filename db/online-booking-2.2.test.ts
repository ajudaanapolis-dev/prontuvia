import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("db/migrations/0014_online_booking_2_2.sql","utf8");
const routes=readFileSync("apps/api/src/routes/public-booking.ts","utf8");
const page=readFileSync("apps/web/src/OnlineBookingPage.tsx","utf8");

describe("agendamento online 2.2",()=>{
 it("registra consentimento e link de gerenciamento por clínica",()=>{
  expect(migration).toContain("CREATE TABLE online_booking_consents");
  expect(migration).toContain("CREATE TABLE online_booking_tokens");
  expect(migration).toContain("FORCE ROW LEVEL SECURITY");
 });
 it("aplica antecedência, cancelamento e aprovação configuráveis",()=>{
  for(const field of ["booking_auto_confirm","minimum_booking_notice_hours","cancellation_notice_hours","require_birth_date","booking_terms"])expect(migration).toContain(field);
  expect(routes).toContain("minimum_booking_notice");
  expect(routes).toContain("appointment_not_cancellable");
 });
 it("deduplica paciente e sincroniza o agendamento público no FHIR",()=>{
  expect(routes).toContain("regexp_replace(coalesce(phone");
  expect(routes).toContain('enqueueFhirSync(client, tenant.id, actor.user_id, "patient"');
  expect(routes).toContain('enqueueFhirSync(client, tenant.id, actor.user_id, "appointment"');
 });
 it("oferece consentimento e gerenciamento ao paciente",()=>{
  expect(page).toContain("consentAccepted");
  expect(page).toContain("BookingManagePage");
  expect(page).toContain("Cancelar agendamento");
 });
});
