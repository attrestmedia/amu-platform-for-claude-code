import type { BillingKeyLikeType, BillingCostKeyLikeType } from "types/payment";
import type { ICalcParams } from "types/payment";
import type { CoinUpdatedPayload } from "./billingUtils";
import type { AiProviderType, AiModalityType, BillableProviderType, UserScopeType } from "types/ai";
import { TOKENS_PER_COIN, FIXED_COSTS } from "consts/payment";
import { AI_MODALITY_TYPES } from "consts/ai";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose coinUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain payment
 * @scope global
 */

export type TokenPricingMapType = Record<string, { input: number; output: number }>;
export type FixedPricingMapType = Record<
  string,
  {
    perSecond?: number;
    perMinute?: number;
    perImage?: number;
    perVideo?: number;
    perThousandCharacters?: number;
    perCredit?: number;
  }
>;
type CoinBreakdownType = Record<string, unknown>;
type TokenUsageWithLegacyRoot = NonNullable<ICalcParams["usage"]> & { input?: number; output?: number };

// resolveBillingKey 결과 캐시 (과금 경로에서 매우 자주 호출됨)
const BILLING_KEY_CACHE_MAX = 2000;
const billingKeyCache = new Map<string, BillingKeyLikeType | BillingCostKeyLikeType>();

// 캐시 키 생성
function getBillingKeyCacheKey(provider: string, model: string, variant?: string, modality?: string) {
  return `${provider}|${model}|${modality || ""}|${variant || ""}`;
}

// 캐시 폭주 방지
function setBillingKeyCache(k: string, v: BillingKeyLikeType | BillingCostKeyLikeType) {
  if (billingKeyCache.size >= BILLING_KEY_CACHE_MAX) billingKeyCache.clear();
  billingKeyCache.set(k, v);
}

// provider/model 입력으로 billing baseKey를 안전하게 정규화
function normalizeBillingBase(provider: string, model: string) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const raw = String(model || "").trim();
  if (!p || !raw) return "";

  // modelName은 순수 모델명만. base는 항상 "provider:model"
  return `${p}:${raw}`;
}

