import {
  chargeAIUsage,
  chargeAIUsageForUniverse,
  previewAIUsageCharge,
  previewAIUsageChargeForUniverse,
  refundAIUsage,
} from "./coinBillingService";
import type { AIUsageChargePreviewResult, ChargeAIUsageForUniverseParams, ChargeAIUsageParams } from "./coinBillingService";
import { getSystemPricingMaps, previewSystemPricingQuote } from "libs/server-utils/api/systemPricingControl";
import { resolveBillingKeyWithPricingMaps } from "utils/payment/coinUtils";
import type { AiModalityType, BillableProviderType } from "types/ai";
import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";
import { recordAiCostObservation } from "libs/server-utils/ai/aiCostObservationService";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain billing_preflight
 * @scope server_global
 */

type BillingServiceError = Error & { errorCode?: string; status?: number; detail?: unknown };

const hasOwn = (obj: object, k: string) => Object.prototype.hasOwnProperty.call(obj, k);

// 잘못된 모델 포맷이면 에러 발생
function throwInvalidModelFormat(modelNameRaw: string) {
  const err = new Error("invalid_model_format") as BillingServiceError;
  err.errorCode = "INVALID_MODEL_FORMAT";
  err.status = 400;
  err.detail = { modelName: modelNameRaw };
  throw err;
}

// modelName 누락이면 400으로 fail-closed
function throwModelRequired(modelNameRaw: string) {
  const err = new Error("model_required") as BillingServiceError;
  err.errorCode = "MODEL_REQUIRED";
  err.status = 400;
  err.detail = { modelName: modelNameRaw };
  throw err;
}

// modelName은 "순수 모델명"만 허용
function canonicalizeModelName(provider: BillableProviderType, modelName: string) {
  const raw = String(modelName ?? "").trim();
  if (!raw) throwModelRequired(String(modelName ?? ""));

  // modelName에 ":" 금지 (provider/model 분리는 파라미터로만)
  if (raw.includes(":")) throwInvalidModelFormat(raw);
  return raw;
}

function throwPricingMissing(detail: unknown) {
  const err = new Error("pricing_not_found") as BillingServiceError;
  err.errorCode = "PRICING_NOT_FOUND";
  err.status = 503;
  err.detail = detail;
  throw err;
}

function anyKeyExists(map: Record<string, unknown>, keys: Iterable<string>) {
  for (const k of keys) if (k && hasOwn(map, k)) return k;
  return "";
}

function stripTrailingModality(k: string) {
  const parts = String(k).split(":");
  const last = parts[parts.length - 1];
  if (last === "text" || last === "audio" || last === "image" || last === "video") return parts.slice(0, -1).join(":");
  return "";
}

