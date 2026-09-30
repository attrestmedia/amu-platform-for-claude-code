import "server-only";
import crypto from "crypto";
import { FIXED_COSTS, TOKENS_PER_COIN } from "consts/payment";
import {
  listSystemPricingCatalogEntries,
  upsertSystemPricingCatalogEntries,
  type SystemPricingCatalogRepoInput,
} from "libs/database/system";
import { calcCoinsWithPricingMaps, resolveBillingKeyWithPricingMaps } from "utils/payment/coinUtils";
import { buildPricingMapsFromCatalog, collectDbOnlyBillingKeys } from "utils/payment/pricingCatalogCore";
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
  source: "db" | "fallback";
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

function toBootstrapMap() {
  const map = new Map<string, SystemPricingCatalogItem>();

  for (const [billingKey, tokensPerCoin] of Object.entries(TOKENS_PER_COIN as Record<string, SystemPricingTokenRate>)) {
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

  for (const [billingKey, fixedCost] of Object.entries(FIXED_COSTS as Record<string, SystemPricingFixedRate>)) {
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

function toRepoInput(item: SystemPricingCatalogItem): SystemPricingCatalogRepoInput {
  return {
    billingKey: item.billingKey,
    provider: item.provider,
    modelName: item.modelName,
    variant: item.variant,
    modality: item.modality,
    tokensPerCoin: item.tokensPerCoin || null,
    fixedCost: item.fixedCost || null,
    effectiveFrom: item.effectiveFrom || null,
    effectiveTo: item.effectiveTo || null,
  };
}

function isPricingItemActive(item: Pick<SystemPricingCatalogItem, "effectiveFrom" | "effectiveTo">, now = new Date()) {
  const from = toSafeDate(item.effectiveFrom);
  const to = toSafeDate(item.effectiveTo);
  if (from && from.getTime() > now.getTime()) return false;
  if (to && to.getTime() <= now.getTime()) return false;
  return true;
}

async function loadPricingDocuments() {
  const docs = await listSystemPricingCatalogEntries();
  if (docs.length > 0) return docs;

  const bootstrap = Array.from(toBootstrapMap().values());
  await upsertSystemPricingCatalogEntries(bootstrap.map(toRepoInput));
  return await listSystemPricingCatalogEntries();
}

export async function listSystemPricingCatalog(args: { activeOnly?: boolean } = {}) {
  const activeOnly = args.activeOnly !== false;
  const now = new Date();
  const bootstrapMap = toBootstrapMap();
  const docs = await loadPricingDocuments();

  const merged = Array.from(bootstrapMap.values()).map((item) => {
    const doc = docs.find((row) => row.billingKey === item.billingKey);
    const next: SystemPricingCatalogItem = {
      ...item,
      variant: String(doc?.variant || item.variant || "").trim() || undefined,
      modality: (doc?.modality as AiModalityType | undefined) || item.modality,
      tokensPerCoin: doc?.tokensPerCoin
        ? {
            input: Number(doc.tokensPerCoin.input || 0),
            output: Number(doc.tokensPerCoin.output || 0),
          }
        : item.tokensPerCoin || null,
      fixedCost: doc?.fixedCost
        ? {
            ...(typeof doc.fixedCost.perSecond === "number" ? { perSecond: Number(doc.fixedCost.perSecond) } : {}),
            ...(typeof doc.fixedCost.perMinute === "number" ? { perMinute: Number(doc.fixedCost.perMinute) } : {}),
            ...(typeof doc.fixedCost.perImage === "number" ? { perImage: Number(doc.fixedCost.perImage) } : {}),
            ...(typeof doc.fixedCost.perVideo === "number" ? { perVideo: Number(doc.fixedCost.perVideo) } : {}),
            ...(typeof doc.fixedCost.perThousandCharacters === "number"
              ? { perThousandCharacters: Number(doc.fixedCost.perThousandCharacters) }
              : {}),
            ...(typeof doc.fixedCost.perCredit === "number" ? { perCredit: Number(doc.fixedCost.perCredit) } : {}),
          }
        : item.fixedCost || null,
      effectiveFrom: doc?.effectiveFrom || item.effectiveFrom || null,
      effectiveTo: doc?.effectiveTo || item.effectiveTo || null,
      source: doc ? "db" : "fallback",
      // 코드 정책 키 집합에서 나온 항목이므로 DB 값 override가 있어도 정책 관리 대상이다.
      policyManaged: true,
    };
    return next;
  });

  for (const doc of docs) {
    if (merged.some((item) => item.billingKey === doc.billingKey)) continue;
    merged.push({
      billingKey: doc.billingKey,
      provider: String(doc.provider || "").trim().toLowerCase(),
      modelName: String(doc.modelName || "").trim(),
      variant: String(doc.variant || "").trim() || undefined,
      modality: (doc.modality as AiModalityType | undefined) || undefined,
      tokensPerCoin: doc.tokensPerCoin
        ? {
            input: Number(doc.tokensPerCoin.input || 0),
            output: Number(doc.tokensPerCoin.output || 0),
          }
        : null,
      fixedCost: doc.fixedCost
        ? {
            ...(typeof doc.fixedCost.perSecond === "number" ? { perSecond: Number(doc.fixedCost.perSecond) } : {}),
            ...(typeof doc.fixedCost.perMinute === "number" ? { perMinute: Number(doc.fixedCost.perMinute) } : {}),
            ...(typeof doc.fixedCost.perImage === "number" ? { perImage: Number(doc.fixedCost.perImage) } : {}),
            ...(typeof doc.fixedCost.perVideo === "number" ? { perVideo: Number(doc.fixedCost.perVideo) } : {}),
            ...(typeof doc.fixedCost.perThousandCharacters === "number"
              ? { perThousandCharacters: Number(doc.fixedCost.perThousandCharacters) }
              : {}),
            ...(typeof doc.fixedCost.perCredit === "number" ? { perCredit: Number(doc.fixedCost.perCredit) } : {}),
          }
        : null,
      effectiveFrom: doc.effectiveFrom || null,
      effectiveTo: doc.effectiveTo || null,
      source: "db",
      // 코드 정책에 없는 DB 잔여 문서. 관리자 화면에는 보이되 가격 판정에는 쓰지 않는다.
      policyManaged: false,
    });
  }

  const filtered = activeOnly ? merged.filter((item) => isPricingItemActive(item, now)) : merged;
  return filtered.sort((a, b) => a.billingKey.localeCompare(b.billingKey));
}

/**
 * 가격 판정의 단일 소스. 가격표 확인(assertPricingConfigured)과 코인 산정(calcCoins)이
 * 모두 이 표를 쓴다.
 *
 * 코드 정책(bootstrap 상수)의 키 집합이 정본이고 DB는 그 키의 값(단가·유효기간)만 덮어쓴다.
 * 코드 정책에서 빠진 DB only 키는 기본적으로 제외한다 — 넣으면 가격표는 통과하고 과금은
 * UNKNOWN_BILLING_RATE로 실패하는 불일치가 생긴다. 관리자 화면처럼 잔여 문서까지 봐야 하는
 * 경우에만 includeDbOnly로 명시한다.
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

/**
 * 가격 상한 판단과 과금이 같은 가격 snapshot을 사용했음을 확인할 수 있는 revision.
 * 금액 표 자체만 해시하므로 DB/fallback 출처가 바뀌어도 동일한 가격이면 동일 revision을 유지한다.
 */
export function createSystemPricingSnapshotRevision(pricing: SystemPricingMaps) {
  const stableMap = (map: Record<string, Record<string, number>>) =>
    Object.keys(map)
      .sort()
      .map((key) => [key, map[key]]);
  const payload = JSON.stringify({
    tokenMap: stableMap(pricing.tokenMap),
    fixedMap: stableMap(pricing.fixedMap),
  });
  return `pricing-${crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16)}`;
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

  const dbOnlyBillingKeys = collectDbOnlyBillingKeys(
    catalog.map((item) => ({ billingKey: item.billingKey, policyManaged: item.policyManaged !== false })),
  );

  return {
    totalEntries: catalog.length,
    tokenEntries,
    fixedEntries,
    fallbackEntries: catalog.filter((item) => item.source === "fallback").length,
    dbEntries: catalog.filter((item) => item.source === "db").length,
    // 코드 정책에서 빠진 DB 잔여 문서. 가격 판정에는 쓰이지 않으며 정리 대상이다.
    dbOnlyEntries: dbOnlyBillingKeys.length,
    dbOnlyBillingKeys: dbOnlyBillingKeys.slice(0, 100),
  };
}
