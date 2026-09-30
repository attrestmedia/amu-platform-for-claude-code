import type { IFixedUsage } from "types/payment";
import {
  createSystemPricingSnapshotRevision,
  type SystemPricingMaps,
} from "libs/server-utils/api/systemPricingControl";
import { estimateVideoGenerationCoins } from "types/ai";

export type VideoBillingPlan = {
  provider: "google" | "xai" | "zai";
  modelName: string;
  resolution: string;
  billingKey: string;
  fixedUsage: IFixedUsage;
  estimatedCoins: number;
  pricingRevision: string;
  pricingBasis: "per-second" | "per-video";
  unitRate: number;
};

export type VideoProviderType = "google" | "xai" | "zai";

function safeMap(pricing?: SystemPricingMaps) {
  return pricing?.fixedMap || {};
}

function findBillingKey(args: {
  provider: "google" | "xai" | "zai";
  modelName: string;
  resolution: string;
  pricing: SystemPricingMaps;
}) {
  const base = `${args.provider}:${args.modelName}`;
  const candidates = [`${base}:${args.resolution}`, base];
  const fixedMap = safeMap(args.pricing);
  return candidates.find((key) => Object.prototype.hasOwnProperty.call(fixedMap, key)) || "";
}

export function buildVideoBillingPlan(args: {
  provider: "google" | "xai" | "zai";
  modelName: string;
  durationSeconds: number;
  resolution: string;
  pricing: SystemPricingMaps;
}): VideoBillingPlan | null {
  const billingKey = findBillingKey(args);
  if (!billingKey) return null;

  const estimate = estimateVideoGenerationCoins({
    provider: args.provider,
    modelName: args.modelName,
    durationSeconds: args.durationSeconds,
    resolution: args.resolution,
    pricing: safeMap(args.pricing),
  });
  if (!estimate || estimate.coins <= 0) return null;

  const fixedRate = safeMap(args.pricing)[billingKey];
  const fixedUsage: IFixedUsage = fixedRate?.perSecond
    ? { seconds: Math.max(1, args.durationSeconds) }
    : fixedRate?.perVideo
      ? { videos: 1 }
      : {};
  if (!Object.keys(fixedUsage).length) return null;

  return {
    provider: args.provider,
    modelName: args.modelName,
    resolution: args.resolution,
    billingKey,
    fixedUsage,
    estimatedCoins: estimate.coins,
    pricingRevision: createSystemPricingSnapshotRevision(args.pricing),
    pricingBasis: estimate.pricingBasis,
    unitRate: estimate.pricingBasis === "per-second" ? Number(fixedRate?.perSecond || 0) : Number(fixedRate?.perVideo || 0),
  };
}

export function resolveActualVideoCoins(args: {
  plan: VideoBillingPlan;
  actualDurationSeconds: number;
  pricing?: SystemPricingMaps;
}) {
  if (args.plan.pricingBasis === "per-video") return args.plan.estimatedCoins;
  if (args.plan.unitRate > 0) return Math.ceil(Math.max(1, args.actualDurationSeconds)) * args.plan.unitRate;
  if (!args.pricing) return 0;
  const estimate = estimateVideoGenerationCoins({
    provider: args.plan.provider,
    modelName: args.plan.modelName,
    durationSeconds: args.actualDurationSeconds,
    resolution: args.plan.resolution,
    pricing: safeMap(args.pricing),
  });
  return estimate?.coins || 0;
}

export function resolveVideoBillingProvider(provider: string): VideoProviderType {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === "google" || normalized === "xai" || normalized === "zai") return normalized;
  throw Object.assign(new Error("video_provider_invalid"), { errorCode: "VIDEO_PROVIDER_INVALID", status: 400 });
}
