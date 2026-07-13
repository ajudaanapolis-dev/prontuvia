import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("db/migrations/0016_booking_journey_2_4.sql","utf8");
const api=readFileSync("apps/api/src/routes/public-booking.ts","utf8");
const appointments=readFileSync("apps/api/src/routes/appointments.ts","utf8");
const web=readFileSync("apps/web/src/OnlineBookingPage.tsx","utf8");

describe("Prontuvia 2.4 booking journey",()=>{
  it("offers any eligible professional without weakening server validation",()=>{
    expect(api).toContain("professionalUserId: z.uuid().optional()");
    expect(api).toContain("calculatePublicSlots");
    expect(api).toContain("pv.public_booking_enabled AND ps.public_booking_enabled");
    expect(web).toContain("Qualquer profissional disponível");
  });

  it("discovers the next available days",()=>{
    expect(api).toContain('app.get("/:slug/availability"');
    expect(web).toContain("Ver próximos dias disponíveis");
  });

  it("lets the patient safely reschedule through the management token",()=>{
    expect(api).toContain('app.patch("/:slug/manage/:token/reschedule"');
    expect(api).toContain("appointment_not_reschedulable");
    expect(api).toContain("minimum_booking_notice");
    expect(api).toContain("validSchedule");
    expect(web).toContain("Consulta reagendada e novos lembretes programados");
  });

  it("keeps an immutable tenant-isolated appointment timeline",()=>{
    expect(migration).toContain("CREATE TABLE appointment_events");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("tenant_isolation_appointment_events");
    expect(appointments).toContain('app.get("/:id/events"');
  });

  it("records patient and staff lifecycle events",()=>{
    for(const event of ["created","confirmed","check_in","started","completed","no_show","cancelled","rescheduled"])expect(migration).toContain(`'${event}'`);
    expect(api).toContain("'rescheduled','patient'");
    expect(appointments).toContain("eventType");
  });
});
