import "server-only";
import { AI_SELL_FIXED_COSTS, AI_SELL_TOKENS_PER_COIN } from "consts/ai/generated/modelCatalog.generated";
import { calcCoinsWithPricingMaps, resolveBillingKeyWithPricingMaps } from "utils/payment/coinUtils";
import { buildPricingMapsFromCatalog } from "utils/payment/pricingCatalogCore";
import { resolveMediaBillingStrategy } from "utils/payment/mediaBillingStrategy";
import type { AiModalityType, BillableProviderType } from "types/ai";
import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment/coin";

export type SystemPricingTokenRate = {
  input: number;
  output: number;
};

export type SystemPricingFixedRate = {
  perSecond?: number;
  perMinute?: number;
  perImage?: number;
  perVideo?: number;
  /** EL-203 — speech 문자/크레딧 과금 단위 */
  perThousandCharacters?: number;
  perCredit?: number;
};

export type SystemPricingCatalogItem = {
  billingKey: string;
  /** 코드 정책(bootstrap 상수)에 존재하는 키인지. false면 DB에만 남은 정리 대상이다. */
  policyManaged?: boolean;
  provider: string;
  modelName: string;
  variant?: string;
  modality?: AiModalityType;
  tokensPerCoin?: SystemPricingTokenRate | null;
  fixedCost?: SystemPricingFixedRate | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  source: "manifest" | "fallback";
};

export type SystemPricingMaps = {
  tokenMap: Record<string, SystemPricingTokenRate>;
  fixedMap: Record<string, SystemPricingFixedRate>;
};

function isModality(value?: string): value is AiModalityType {
  return value === "text" || value === "audio" || value === "image" || value === "video";
}

