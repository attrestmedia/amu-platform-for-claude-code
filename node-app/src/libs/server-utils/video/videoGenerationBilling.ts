import type { IFixedUsage } from "types/payment";
import type { SystemPricingMaps } from "libs/server-utils/api/systemPricingControl";
import {
  buildJobPricingSnapshot,
  decodeJobPricingSnapshot,
  quoteJobPricingSnapshot,
  type JobPricingSnapshotV1,
  type ReservedUsageV1,
} from "libs/server-utils/ai/jobPricingSnapshot";
import { estimateVideoGenerationCoins } from "types/ai";

export type VideoBillingPlan = {
  provider: "google" | "xai" | "zai";
  modelName: string;
  resolution: string;
  billingKey: string;
  fixedUsage: IFixedUsage;
  reservedUsage: ReservedUsageV1;
  snapshot: JobPricingSnapshotV1;
  estimatedCoins: number;
  runtimeEstimatedCoins: number | null;
  runtimeBillingKey: string;
  parityMatches: boolean;
  pricingRevision: string;
  pricingBasis: "per-second" | "per-video";
  unitRate: number;
};

export type VideoProviderType = "google" | "xai" | "zai";

function safeMap(pricing?: SystemPricingMaps) {
  return pricing?.fixedMap || {};
}

function videoSnapshot(args: {
  provider: "google" | "xai" | "zai";
  modelName: string;
  durationSeconds: number;
  resolution: string;
}) {
  const durationSeconds = Math.max(1, Number(args.durationSeconds));
  const shared = {
    provider: args.provider,
    modelName: args.modelName,
    modality: "video" as const,
    variant: args.resolution || null,
  };
  const candidates: ReservedUsageV1[] = [
    { unit: "seconds", quantity: durationSeconds },
    { unit: "videos", quantity: 1 },
  ];

  for (const reservedUsage of candidates) {
    const result = buildJobPricingSnapshot({ ...shared, reservedUsage });
    if (result.ok && result.reservedCoins > 0) return { result, reservedUsage };
  }
  return null;
}

function runtimePlan(args: {
  provider: "google" | "xai" | "zai";
  modelName: string;
  durationSeconds: number;
  resolution: string;
  pricing: SystemPricingMaps;
}) {
  return estimateVideoGenerationCoins({
    provider: args.provider,
    modelName: args.modelName,
    durationSeconds: args.durationSeconds,
    resolution: args.resolution,
    pricing: safeMap(args.pricing),
  });
}

export function buildVideoBillingPlan(args: {
  provider: "google" | "xai" | "zai";
  modelName: string;
  durationSeconds: number;
  resolution: string;
  pricing: SystemPricingMaps;
}): VideoBillingPlan | null {
  const built = videoSnapshot(args);
  if (!built) return null;

  const { result, reservedUsage } = built;
  const snapshot = result.snapshot;
  const runtime = runtimePlan(args);
  const pricingBasis = reservedUsage.unit === "seconds" ? "per-second" : "per-video";
  const selectedSell = reservedUsage.unit === "seconds" || reservedUsage.unit === "videos"
    ? (snapshot.variant === null
      ? snapshot.sell
      : snapshot.sell.variants.find((variant) => variant.id === snapshot.variant))
    : undefined;
  const sellUnit = reservedUsage.unit === "seconds" ? "second" : "video";
  const unitRate = selectedSell?.fixedRates.find((rate) => rate.unit === sellUnit)?.coinsPerUnit || 0;

  return {
    provider: args.provider,
    modelName: args.modelName,
    resolution: args.resolution,
    billingKey: snapshot.billingKey,
    fixedUsage: result.legacyFixedUsage,
    reservedUsage,
    snapshot,
    estimatedCoins: result.reservedCoins,
    runtimeEstimatedCoins: runtime?.coins ?? null,
    runtimeBillingKey: runtime?.billingKey ?? "",
    parityMatches: Boolean(
      runtime
      && runtime.coins === result.reservedCoins
      && runtime.billingKey === snapshot.billingKey
      && runtime.pricingBasis === pricingBasis,
    ),
    pricingRevision: snapshot.pricingRevision,
    pricingBasis,
    unitRate,
  };
}

