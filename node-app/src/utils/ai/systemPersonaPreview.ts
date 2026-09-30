function normalizePreviewText(value: string | null | undefined, limit: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function getSystemPersonaPreviewText(
  input: { summary?: string | null; prompt?: string | null },
  limit = 160,
) {
  const explicitSummary = normalizePreviewText(input.summary, limit);
  if (explicitSummary) return explicitSummary;

  const promptLines = String(input.prompt || "")
    .split(/\r?\n/)
    .map((line) => normalizePreviewText(line, limit))
    .filter(Boolean);

  return promptLines[0] || "";
}
