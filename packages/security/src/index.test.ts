import { describe, expect, it } from "vitest";
import { hasPermission } from "./index.js";

describe("RBAC matrix", () => {
  it("keeps clinical data away from finance-only users", () => {
    expect(hasPermission("finance", "records.read")).toBe(false);
    expect(hasPermission("finance", "finance.write")).toBe(true);
  });

  it("allows reception to schedule but not finalize records", () => {
    expect(hasPermission("receptionist", "appointments.write")).toBe(true);
    expect(hasPermission("receptionist", "records.finalize")).toBe(false);
  });

  it("allows clinicians to add an addendum", () => {
    expect(hasPermission("clinician", "records.addendum")).toBe(true);
  });
});