async function assertPricingConfigured(params: {
  provider: BillableProviderType;
  modelName: string;
  variant?: string;
  modality?: AiModalityType;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}) {
  const { provider, modelName, variant, modality, usage, fixed } = params;
  const pricingMaps = await getSystemPricingMaps();

  // 안전장치: 둘 다 없으면 애초에 과금 의미가 없음
  if (!usage && !fixed) {
    throwPricingMissing({ kind: "none", provider, modelName, variant, modality });
  }

  // token(usage)
  if (usage) {
    const mods = new Set<AiModalityType>();
    if (usage?.text) mods.add("text");
    if (usage?.audio) mods.add("audio");
    if (usage?.image) mods.add("image");
    if (mods.size === 0) mods.add(modality || "text");

    for (const m of mods) {
      const candidates = new Set<string>([
        resolveBillingKeyWithPricingMaps({
          provider,
          model: modelName,
          variant,
          modality: m,
          tokenMap: pricingMaps.tokenMap,
          fixedMap: pricingMaps.fixedMap,
        }),
        resolveBillingKeyWithPricingMaps({
          provider,
          model: modelName,
          modality: m,
          tokenMap: pricingMaps.tokenMap,
          fixedMap: pricingMaps.fixedMap,
        }),
        resolveBillingKeyWithPricingMaps({
          provider,
          model: modelName,
          variant,
          tokenMap: pricingMaps.tokenMap,
          fixedMap: pricingMaps.fixedMap,
        }),
        resolveBillingKeyWithPricingMaps({
          provider,
          model: modelName,
          tokenMap: pricingMaps.tokenMap,
          fixedMap: pricingMaps.fixedMap,
        }),
      ]);

      const hit = anyKeyExists(pricingMaps.tokenMap, candidates);
      if (!hit) {
        throwPricingMissing({
          kind: "token",
          provider,
          modelName,
          variant,
          modality: m,
          tried: Array.from(candidates),
        });
      }
    }
  }

  // fixed
  if (fixed) {
    const candidates = new Set<string>([
      resolveBillingKeyWithPricingMaps({
        provider,
        model: modelName,
        variant,
        modality,
        tokenMap: pricingMaps.tokenMap,
        fixedMap: pricingMaps.fixedMap,
      }),
      resolveBillingKeyWithPricingMaps({
        provider,
        model: modelName,
        modality,
        tokenMap: pricingMaps.tokenMap,
        fixedMap: pricingMaps.fixedMap,
      }),
      resolveBillingKeyWithPricingMaps({
        provider,
        model: modelName,
        variant,
        tokenMap: pricingMaps.tokenMap,
        fixedMap: pricingMaps.fixedMap,
      }),
      resolveBillingKeyWithPricingMaps({
        provider,
        model: modelName,
        tokenMap: pricingMaps.tokenMap,
        fixedMap: pricingMaps.fixedMap,
      }),
    ]);

    // trailing modality strip도 후보에 추가
    for (const k of Array.from(candidates)) {
      const stripped = stripTrailingModality(k);
      if (stripped) candidates.add(stripped);
    }

    const hit = anyKeyExists(pricingMaps.fixedMap, candidates);
    if (!hit) {
      throwPricingMissing({
        kind: "fixed",
        provider,
        modelName,
        variant,
        modality: modality || "image",
        tried: Array.from(candidates),
      });
    }

    // EL-203 — 키 존재만으로 통과시키지 않는다.
    // 요청한 단위의 단가 필드가 없으면 calcCoins가 0코인을 돌려주고 외부 유료 호출이 무과금으로 나간다.
    const rate = pricingMaps.fixedMap[hit] as Record<string, unknown> | undefined;
    for (const requiredRateField of resolveRequiredFixedRateFields(fixed)) {
      if (typeof rate?.[requiredRateField] !== "number") {
        throwPricingMissing({
          kind: "fixed",
          provider,
          modelName,
          variant,
          modality: modality || "image",
          billingKey: hit,
          missingRateField: requiredRateField,
        });
      }
    }
  }
}

/**
 * fixed usage가 실제로 요구하는 단가 필드 전부.
 * 단위가 여러 개면 **모두** 검증한다. 하나라도 건너뛰면 그 단위가 0코인으로 새어 나간다.
 */
function resolveRequiredFixedRateFields(fixed: IFixedUsage): string[] {
  const present: string[] = [];
  if (fixed.seconds) present.push("perSecond");
  if (fixed.minutes) present.push("perMinute");
  if (fixed.images) present.push("perImage");
  if (fixed.videos) present.push("perVideo");
  if (fixed.characters) present.push("perThousandCharacters");
  if (fixed.credits) present.push("perCredit");
  return present;
}

function dummyTokenUsageByModality(modality: AiModalityType) {
  // ✅ (중요) preflight가 항상 text만 검사해버리는 버그 방지
  if (modality === "audio") return { audio: { input: 1, output: 1 } };
  if (modality === "image") return { image: { input: 1, output: 1 } };
  return { text: { input: 1, output: 1 } };
}

/**
 * AI 호출 "전" 가격표 존재 여부를 미리 검증 (provider 호출 전에 fail-closed)
 * - token 과금: modality에 맞는 usage 더미로 assertPricingConfigured 통과 여부 체크
 * - fixed 과금: fixed 더미로 체크
 * - variants가 있으면 variants 각각에 대해 모두 통과해야 함 (pro short/long 안전)
 */