// billingKey / usage / fixed 기준 필요한 코인 수 계산
// - 토큰형: input, output 각각 Math.ceil(토큰 / (코인당 토큰수))의 합
// - 고정형: 버퍼 포함 금액(원)과 코인 1:1 매칭 (1원 === 1코인)
export function calcCoinsWithPricingMaps({
  billingKey,
  usage,
  fixed,
  tokenMap,
  fixedMap,
}: ICalcParams & {
  tokenMap?: TokenPricingMapType;
  fixedMap?: FixedPricingMapType;
}) {
  const resolvedTokenMap = tokenMap || (TOKENS_PER_COIN as unknown as TokenPricingMapType);
  const resolvedFixedMap = fixedMap || (FIXED_COSTS as unknown as FixedPricingMapType);
  let coins = 0;
  let tokenCoins = 0;
  let fixedCoins = 0;
  let fixedImageCoins = 0;
  const breakdown: CoinBreakdownType = {};

  const baseKey = String(billingKey);

  // 모달리티별 요금키 정확히 찾기 위한 헬퍼
  const resolveModalityKey = (key: string, modality: AiModalityType) => {
    const parts = key.split(":");
    const last = parts[parts.length - 1];
    const isModalityKey = last === "text" || last === "audio" || last === "image" || last === "video";

      if (isModalityKey) {
        parts[parts.length - 1] = modality;
        const swapped = parts.join(":");
      if (resolvedTokenMap[swapped]) return swapped;

      const base = parts.slice(0, -1).join(":");
      if (resolvedTokenMap[base]) return base;
    } else {
      const appended = `${key}:${modality}`;
      if (resolvedTokenMap[appended]) return appended;

      if (resolvedTokenMap[key]) return key;
    }
    return key;
  };

  // 고정과금 키 탐색 (모달리티 꼬리표 제거 시도)
  const resolveFixedKey = (key: string) => {
    let f = resolvedFixedMap[key];
    if (f) return f;
    const parts = key.split(":");
    const last = parts[parts.length - 1];
    if (last === "text" || last === "audio" || last === "image" || last === "video") {
      const base = parts.slice(0, -1).join(":");
      f = resolvedFixedMap[base];
      if (f) return f;
    }
    return undefined;
  };

  // 1) 토큰형
  if (usage) {
    const normalizedUsage = usage as TokenUsageWithLegacyRoot;
    const rates = resolvedTokenMap[baseKey];
    const sumFor = (modality: AiModalityType) => {
      const u = normalizedUsage[modality] || {};
      const inp = Math.max(0, Number(u.input || 0));
      const out = Math.max(0, Number(u.output || 0));

      // 모달리티에 맞는 key를 정확히 선택
      const modalityKey = resolveModalityKey(billingKey, modality);
      const modRates = resolvedTokenMap[modalityKey] || rates;
      if (!modRates) {
        breakdown[modality] = { input: inp, output: out, inCoins: 0, outCoins: 0, modalityKey, warn: "UNKNOWN_RATE" };
        return 0;
      }

      const inCoins = modRates?.input ? Math.ceil(inp / modRates.input) : 0;
      const outCoins = modRates?.output ? Math.ceil(out / modRates.output) : 0;

      breakdown[modality] = { input: inp, output: out, inCoins, outCoins, modalityKey };
      return inCoins + outCoins;
    };

    const hasAny = AI_MODALITY_TYPES.some((k) => normalizedUsage[k]);
    if (hasAny) {
      if (normalizedUsage.text) tokenCoins += sumFor("text");
      if (normalizedUsage.audio) tokenCoins += sumFor("audio");
      if (normalizedUsage.image) tokenCoins += sumFor("image");
      if (normalizedUsage.video) tokenCoins += sumFor("video");
    } else {
      // text 전용 구조 (input/output 루트)
      const inp = Math.max(0, Number(normalizedUsage.input || 0));
      const out = Math.max(0, Number(normalizedUsage.output || 0));
      const inCoins = rates?.input ? Math.ceil(inp / rates.input) : 0;
      const outCoins = rates?.output ? Math.ceil(out / rates.output) : 0;
      tokenCoins += inCoins + outCoins;
      breakdown.text = { input: inp, output: out, inCoins, outCoins, modalityKey: billingKey };
    }
  }

  // 2) 고정형
  if (fixed) {
    // 모달리티 꼬리표가 붙어도 FIXED_COSTS를 찾도록 보완
    const fixedRate = resolveFixedKey(billingKey);
    if (fixedRate) {
      if (fixed.seconds && fixedRate.perSecond) {
        const c = Math.ceil(fixed.seconds) * fixedRate.perSecond;
        fixedCoins += c;
        breakdown.fixedSeconds = { seconds: fixed.seconds, perSecond: fixedRate.perSecond, coins: c };
      }
      if (fixed.minutes && fixedRate.perMinute) {
        const c = Math.ceil(fixed.minutes) * fixedRate.perMinute;
        fixedCoins += c;
        breakdown.fixedMinutes = { minutes: fixed.minutes, perMinute: fixedRate.perMinute, coins: c };
      }
      if (fixed.images && fixedRate.perImage) {
        const c = Math.ceil(fixed.images) * fixedRate.perImage;
        fixedCoins += c;
        fixedImageCoins += c;
        breakdown.fixedImages = { images: fixed.images, perImage: fixedRate.perImage, coins: c };
      }
      if (fixed.videos && fixedRate.perVideo) {
        const c = Math.ceil(fixed.videos) * fixedRate.perVideo;
        fixedCoins += c;
        breakdown.fixedVideos = { videos: fixed.videos, perVideo: fixedRate.perVideo, coins: c };
      }
      // EL-203 — 문자 과금. 나눗셈을 마지막에 한 번만 수행해 1,000자 미만에서 0코인으로 떨어지지 않게 한다.
      if (fixed.characters && fixedRate.perThousandCharacters) {
        const characters = Math.ceil(fixed.characters);
        const c = Math.ceil((characters * fixedRate.perThousandCharacters) / 1000);
        fixedCoins += c;
        breakdown.fixedCharacters = {
          characters,
          perThousandCharacters: fixedRate.perThousandCharacters,
          coins: c,
        };
      }
      if (fixed.credits && fixedRate.perCredit) {
        const c = Math.ceil(fixed.credits) * fixedRate.perCredit;
        fixedCoins += c;
        breakdown.fixedCredits = { credits: fixed.credits, perCredit: fixedRate.perCredit, coins: c };
      }
    }
  }

  if (tokenCoins > 0) breakdown.tokenSubtotal = { coins: tokenCoins };
  if (fixedCoins > 0) breakdown.fixedSubtotal = { coins: fixedCoins };

  if (tokenCoins > 0 && fixedImageCoins > 0) {
    const tokenExcessCoins = Math.max(0, tokenCoins - fixedImageCoins);
    coins += fixedCoins + tokenExcessCoins;
    breakdown.hybridMinimum = {
      policy: "fixed_minimum_plus_token_excess",
      fixedImageCoins,
      tokenCoins,
      tokenExcessCoins,
      coins,
    };
  } else {
    coins += tokenCoins + fixedCoins;
  }

  return { coins, breakdown };
}

export function calcCoins(params: ICalcParams) {
  return calcCoinsWithPricingMaps(params);
}

