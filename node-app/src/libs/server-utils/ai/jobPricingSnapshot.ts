import { AI_MODEL_CATALOG, AI_MODEL_CATALOG_REVISIONS } from "consts/ai/generated/modelCatalog.generated";
import { parseModelModalityRef } from "consts/ai/modelPolicy";
import { calcCoinsWithPricingMaps, type FixedPricingMapType } from "utils/payment/coinUtils";
import type { IFixedUsage } from "types/payment/coin";

export const JOB_PRICING_CALCULATOR_VERSION = "coin-pricing-v1" as const;

type CatalogModel = (typeof AI_MODEL_CATALOG.models)[number];
type CatalogProfile = CatalogModel["modalities"][number];
export type JobSellPrice = NonNullable<CatalogProfile["pricing"]["sell"]>;

export type JobPricingSnapshotV1 = {
  schemaVersion: 1;
  pricingRevision: string;
  calculatorVersion: typeof JOB_PRICING_CALCULATOR_VERSION;
  modelRef: string;
  modality: "audio" | "video";
  billingKey: string;
  variant: string | null;
  sell: JobSellPrice;
};

export type ReservedUsageV1 =
  | { unit: "characters"; quantity: number }
  | { unit: "seconds"; quantity: number }
  | { unit: "videos"; quantity: number };

type LegacyFixedRate = NonNullable<FixedPricingMapType[string]>;

const FIXED_UNIT_FIELDS = {
  second: "perSecond",
  minute: "perMinute",
  image: "perImage",
  video: "perVideo",
  thousand_characters: "perThousandCharacters",
  credit: "perCredit",
} as const satisfies Record<string, keyof LegacyFixedRate>;

const RESERVED_USAGE_FIELDS = {
  characters: "perThousandCharacters",
  seconds: "perSecond",
  videos: "perVideo",
} as const satisfies Record<ReservedUsageV1["unit"], keyof LegacyFixedRate>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isTokenRate(value: unknown) {
  return value === null || (isRecord(value)
    && (value.input === null || isFiniteNonNegative(value.input))
    && (value.output === null || isFiniteNonNegative(value.output)));
}

function isTokenRatesByModality(value: unknown) {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([modality, rate]) =>
    ["text", "audio", "image", "video"].includes(modality) && (rate === null || isTokenRate(rate)));
}

function isFixedRates(value: unknown) {
  if (!Array.isArray(value)) return false;
  const units = new Set<string>();
  return value.every((entry) => {
    if (!isRecord(entry) || !Object.hasOwn(FIXED_UNIT_FIELDS, String(entry.unit))
      || !isFiniteNonNegative(entry.coinsPerUnit) || units.has(String(entry.unit))) return false;
    units.add(String(entry.unit));
    return true;
  });
}

function isDateOrNull(value: unknown) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function isSellVariant(value: unknown) {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.length > 0
    && ["token", "fixed", "hybrid"].includes(String(value.strategy))
    && isTokenRate(value.tokensPerCoin)
    && isTokenRatesByModality(value.tokensPerCoinByModality)
    && isFixedRates(value.fixedRates)
    && isDateOrNull(value.effectiveFrom)
    && isDateOrNull(value.effectiveTo);
}

function isJobSellPrice(value: unknown): value is JobSellPrice {
  return isRecord(value)
    && ["token", "fixed", "hybrid"].includes(String(value.strategy))
    && isTokenRate(value.tokensPerCoin)
    && isTokenRatesByModality(value.tokensPerCoinByModality)
    && isFixedRates(value.fixedRates)
    && Array.isArray(value.variants)
    && value.variants.every(isSellVariant)
    && new Set(value.variants.map((variant) => (variant as Record<string, unknown>).id)).size === value.variants.length
    && isDateOrNull(value.effectiveFrom)
    && isDateOrNull(value.effectiveTo);
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreeze(entry))) as T;
  }
  if (!isRecord(value)) return value;
  const clone = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneAndFreeze(entry)]));
  return Object.freeze(clone) as T;
}

export function resolveManifestModel(provider: string, modelName: string): CatalogModel | null {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedModelName = String(modelName || "").trim();
  if (!normalizedProvider || !normalizedModelName) return null;

  const models = AI_MODEL_CATALOG.models.filter((model) => model.entryKind === "model" && model.provider === normalizedProvider);
  const exact = models.find((model) => model.id === `${normalizedProvider}:${normalizedModelName}`);
  if (exact) return exact;

  const aliases = models.filter((model) =>
    model.compatibility.billingModelNameAlias === normalizedModelName || model.upstreamModelName === normalizedModelName);
  return aliases.length === 1 ? aliases[0] : null;
}

function selectedSellPrice(sell: JobSellPrice, variant: string | null) {
  if (variant === null) return sell;
  return sell.variants.find((candidate) => candidate.id === variant) ?? null;
}

function toLegacyFixedRate(sell: JobSellPrice, variant: string | null): LegacyFixedRate | null {
  const selected = selectedSellPrice(sell, variant);
  if (!selected || selected.fixedRates.length === 0) return null;

  const legacyRate: LegacyFixedRate = {};
  for (const rate of selected.fixedRates) {
    const field = FIXED_UNIT_FIELDS[rate.unit];
    legacyRate[field] = rate.coinsPerUnit;
  }
  return Object.keys(legacyRate).length > 0 ? legacyRate : null;
}

function usageMatchesModality(modality: "audio" | "video", usage: ReservedUsageV1) {
  return modality === "audio"
    ? usage.unit === "characters"
    : usage.unit === "seconds" || usage.unit === "videos";
}

