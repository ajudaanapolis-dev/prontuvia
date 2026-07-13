import { describe, expect, it } from "vitest";
import { fhirDate } from "./fhir-date.js";

describe("normalização de datas FHIR", () => {
  it("converte Date do PostgreSQL para date FHIR", () => {
    expect(fhirDate(new Date("1990-03-26T00:00:00.000Z"))).toBe("1990-03-26");
  });

  it("preserva data ISO sem horário", () => {
    expect(fhirDate("2026-07-12")).toBe("2026-07-12");
  });

  it("remove horário de timestamp ISO", () => {
    expect(fhirDate("2026-07-12T03:00:00.000Z")).toBe("2026-07-12");
  });

  it("não envia valores inválidos", () => {
    expect(fhirDate(null)).toBeUndefined();
    expect(fhirDate("data inválida")).toBeUndefined();
  });
});
