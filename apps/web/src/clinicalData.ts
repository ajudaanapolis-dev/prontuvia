function descriptionsFrom(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(descriptionsFrom);
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  for (const key of ["description", "name", "label", "value"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return [candidate.trim()];
  }
  return Object.values(record).flatMap(descriptionsFrom);
}

export function clinicalDescriptions(...values: unknown[]): string[] {
  return [...new Set(values.flatMap(descriptionsFrom))];
}
