export function fhirDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
  if (dateOnly) return dateOnly;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}
