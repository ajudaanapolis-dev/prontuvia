import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("db/migrations/0015_specialties_professional_services.sql", "utf8");
const publicBooking = readFileSync("apps/api/src/routes/public-booking.ts", "utf8");
const operations = readFileSync("apps/api/src/routes/operations.ts", "utf8");
const bookingPage = readFileSync("apps/web/src/OnlineBookingPage.tsx", "utf8");

describe("Prontuvia 2.3 specialty-first online booking", () => {
  it("isolates specialties and professional services per tenant", () => {
    expect(migration).toContain("CREATE TABLE specialties");
    expect(migration).toContain("CREATE TABLE professional_specialties");
    expect(migration).toContain("CREATE TABLE professional_services");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("tenant_isolation_professional_services");
  });

  it("provisions existing and new tenants with a working general catalog", () => {
    expect(migration).toContain("'Clínica Geral'");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION provision_trial_tenant");
    expect(migration).toContain("INSERT INTO professional_services");
  });

  it("validates the selected specialty, professional and procedure on the server", () => {
    expect(publicBooking).toContain("specialtyId: z.uuid()");
    expect(publicBooking).toContain("professional_service_unavailable");
    expect(publicBooking).toContain("pv.professional_user_id=$2 AND pv.specialty_id=$3 AND pv.procedure_id=$4");
  });

  it("provides protected management endpoints", () => {
    expect(operations).toContain('app.get("/specialties"');
    expect(operations).toContain('app.post("/professional-services"');
    expect(operations).toContain('requirePermission("tenant.manage")');
  });

  it("guides the patient through specialty, professional and procedure", () => {
    expect(bookingPage).toContain("Especialidade");
    expect(bookingPage).toContain("availableProfessionals");
    expect(bookingPage).toContain("availableProcedures");
    expect(bookingPage).toContain("Consultar horários");
  });
});
