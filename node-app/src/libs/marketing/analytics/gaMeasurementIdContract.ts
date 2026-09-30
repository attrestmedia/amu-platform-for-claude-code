export const DEFAULT_GA_APP_MEASUREMENT_ID = "G-R59CLP4F6R";

export function normalizeGaMeasurementId(value: unknown) {
  const measurementId = String(value ?? "").trim().toUpperCase();
  return /^G-[A-Z0-9_-]+$/.test(measurementId) ? measurementId : "";
}

function parseProperties(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pickLegacyGaMeasurementId(extras: Record<string, unknown> = {}) {
  const properties = parseProperties(extras.properties)
    .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  for (const role of ["app", "default"]) {
    const match = properties.find((entry) => String(entry.role || "").trim().toLowerCase() === role);
    const measurementId = normalizeGaMeasurementId(match?.measurementId);
    if (measurementId) return measurementId;
  }

  return normalizeGaMeasurementId(extras.measurementId);
}

export function stripGaMeasurementIds(extras: Record<string, unknown> = {}) {
  const next = { ...extras };
  delete next.measurementId;

  const properties = parseProperties(extras.properties);
  if (Array.isArray(extras.properties) || properties.length > 0) {
    next.properties = properties.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const property = { ...(entry as Record<string, unknown>) };
      delete property.measurementId;
      return property;
    });
  }

  return next;
}