export async function assertPricingPreflightOrThrow(args: {
  provider: BillableProviderType;
  modelName: string;
  modality: AiModalityType;
  kind: "token" | "fixed";
  variants?: (string | undefined)[];
  /**
   * EL-203 — 실제로 청구할 fixed 단위들. 주면 각 단위의 단가 필드까지 검증한다.
   * 생략하면 기존 동작(modality 기본 더미로 키 존재만 확인)을 유지한다.
   */
  fixedUnits?: (keyof IFixedUsage)[];
}) {
  const model = canonicalizeModelName(args.provider, args.modelName);
  const variants = args.variants?.length ? args.variants : [undefined];
  // 단위를 못 받았을 때 audio 요청에 perImage 더미를 쓰면 엉뚱한 단가를 검증한다.
  const fallbackDummy: IFixedUsage = args.modality === "audio" ? { seconds: 1 } : { images: 1 };
  const fixedDummy: IFixedUsage = args.fixedUnits?.length
    ? Object.fromEntries(args.fixedUnits.map((unit) => [unit, 1]))
    : fallbackDummy;

  for (const v of variants) {
    await assertPricingConfigured({
      provider: args.provider,
      modelName: model ?? "",
      variant: v,
      modality: args.modality,
      usage: args.kind === "token" ? dummyTokenUsageByModality(args.modality) : undefined,
      fixed: args.kind === "fixed" ? fixedDummy : undefined,
    });
  }
}

function throwBalancePreflightFailed(result: Extract<AIUsageChargePreviewResult, { ok: false }>) {
  const err = new Error(result.message || "코인 사전 검증 실패") as BillingServiceError;
  err.errorCode = result.errorCode || "BILLING_PREFLIGHT_FAILED";
  err.status = result.errorCode === "COIN_INSUFFICIENT" ? 402 : 400;
  err.detail = result;
  throw err;
}

export async function assertAIUsageBalanceOrThrow(params: ChargeAIUsageParams & { skipWhenNoUid?: boolean }) {
  const { skipWhenNoUid, ...rest } = params;

  const cleanModelName = canonicalizeModelName(rest.provider, rest.modelName);
  rest.modelName = cleanModelName ?? "";

  await assertPricingConfigured({
    provider: rest.provider,
    modelName: rest.modelName,
    variant: rest.variant,
    modality: rest.modality,
    usage: rest.usage,
    fixed: rest.fixed,
  });

  const uidStr = String(rest.uid || "");
  if (skipWhenNoUid && (!uidStr || uidStr.startsWith("guest:"))) {
    return { ok: true, coins: 0 };
  }

  const result = await previewAIUsageCharge(rest);
  if (!result.ok) throwBalancePreflightFailed(result);
  return result;
}

export async function assertCommerceAIUsageBalanceOrThrow(params: ChargeAIUsageForUniverseParams) {
  const cleanModelName = canonicalizeModelName(params.provider, params.modelName);
  params.modelName = cleanModelName ?? "";

  await assertPricingConfigured({
    provider: params.provider,
    modelName: params.modelName,
    variant: params.variant,
    modality: params.modality,
    usage: params.usage,
    fixed: params.fixed,
  });

  const result = await previewAIUsageChargeForUniverse(params);
  if (!result.ok) throwBalancePreflightFailed(result);
  return result;
}