function unavailable(reason: string) {
  return { ok: false as const, errorCode: "PRICING_SNAPSHOT_UNAVAILABLE" as const, reason };
}

export function buildJobPricingSnapshot(args: {
  provider: string;
  modelName: string;
  modality: "audio" | "video";
  variant?: string | null;
  reservedUsage: ReservedUsageV1;
}):
  | { ok: true; snapshot: JobPricingSnapshotV1; reservedCoins: number; legacyFixedUsage: IFixedUsage }
  | { ok: false; errorCode: "PRICING_SNAPSHOT_UNAVAILABLE"; reason: string } {
  const { provider, modelName, modality, reservedUsage } = args;
  if (!Number.isFinite(reservedUsage?.quantity) || reservedUsage.quantity <= 0) return unavailable("reserved_usage_invalid");
  if (!usageMatchesModality(modality, reservedUsage)) return unavailable("reserved_usage_unit_unsupported");

  const model = resolveManifestModel(provider, modelName);
  const profile = model?.modalities.find((candidate) => candidate.modality === modality);
  if (!model || !profile) return unavailable("model_profile_missing");

  const sell = profile.pricing.sell;
  if (!sell) return unavailable("sell_price_missing");

  const requestedVariant = args.variant ?? null;
  if (modality === "audio" && requestedVariant !== null) return unavailable("audio_variant_unsupported");
  const variant = modality === "video" && sell.variants.length === 0 ? null : requestedVariant;
  if (variant !== null && !sell.variants.some((candidate) => candidate.id === variant)) {
    return unavailable("sell_variant_missing");
  }

  const billingModelName = model.compatibility.billingModelNameAlias ?? model.modelName;
  const billingKey = [model.provider, billingModelName, variant].filter(Boolean).join(":");
  const fixedRate = toLegacyFixedRate(sell, variant);
  const requiredRateField = RESERVED_USAGE_FIELDS[reservedUsage.unit];
  if (!fixedRate || typeof fixedRate[requiredRateField] !== "number") return unavailable("fixed_rate_missing_for_reserved_usage");

  const snapshot: JobPricingSnapshotV1 = Object.freeze({
    schemaVersion: 1,
    pricingRevision: AI_MODEL_CATALOG_REVISIONS.pricingRevision,
    calculatorVersion: JOB_PRICING_CALCULATOR_VERSION,
    modelRef: `${model.id}/${modality}`,
    modality,
    billingKey,
    variant,
    sell: cloneAndFreeze(sell),
  });

  const legacyFixedUsage = toLegacyFixedUsage(reservedUsage);
  const reservedCoins = quoteJobPricingSnapshot(snapshot, reservedUsage);
  return { ok: true, snapshot, reservedCoins, legacyFixedUsage };
}

export function quoteJobPricingSnapshot(snapshot: JobPricingSnapshotV1, usage: ReservedUsageV1): number {
  if (!Number.isFinite(usage?.quantity) || usage.quantity <= 0) throw new RangeError("reserved_usage_invalid");
  if (!usageMatchesModality(snapshot.modality, usage)) throw new TypeError("reserved_usage_unit_unsupported");
  const fixedRate = toLegacyFixedRate(snapshot.sell, snapshot.variant);
  const requiredRateField = RESERVED_USAGE_FIELDS[usage.unit];
  if (!fixedRate || typeof fixedRate[requiredRateField] !== "number") throw new Error("PRICING_SNAPSHOT_UNAVAILABLE");

  const result = calcCoinsWithPricingMaps({
    billingKey: snapshot.billingKey as never,
    fixed: toLegacyFixedUsage(usage),
    fixedMap: { [snapshot.billingKey]: fixedRate },
  });
  return result.coins;
}

export function toLegacyFixedUsage(usage: ReservedUsageV1): IFixedUsage {
  switch (usage.unit) {
    case "characters": return { characters: usage.quantity };
    case "seconds": return { seconds: usage.quantity };
    case "videos": return { videos: usage.quantity };
  }
}

export function decodeJobPricingSnapshot(
  value: unknown,
  mirrorPricingRevision: unknown,
): { ok: true; snapshot: JobPricingSnapshotV1 } | { ok: false; reason: "missing" | "invalid" } {
  if (value === null || value === undefined) return { ok: false, reason: "missing" };
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.pricingRevision !== "string"
    || value.pricingRevision.length === 0
    || value.pricingRevision !== mirrorPricingRevision
    || value.calculatorVersion !== JOB_PRICING_CALCULATOR_VERSION
    || typeof value.modelRef !== "string"
    || typeof value.modality !== "string"
    || (value.modality !== "audio" && value.modality !== "video")
    || typeof value.billingKey !== "string"
    || value.billingKey.length === 0
    || (value.variant !== null && typeof value.variant !== "string")
    || !isJobSellPrice(value.sell)) return { ok: false, reason: "invalid" };

  try {
    if (parseModelModalityRef(value.modelRef).modality !== value.modality) return { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (value.modality === "audio" && value.variant !== null) return { ok: false, reason: "invalid" };
  if (value.variant !== null && !value.sell.variants.some((variant) => variant.id === value.variant)) {
    return { ok: false, reason: "invalid" };
  }

  const snapshot = Object.freeze({
    schemaVersion: 1 as const,
    pricingRevision: value.pricingRevision,
    calculatorVersion: JOB_PRICING_CALCULATOR_VERSION,
    modelRef: value.modelRef,
    modality: value.modality,
    billingKey: value.billingKey,
    variant: value.variant,
    sell: cloneAndFreeze(value.sell),
  });
  return { ok: true, snapshot: snapshot as JobPricingSnapshotV1 };
}