function readReservedUsage(value: unknown): ReservedUsageV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.quantity !== "number" || !Number.isFinite(record.quantity) || record.quantity <= 0) return null;
  if (record.unit !== "seconds" && record.unit !== "videos") return null;
  return { unit: record.unit, quantity: Number(record.quantity) };
}

export type VideoSettlementQuote =
  | {
      ok: true;
      reservedUsage: ReservedUsageV1;
      actualUsage: ReservedUsageV1;
      reservedCoins: number;
      actualCoins: number;
      refundCoins: number;
      reserveOperationId: string;
    }
  | {
      ok: false;
      reconciliationCode:
        | "VIDEO_PRICING_SNAPSHOT_MISSING"
        | "VIDEO_PRICING_SNAPSHOT_INVALID"
        | "VIDEO_RESERVATION_CAP_EXCEEDED"
        | "VIDEO_RESERVE_OPERATION_MISSING";
  };

export function resolveVideoSettlementQuote(args: {
  jobPricingSnapshot: unknown;
  pricingRevision: unknown;
  reservedUsage: unknown;
  reservedCoins: unknown;
  estimatedCoins: unknown;
  reserveOperationId: unknown;
  actualDurationSeconds: number;
}): VideoSettlementQuote {
  const decoded = decodeJobPricingSnapshot(args.jobPricingSnapshot, args.pricingRevision);
  if (!decoded.ok) {
    return {
      ok: false,
      reconciliationCode: decoded.reason === "missing" ? "VIDEO_PRICING_SNAPSHOT_MISSING" : "VIDEO_PRICING_SNAPSHOT_INVALID",
    };
  }
  if (decoded.snapshot.modality !== "video") {
    return { ok: false, reconciliationCode: "VIDEO_PRICING_SNAPSHOT_INVALID" };
  }

  const reservedUsage = readReservedUsage(args.reservedUsage);
  const reservedCoins = Number(args.reservedCoins);
  const estimatedCoins = Number(args.estimatedCoins);
  const reserveOperationId = String(args.reserveOperationId || "").trim();
  if (!reservedUsage
    || !Number.isSafeInteger(reservedCoins)
    || reservedCoins < 0
    || estimatedCoins !== reservedCoins) {
    return { ok: false, reconciliationCode: "VIDEO_PRICING_SNAPSHOT_INVALID" };
  }
  if (!reserveOperationId) return { ok: false, reconciliationCode: "VIDEO_RESERVE_OPERATION_MISSING" };

  let expectedReservedCoins: number;
  try {
    expectedReservedCoins = quoteJobPricingSnapshot(decoded.snapshot, reservedUsage);
  } catch {
    return { ok: false, reconciliationCode: "VIDEO_PRICING_SNAPSHOT_INVALID" };
  }
  if (expectedReservedCoins !== reservedCoins) {
    return { ok: false, reconciliationCode: "VIDEO_PRICING_SNAPSHOT_INVALID" };
  }

  const actualUsage: ReservedUsageV1 = reservedUsage.unit === "seconds"
    ? { unit: "seconds", quantity: Math.ceil(Math.max(1, Number(args.actualDurationSeconds))) }
    : { unit: "videos", quantity: 1 };
  if (!Number.isFinite(actualUsage.quantity) || actualUsage.quantity > reservedUsage.quantity) {
    return { ok: false, reconciliationCode: "VIDEO_RESERVATION_CAP_EXCEEDED" };
  }

  try {
    const actualCoins = quoteJobPricingSnapshot(decoded.snapshot, actualUsage);
    if (actualCoins > reservedCoins) {
      return { ok: false, reconciliationCode: "VIDEO_RESERVATION_CAP_EXCEEDED" };
    }
    return {
      ok: true,
      reservedUsage,
      actualUsage,
      reservedCoins,
      actualCoins,
      refundCoins: reservedCoins - actualCoins,
      reserveOperationId,
    };
  } catch {
    return { ok: false, reconciliationCode: "VIDEO_PRICING_SNAPSHOT_INVALID" };
  }
}

export function resolveVideoBillingProvider(provider: string): VideoProviderType {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === "google" || normalized === "xai" || normalized === "zai") return normalized;
  throw Object.assign(new Error("video_provider_invalid"), { errorCode: "VIDEO_PROVIDER_INVALID", status: 400 });
}
