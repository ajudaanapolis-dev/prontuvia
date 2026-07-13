import { describe, expect, it } from "vitest";
import { clinicalDescriptions } from "./clinicalData";

describe("clinicalDescriptions", () => {
  it("normalizes legacy objects without requiring them to be iterable", () => {
    expect(clinicalDescriptions(
      { description: "Dipirona" },
      { warning: { label: "Risco de queda" } },
    )).toEqual(["Dipirona", "Risco de queda"]);
  });

  it("accepts arrays, strings and empty legacy values", () => {
    expect(clinicalDescriptions(
      [{ description: "Penicilina" }, "Látex"],
      null,
      {},
    )).toEqual(["Penicilina", "Látex"]);
  });
});