function toSafeDate(value: unknown) {
  if (!value) return null;
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseBillingKey(billingKey: string) {
  const parts = String(billingKey || "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
  const provider = String(parts[0] || "").toLowerCase();
  const tail = parts.slice(1);
  const last = tail[tail.length - 1];
  const modality = isModality(last) ? last : undefined;
  const core = modality ? tail.slice(0, -1) : tail;
  const variant = core.length > 1 ? String(core[core.length - 1] || "") : "";
  const modelName = core.length > 1 ? core.slice(0, -1).join(":") : String(core[0] || "");
  return {
    billingKey,
    provider,
    modelName,
    variant,
    modality,
  };
}

export function toBootstrapMap() {
  const map = new Map<string, SystemPricingCatalogItem>();

  for (const [billingKey, tokensPerCoin] of Object.entries(AI_SELL_TOKENS_PER_COIN as Record<string, SystemPricingTokenRate>)) {
    const parsed = parseBillingKey(billingKey);
    const current = map.get(billingKey);
    map.set(billingKey, {
      billingKey,
      provider: parsed.provider,
      modelName: parsed.modelName,
      variant: parsed.variant || undefined,
      modality: parsed.modality,
      tokensPerCoin: {
        input: Number(tokensPerCoin?.input || 0),
        output: Number(tokensPerCoin?.output || 0),
      },
      fixedCost: current?.fixedCost || null,
      effectiveFrom: null,
      effectiveTo: null,
      source: "fallback",
    });
  }

  for (const [billingKey, fixedCost] of Object.entries(AI_SELL_FIXED_COSTS as Record<string, SystemPricingFixedRate>)) {
    const parsed = parseBillingKey(billingKey);
    const current = map.get(billingKey);
    map.set(billingKey, {
      billingKey,
      provider: parsed.provider,
      modelName: parsed.modelName,
      variant: parsed.variant || undefined,
      modality: parsed.modality,
      tokensPerCoin: current?.tokensPerCoin || null,
      fixedCost: {
        ...(typeof fixedCost?.perSecond === "number" ? { perSecond: Number(fixedCost.perSecond) } : {}),
        ...(typeof fixedCost?.perMinute === "number" ? { perMinute: Number(fixedCost.perMinute) } : {}),
        ...(typeof fixedCost?.perImage === "number" ? { perImage: Number(fixedCost.perImage) } : {}),
        ...(typeof fixedCost?.perVideo === "number" ? { perVideo: Number(fixedCost.perVideo) } : {}),
        ...(typeof fixedCost?.perThousandCharacters === "number"
          ? { perThousandCharacters: Number(fixedCost.perThousandCharacters) }
          : {}),
        ...(typeof fixedCost?.perCredit === "number" ? { perCredit: Number(fixedCost.perCredit) } : {}),
      },
      effectiveFrom: null,
      effectiveTo: null,
      source: "fallback",
    });
  }

  return map;
}

function isPricingItemActive(item: Pick<SystemPricingCatalogItem, "effectiveFrom" | "effectiveTo">, now = new Date()) {
  const from = toSafeDate(item.effectiveFrom);
  const to = toSafeDate(item.effectiveTo);
  if (from && from.getTime() > now.getTime()) return false;
  if (to && to.getTime() <= now.getTime()) return false;
  return true;
}

export async function listSystemPricingCatalog(args: { activeOnly?: boolean } = {}) {
  const activeOnly = args.activeOnly !== false;
  const now = new Date();
  const catalog = Array.from(toBootstrapMap().values()).map((item) => ({
    ...item,
    source: "manifest" as const,
    policyManaged: true,
  }));
  const filtered = activeOnly ? catalog.filter((item) => isPricingItemActive(item, now)) : catalog;
  return filtered.sort((a, b) => a.billingKey.localeCompare(b.billingKey));
}

/**
 * 가격 판정의 단일 소스. 가격표 확인(assertPricingConfigured)과 코인 산정(calcCoins)이
 * 모두 이 표를 쓴다.
 *
 * Phase B 이후 가격 정본은 generated manifest를 반영한 bootstrap map이다.
 * includeDbOnly는 기존 호출 시그니처를 유지하기 위한 호환 인자로 남지만 효과는 없다.
 */
export async function getSystemPricingMaps(
  args: { activeOnly?: boolean; includeDbOnly?: boolean } = {},
): Promise<SystemPricingMaps> {
  const items = await listSystemPricingCatalog({ activeOnly: args.activeOnly });
  return buildPricingMapsFromCatalog(
    items.map((item) => ({
      billingKey: item.billingKey,
      tokensPerCoin: item.tokensPerCoin || null,
      fixedCost: (item.fixedCost as Record<string, number> | null) || null,
      policyManaged: item.policyManaged !== false,
    })),
    { includeDbOnly: args.includeDbOnly },
  ) as SystemPricingMaps;
}

/**
 * 과금 경로가 쓰는 단일 진입점. billingKey 해석과 코인 산정을 같은 pricing map으로 수행해
 * "가격표에는 있는데 과금은 못 하는" 상태가 생기지 않게 한다.
 */
export async function resolveSystemBillingQuote(args: {
  provider: BillableProviderType;
  modelName: string;
  modality?: AiModalityType;
  variant?: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}) {
  const maps = await getSystemPricingMaps();
  const billingKey = resolveBillingKeyWithPricingMaps({
    provider: args.provider,
    model: args.modelName,
    variant: args.variant,
    modality: args.modality,
    tokenMap: maps.tokenMap,
    fixedMap: maps.fixedMap,
  });
  const { coins, breakdown } = calcCoinsWithPricingMaps({
    billingKey,
    usage: args.usage,
    fixed: args.fixed,
    tokenMap: maps.tokenMap,
    fixedMap: maps.fixedMap,
  });
  return { billingKey, coins, breakdown };
}

function buildBillingKeyCandidates(provider: BillableProviderType, modelName: string, modality: AiModalityType, variant?: string) {
  const base = `${String(provider || "").trim().toLowerCase()}:${String(modelName || "").trim()}`;
  return [
    variant ? `${base}:${variant}:${modality}` : "",
    variant ? `${base}:${variant}` : "",
    `${base}:${modality}`,
    base,
  ].filter(Boolean);
}

export async function previewSystemPricingQuote(args: {
  provider: BillableProviderType;
  modelName: string;
  modality: AiModalityType;
  variant?: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}) {
  const maps = await getSystemPricingMaps();
  const billingStrategy = resolveMediaBillingStrategy({
    provider: args.provider,
    modelName: args.modelName,
    modality: args.modality,
    variant: args.variant,
    pricing: maps,
  });
  const billingKey = resolveBillingKeyWithPricingMaps({
    provider: args.provider,
    model: args.modelName,
    variant: args.variant,
    modality: args.modality,
    tokenMap: maps.tokenMap,
    fixedMap: maps.fixedMap,
  });
  const coins = calcCoinsWithPricingMaps({
    billingKey,
    usage: args.usage,
    fixed: args.fixed,
    tokenMap: maps.tokenMap,
    fixedMap: maps.fixedMap,
  });
  const catalog = await listSystemPricingCatalog();
  const candidates = buildBillingKeyCandidates(args.provider, args.modelName, args.modality, args.variant);
  const matchedTokenEntry = candidates
    .map((key) => catalog.find((item) => item.billingKey === key && item.tokensPerCoin))
    .find(Boolean);
  const matchedFixedEntry = candidates
    .map((key) => catalog.find((item) => item.billingKey === key && item.fixedCost))
    .find(Boolean);

  return {
    billingKey,
    billingStrategy,
    coins: coins.coins,
    breakdown: coins.breakdown,
    tokenPricing: matchedTokenEntry?.tokensPerCoin || null,
    fixedPricing: matchedFixedEntry?.fixedCost || null,
    tokenPricingSource: matchedTokenEntry?.source || null,
    fixedPricingSource: matchedFixedEntry?.source || null,
  };
}

export async function getSystemPricingSummary() {
  const catalog = await listSystemPricingCatalog();
  let tokenEntries = 0;
  let fixedEntries = 0;

  for (const item of catalog) {
    if (item.tokensPerCoin) tokenEntries += 1;
    if (item.fixedCost) fixedEntries += 1;
  }

  return {
    totalEntries: catalog.length,
    tokenEntries,
    fixedEntries,
    // Phase B 이후 DB 가격 문서는 런타임에서 읽지 않는다(SSOT-106).
    fallbackEntries: 0,
    dbEntries: 0,
    dbOnlyEntries: 0,
    dbOnlyBillingKeys: [],
  };
}
