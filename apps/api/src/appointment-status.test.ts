import { describe, expect, it } from "vitest";
import { canTransitionAppointment } from "./appointment-status.js";

describe("appointment status transitions", () => {
  it("allows the normal reception flow", () => {
    expect(canTransitionAppointment("scheduled", "confirmed")).toBe(true);
    expect(canTransitionAppointment("confirmed", "waiting")).toBe(true);
    expect(canTransitionAppointment("waiting", "in_progress")).toBe(true);
    expect(canTransitionAppointment("in_progress", "completed")).toBe(true);
  });

  it("does not reopen terminal appointments", () => {
    expect(canTransitionAppointment("completed", "scheduled")).toBe(false);
    expect(canTransitionAppointment("cancelled", "waiting")).toBe(false);
    expect(canTransitionAppointment("no_show", "confirmed")).toBe(false);
  });
});