// 모델명 → billingKey 표준화
// - pricing.ts 파일의 모델명 연결
export function resolveBillingKeyWithPricingMaps(args: {
  provider: BillableProviderType;
  model: string;
  variant?: string;
  modality?: AiModalityType;
  tokenMap?: TokenPricingMapType;
  fixedMap?: FixedPricingMapType;
}) {
  const base = normalizeBillingBase(args.provider, args.model);
  if (!base) return base as BillingKeyLikeType | BillingCostKeyLikeType;

  const resolvedTokenMap = args.tokenMap || (TOKENS_PER_COIN as unknown as TokenPricingMapType);
  const resolvedFixedMap = args.fixedMap || (FIXED_COSTS as unknown as FixedPricingMapType);
  const billingBase =
    base === "openai:gpt-audio-1.5" &&
    resolvedTokenMap["openai:gpt-audio:text"] &&
    resolvedTokenMap["openai:gpt-audio:audio"]
      ? "openai:gpt-audio"
      : base;

  const candidates: string[] = [];
  if (args.variant && args.modality) candidates.push(`${billingBase}:${args.variant}:${args.modality}`);
  if (args.variant) candidates.push(`${billingBase}:${args.variant}`);
  if (args.modality) candidates.push(`${billingBase}:${args.modality}`);
  candidates.push(billingBase);

  for (const key of candidates) {
    if (resolvedTokenMap[key] || resolvedFixedMap[key]) return key;
  }

  return billingBase as BillingKeyLikeType | BillingCostKeyLikeType;
}

export function resolveBillingKey(
  provider: BillableProviderType,
  model: string,
  variant?: string,
  modality?: AiModalityType,
): BillingKeyLikeType | BillingCostKeyLikeType {
  const ck = getBillingKeyCacheKey(provider, model, variant, modality);
  const cached = billingKeyCache.get(ck);
  if (cached) return cached;
  const resolved = resolveBillingKeyWithPricingMaps({ provider, model, variant, modality });
  setBillingKeyCache(ck, resolved);
  return resolved;
}

// 라우트 전환 사이에도 신호를 전달하기 위한 임시 저장/소비 유틸
const STORAGE_PREFIX = "__amu_coin_updated__";
const keyOf = (p: CoinUpdatedPayload | { scope: UserScopeType; universeId?: string }) =>
  p.scope === "user" ? `${STORAGE_PREFIX}user` : `${STORAGE_PREFIX}universe:${p.universeId || ""}`;

export function persistCoinUpdated(detail: CoinUpdatedPayload) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      keyOf(detail),
      JSON.stringify({ ts: Date.now(), amount: "amount" in detail ? detail.amount : undefined }),
    );
  } catch {}
}

// 새 페이지가 마운트되면 한번만 읽고 삭제
export function consumeCoinUpdatedIfAny(
  scope: UserScopeType,
  universeId?: string,
  maxAgeMs = 60_000,
): { amount?: number } | null {
  if (typeof window === "undefined") return null;
  const key = keyOf({ scope, universeId });
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = toUnknownRecord(JSON.parse(raw));
    localStorage.removeItem(key); // 읽으면 바로 삭제
    const ts = Number(obj.ts || 0);
    if (!ts || Date.now() - ts > maxAgeMs) return null; // 오래된 신호 무시
    return { amount: typeof obj.amount === "number" ? obj.amount : undefined };
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

// provider + modelName(+modality) 기준 FIXED_COSTS에서 장당(perImage) 코인 비용 조회
// - 이미지 모델이 아니거나 perImage가 없으면 null
type FixedCostItem = {
  perSecond?: number;
  perMinute?: number;
  perImage?: number;
  perVideo?: number;
  perThousandCharacters?: number;
  perCredit?: number;
};
export function getPerImageCost(
  provider: AiProviderType,
  modelName: string,
  modality: AiModalityType = "image",
  variant?: string,
): number | null {
  // 1) provider + modelName + modality → billingKey 표준화
  const billingKey = resolveBillingKey(provider, modelName, variant, modality);

  // 2) 정확히 일치하는 키 먼저 시도
  const direct = FIXED_COSTS[billingKey as keyof typeof FIXED_COSTS] as FixedCostItem | undefined;
  if (direct?.perImage != null) {
    return direct.perImage;
  }

  // 3) 마지막 모달리티 꼬리표(:text/:audio/:image) 제거 후 재시도
  const parts = billingKey.split(":");
  const last = parts[parts.length - 1];

  if (last === "text" || last === "audio" || last === "image" || last === "video") {
    const baseKey = parts.slice(0, -1).join(":");
    const base = FIXED_COSTS[baseKey as keyof typeof FIXED_COSTS] as FixedCostItem | undefined;
    if (base?.perImage != null) {
      return base.perImage;
    }
  }

  return null;
}