// AI 사용량 코인 청구 공통 함수
export async function billAIUsageOrThrow(params: ChargeAIUsageParams & { skipWhenNoUid?: boolean }) {
  const { skipWhenNoUid, ...rest } = params;

  // 모델/과금 검증
  const cleanModelName = canonicalizeModelName(rest.provider, rest.modelName);
  rest.modelName = cleanModelName ?? "";

  await assertPricingConfigured({
    provider: rest.provider,
    modelName: rest.modelName,
    variant: rest.variant,
    modality: rest.modality,
    usage: rest.usage,
    fixed: rest.fixed,
  });

  // 게스트/비로그인 사용자는 청구 스킵
  const uidStr = String(rest.uid || "");
  if (skipWhenNoUid && (!uidStr || uidStr.startsWith("guest:"))) {
    return { ok: true, coins: 0 };
  }

  let result: Awaited<ReturnType<typeof chargeAIUsage>>;
  try {
    result = await chargeAIUsage(rest);
  } catch (error) {
    await recordAiCostObservation({
      provider: rest.provider,
      modelName: rest.modelName,
      modality: rest.modality,
      variant: rest.variant,
      usage: rest.usage,
      fixed: rest.fixed,
      meta: rest.meta,
      result: {
        ok: false,
        errorCode: String((error as { errorCode?: unknown })?.errorCode || "BILLING_EXCEPTION"),
      },
    });
    throw error;
  }

  await recordAiCostObservation({
    provider: rest.provider,
    modelName: rest.modelName,
    modality: rest.modality,
    variant: rest.variant,
    usage: rest.usage,
    fixed: rest.fixed,
    meta: rest.meta,
    result,
  });

  if (!result.ok) {
    const err = new Error(result.message || "코인 차감 실패") as BillingServiceError;
    err.errorCode = result.errorCode || "BILLING_FAILED";
    throw err;
  }
  return result;
}

// 환불(보상 트랜잭션) - 실패 시 throw
export async function refundAIUsageOrThrow(params: ChargeAIUsageParams & { coins: number; skipWhenNoUid?: boolean }) {
  const { skipWhenNoUid, ...rest } = params;

  const uidStr = String(rest.uid || "");
  if (skipWhenNoUid && (!uidStr || uidStr.startsWith("guest:"))) {
    return { ok: true, coins: 0 };
  }

  // 모델명 정규화
  const cleanModelName = canonicalizeModelName(rest.provider, rest.modelName);
  rest.modelName = cleanModelName ?? "";

  const result = await refundAIUsage(rest);
  if (!result.ok) {
    const err = new Error(result.message || "환불 실패") as BillingServiceError;
    err.errorCode = result.errorCode || "REFUND_FAILED";
    throw err;
  }
  return result;
}

// 커머스(유니버스) 지갑에서 청구
export async function billCommerceAIUsageOrThrow(params: Omit<ChargeAIUsageParams, "uid"> & { universeId: string }) {
  const { universeId, ...rest } = params;

  // 모델/과금 검증
  const cleanModelName = canonicalizeModelName(rest.provider, rest.modelName);
  rest.modelName = cleanModelName ?? "";

  await assertPricingConfigured({
    provider: rest.provider,
    modelName: rest.modelName,
    variant: rest.variant,
    modality: rest.modality,
    usage: rest.usage,
    fixed: rest.fixed,
  });

  let result: Awaited<ReturnType<typeof chargeAIUsageForUniverse>>;
  try {
    result = await chargeAIUsageForUniverse({ universeId, ...rest });
  } catch (error) {
    await recordAiCostObservation({
      provider: rest.provider,
      modelName: rest.modelName,
      modality: rest.modality,
      variant: rest.variant,
      usage: rest.usage,
      fixed: rest.fixed,
      meta: rest.meta,
      result: {
        ok: false,
        errorCode: String((error as { errorCode?: unknown })?.errorCode || "BILLING_EXCEPTION"),
      },
    });
    throw error;
  }

  await recordAiCostObservation({
    provider: rest.provider,
    modelName: rest.modelName,
    modality: rest.modality,
    variant: rest.variant,
    usage: rest.usage,
    fixed: rest.fixed,
    meta: rest.meta,
    result,
  });

  if (!result.ok) {
    const err = new Error(result.message || "커머스 코인 차감 실패") as BillingServiceError;
    err.errorCode = result.errorCode || "BILLING_FAILED";
    throw err;
  }
  return result;
}

export async function previewAIUsagePricing(args: {
  provider: BillableProviderType;
  modelName: string;
  modality: AiModalityType;
  variant?: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}) {
  const modelName = canonicalizeModelName(args.provider, args.modelName);
  return await previewSystemPricingQuote({
    provider: args.provider,
    modelName,
    modality: args.modality,
    variant: args.variant,
    usage: args.usage,
    fixed: args.fixed,
  });
}
