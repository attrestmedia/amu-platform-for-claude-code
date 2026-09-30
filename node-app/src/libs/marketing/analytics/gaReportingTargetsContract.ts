import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import type { IUniverseGaReportingTarget } from "types/game/universe";

export type GaReportingTarget = IUniverseGaReportingTarget;

export const AMU_GA_REPORTING_TARGETS: GaReportingTarget[] = [
  {
    propertyId: "311756914",
    propertyKey: "magazine",
    role: "acquisition",
    label: "allmyuniverse.com",
    enabled: true,
    primary: true,
  },
  {
    propertyId: "488820875",
    propertyKey: "app",
    role: "conversion",
    label: "app.allmyuniverse.com",
    enabled: true,
    primary: false,
  },
];

function normalizePropertyId(value: unknown) {
  const propertyId = toSafeString(value).replace(/^properties\//, "");
  return /^\d+$/.test(propertyId) ? propertyId : "";
}

function normalizeKey(value: unknown, fallback: string) {
  const key = toSafeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return key || fallback;
}

export function normalizeGaReportingTargets(value: unknown): GaReportingTarget[] {
  const rows = Array.isArray(value) ? value : [];
  const seenPropertyIds = new Set<string>();
  const seenPropertyKeys = new Set<string>();
  const targets: GaReportingTarget[] = [];

  for (const raw of rows.slice(0, 20)) {
    const row = toUnknownRecord(raw);
    const propertyId = normalizePropertyId(row.propertyId);
    if (!propertyId || row.enabled === false || seenPropertyIds.has(propertyId)) continue;
    const baseKey = normalizeKey(row.propertyKey, `property_${propertyId}`);
    let propertyKey = baseKey;
    let suffix = 2;
    while (seenPropertyKeys.has(propertyKey)) {
      propertyKey = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    seenPropertyIds.add(propertyId);
    seenPropertyKeys.add(propertyKey);
    targets.push({
      propertyId,
      propertyKey,
      role: normalizeKey(row.role, "default"),
      label: toSafeString(row.label).slice(0, 160),
      enabled: true,
      primary: row.primary === true,
    });
    if (targets.length >= 10) break;
  }

  if (!targets.length) return [];
  const requestedPrimaryIndex = targets.findIndex((target) => target.primary);
  const primaryIndex = requestedPrimaryIndex >= 0 ? requestedPrimaryIndex : 0;
  return targets.map((target, index) => ({ ...target, primary: index === primaryIndex }));
}

export function resolveGaReportingTargets(args: {
  universeId: string;
  configuredTargets?: unknown;
  selectedResourceId?: string;
  selectedResourceName?: string;
}) {
  const configured = normalizeGaReportingTargets(args.configuredTargets);
  if (configured.length) return configured;
  if (toSafeString(args.universeId) === "amu") {
    return AMU_GA_REPORTING_TARGETS.map((target) => ({ ...target }));
  }
  const propertyId = normalizePropertyId(args.selectedResourceId);
  if (!propertyId) return [];
  return [
    {
      propertyId,
      propertyKey: "oauth",
      role: "default",
      label: toSafeString(args.selectedResourceName),
      enabled: true,
      primary: true,
    },
  ];
}
