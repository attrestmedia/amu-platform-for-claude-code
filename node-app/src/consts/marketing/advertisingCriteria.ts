export function normalizeAdvertisingCriteriaList(value: unknown, max = 30): string[] {
  const source = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      source
        .flatMap((item) => String(item ?? "").split(/\r?\n/))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, max);
}
