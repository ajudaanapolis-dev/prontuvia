import { describe, expect, it } from "vitest";
import { exactAge, formatExactAge } from "./age";

describe("idade exata", () => {
  const reference = new Date(2026, 6, 11);

  it("calcula anos, meses e dias", () => {
    expect(exactAge("1990-03-26", reference)).toEqual({ years: 36, months: 3, days: 15 });
    expect(formatExactAge("1990-03-26", reference)).toBe("36 anos, 3 meses e 15 dias");
  });

  it("mostra idade pediátrica sem arredondar", () => {
    expect(formatExactAge("2026-05-10", reference)).toBe("2 meses e 1 dia");
  });

  it("trata aniversário de 29 de fevereiro", () => {
    expect(formatExactAge("2024-02-29", new Date(2025, 1, 28))).toBe("1 ano");
  });
});
