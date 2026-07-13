export type ExactAge = { years: number; months: number; days: number };

function utcDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

export function exactAge(birthDate: string | null, reference = new Date()): ExactAge | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [year, month, day] = birthDate.split("-").map(Number) as [number, number, number];
  const birth = utcDate(year, month - 1, day);
  const today = new Date(Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate()));
  if (birth > today || birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1) return null;

  let years = today.getUTCFullYear() - year;
  let anniversary = utcDate(year + years, month - 1, day);
  if (anniversary > today) {
    years--;
    anniversary = utcDate(year + years, month - 1, day);
  }

  let months = 0;
  let cursor = anniversary;
  while (months < 11) {
    const absoluteMonth = month - 1 + months + 1;
    const next = utcDate(year + years + Math.floor(absoluteMonth / 12), ((absoluteMonth % 12) + 12) % 12, day);
    if (next > today) break;
    cursor = next;
    months++;
  }
  const days = Math.floor((today.getTime() - cursor.getTime()) / 86_400_000);
  return { years, months, days };
}

export function formatExactAge(birthDate: string | null, reference = new Date(), fallback = "Idade não informada"): string {
  const age = exactAge(birthDate, reference);
  if (!age) return fallback;
  const parts: string[] = [];
  if (age.years) parts.push(`${age.years} ${age.years === 1 ? "ano" : "anos"}`);
  if (age.months) parts.push(`${age.months} ${age.months === 1 ? "mês" : "meses"}`);
  if (age.days || !parts.length) parts.push(`${age.days} ${age.days === 1 ? "dia" : "dias"}`);
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}
