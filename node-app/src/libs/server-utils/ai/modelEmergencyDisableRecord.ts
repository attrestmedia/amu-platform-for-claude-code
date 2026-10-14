import { createHash } from "node:crypto";
import { AI_MODEL_CATALOG, AI_MODEL_EXECUTION_ROUTES } from "consts/ai/generated/modelCatalog.generated";
import { parseModelModalityRef } from "consts/ai/modelPolicy";
import { resolveManifestModel } from "./jobPricingSnapshot";

export const MODEL_EMERGENCY_DISABLE_KEY_PREFIX = "ai.model-emergency-disable-" as const;

export type ModelEmergencyDisableTarget =
  | { kind: "modelProfile"; modelRef: string }
  | { kind: "executionRoute"; modelRef: string; route: string };

export type ModelEmergencyDisableRecordV1 = {
  schemaVersion: 1;
  target: ModelEmergencyDisableTarget;
  disabledUntil: string;
  reason: string;
  actor: string;
  issuedAt: string;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseReason: string | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  try {
    return new Date(timestamp).toISOString() === value;
  } catch {
    return false;
  }
}

function isValidModelRef(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  try {
    const parsed = parseModelModalityRef(value);
    return parsed.provider.trim() === parsed.provider
      && parsed.provider.length > 0
      && parsed.modelName.trim() === parsed.modelName
      && parsed.modelName.length > 0;
  } catch {
    return false;
  }
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeModelEmergencyDisableTarget(
  value: unknown,
): { ok: true; target: ModelEmergencyDisableTarget } | { ok: false; reason: string } {
  try {
    if (!isPlainObject(value) || typeof value.kind !== "string") return { ok: false, reason: "target_shape" };
    if (value.kind === "modelProfile") {
      if (!hasExactKeys(value, ["kind", "modelRef"]) || !isValidModelRef(value.modelRef)) {
        return { ok: false, reason: "target_model_profile" };
      }
      return { ok: true, target: { kind: "modelProfile", modelRef: value.modelRef } };
    }
    if (value.kind === "executionRoute") {
      if (!hasExactKeys(value, ["kind", "modelRef", "route"])
        || !isValidModelRef(value.modelRef)
        || !isNonEmptyString(value.route)) {
        return { ok: false, reason: "target_execution_route" };
      }
      return {
        ok: true,
        target: { kind: "executionRoute", modelRef: value.modelRef, route: value.route },
      };
    }
    return { ok: false, reason: "target_kind" };
  } catch {
    return { ok: false, reason: "target_invalid" };
  }
}

export function deriveModelEmergencyDisableKey(target: ModelEmergencyDisableTarget): string {
  const normalized = normalizeModelEmergencyDisableTarget(target);
  if (!normalized.ok) throw new TypeError("Invalid model emergency disable target");
  const canonicalTarget = Object.fromEntries(
    Object.entries(normalized.target).sort(([left], [right]) => compareStrings(left, right)),
  );
  const digest = createHash("sha256").update(JSON.stringify(canonicalTarget), "utf8").digest("hex");
  return `${MODEL_EMERGENCY_DISABLE_KEY_PREFIX}${digest}.v1`;
}

export function normalizeModelEmergencyDisableRecord(
  value: unknown,
  key: string,
): { ok: true; record: ModelEmergencyDisableRecordV1 } | { ok: false; reason: string } {
  try {
    const expectedKeys = [
      "schemaVersion",
      "target",
      "disabledUntil",
      "reason",
      "actor",
      "issuedAt",
      "releasedAt",
      "releasedBy",
      "releaseReason",
    ];
    if (!isPlainObject(value) || !hasExactKeys(value, expectedKeys)) {
      return { ok: false, reason: "record_shape" };
    }
    if (value.schemaVersion !== 1) return { ok: false, reason: "schema_version" };
    const targetResult = normalizeModelEmergencyDisableTarget(value.target);
    if (!targetResult.ok) return { ok: false, reason: "record_target" };
    if (!isCanonicalIsoDate(value.disabledUntil) || !isCanonicalIsoDate(value.issuedAt)) {
      return { ok: false, reason: "record_timestamp" };
    }
    if (!isNonEmptyString(value.reason) || !isNonEmptyString(value.actor)) {
      return { ok: false, reason: "record_identity" };
    }

    const releasedValues = [value.releasedAt, value.releasedBy, value.releaseReason];
    const allReleasedNull = releasedValues.every((entry) => entry === null);
    const allReleasedPresent = isCanonicalIsoDate(value.releasedAt)
      && isNonEmptyString(value.releasedBy)
      && isNonEmptyString(value.releaseReason);
    if (!allReleasedNull && !allReleasedPresent) return { ok: false, reason: "record_release_state" };

    const record: ModelEmergencyDisableRecordV1 = {
      schemaVersion: 1,
      target: targetResult.target,
      disabledUntil: value.disabledUntil,
      reason: value.reason,
      actor: value.actor,
      issuedAt: value.issuedAt,
      releasedAt: value.releasedAt as string | null,
      releasedBy: value.releasedBy as string | null,
      releaseReason: value.releaseReason as string | null,
    };
    if (typeof key !== "string" || key !== deriveModelEmergencyDisableKey(record.target)) {
      return { ok: false, reason: "record_key_mismatch" };
    }
    return { ok: true, record };
  } catch {
    return { ok: false, reason: "record_invalid" };
  }
}

export function isModelEmergencyDisableActive(record: ModelEmergencyDisableRecordV1, now: Date): boolean {
  return record.releasedAt === null && now.getTime() < Date.parse(record.disabledUntil);
}

export function resolveManifestModelRef(args: {
  provider: string;
  modelName: string;
  modality: string;
}): string | null {
  const model = resolveManifestModel(args.provider, args.modelName);
  if (!model || !model.modalities.some((profile) => profile.modality === args.modality)) return null;
  return `${model.id}/${args.modality}`;
}

export function isManifestEmergencyDisableTarget(target: ModelEmergencyDisableTarget): boolean {
  const normalized = normalizeModelEmergencyDisableTarget(target);
  if (!normalized.ok) return false;
  const normalizedTarget = normalized.target;
  let parsed: ReturnType<typeof parseModelModalityRef>;
  try {
    parsed = parseModelModalityRef(normalizedTarget.modelRef);
  } catch {
    return false;
  }
  const resolvedRef = resolveManifestModelRef(parsed);
  if (resolvedRef !== normalizedTarget.modelRef) return false;
  if (normalizedTarget.kind === "modelProfile") return true;
  const routes = AI_MODEL_EXECUTION_ROUTES[normalizedTarget.modelRef as keyof typeof AI_MODEL_EXECUTION_ROUTES];
  return Array.isArray(routes) && routes.some((item) => item.route === normalizedTarget.route);
}

export function listManifestEmergencyDisableTargets(): {
  modelProfiles: string[];
  executionRoutes: { modelRef: string; route: string }[];
} {
  const modelProfiles = AI_MODEL_CATALOG.models
    .filter((model) => model.entryKind === "model")
    .flatMap((model) => model.modalities.map((profile) => `${model.id}/${profile.modality}`))
    .sort(compareStrings);
  const executionRoutes = Object.entries(AI_MODEL_EXECUTION_ROUTES)
    .flatMap(([modelRef, routes]) => routes.map((item) => ({ modelRef, route: item.route })))
    .sort((left, right) => compareStrings(left.modelRef, right.modelRef) || compareStrings(left.route, right.route));
  return { modelProfiles, executionRoutes };
}
