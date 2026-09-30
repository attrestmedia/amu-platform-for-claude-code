import type { AiProviderType } from "types/ai";
import type { BillingKeyLikeType, ITokenUsageBreakdown } from "types/payment";
import { resolveMediaBillingStrategy, type MediaBillingStrategyType } from "utils/payment";
import {
  calcCoinsWithPricingMaps,
  resolveBillingKeyWithPricingMaps,
  type FixedPricingMapType,
  type TokenPricingMapType,
} from "utils/payment/coinUtils";
import { resolveImageGenOptions } from "./imageOptions";

/**
 * @docHint
 * @purpose 이미지 생성 요청의 예상 코인을 과금과 같은 공식으로 산출
 * @process 과금 전략 판정  usage 추정  billingKey 해석  calcCoins 재사용
 * @domain ai
 * @scope shared
 */

/**
 * 생성 전에는 provider가 실제 토큰 사용량을 알려주지 않으므로 추정치를 쓴다.
 * 이 상수는 라우터의 가격 상한 판정과 파이프라인의 잔액 preflight가 **같은 값**을 써야 하므로
 * 어느 한쪽에 인라인으로 두지 않는다. 값을 바꾸면 두 경로가 함께 바뀐다.
 */
export const IMAGE_ESTIMATE_PROMPT_CHARS_PER_TOKEN = 3;
export const IMAGE_ESTIMATE_TOKENS_PER_IMAGE = 4096;

export type ImageGenerationUsageEstimateInputType = {
  promptChars: number;
  /** 요청에 첨부된 입력 이미지 수 (모델 이미지 + 참고 이미지) */
  inputImageCount: number;
  /** 생성 요청 장수 */
  outputImageCount: number;
};

export type ImageGenerationCoinEstimateType = {
  coins: number;
  billingKey: string;
  billingStrategy: MediaBillingStrategyType;
  billableImageCount: number;
  usage: ITokenUsageBreakdown | null;
};

function toSafeCount(value: unknown) {
  const parsed = Math.floor(Number(value || 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * xAI 편집은 입력 이미지와 출력 이미지를 모두 과금 단위로 센다.
 * imagePipeline의 preflight·정산과 agent-image route의 견적이 같은 정의를 쓰도록 여기서만 정의한다.
 */
export function resolveBillableImageCount(args: {
  provider: string;
  outputImageCount: number;
  inputImageCount: number;
}) {
  const output = toSafeCount(args.outputImageCount);
  const input = toSafeCount(args.inputImageCount);
  return String(args.provider || "").trim().toLowerCase() === "xai" && input > 0 ? output + input : output;
}

/** 생성 전 시점의 토큰 사용량 추정. 파이프라인 preflight와 라우터가 공유한다. */
export function estimateImageGenerationTokenUsage(
  args: ImageGenerationUsageEstimateInputType,
): ITokenUsageBreakdown {
  const promptChars = Math.max(0, Math.floor(Number(args.promptChars || 0)));
  const inputImageCount = toSafeCount(args.inputImageCount);
  const outputImageCount = toSafeCount(args.outputImageCount);
  return {
    text: {
      input: Math.max(1, Math.ceil(promptChars / IMAGE_ESTIMATE_PROMPT_CHARS_PER_TOKEN)),
      output: 0,
    },
    image: {
      input: inputImageCount * IMAGE_ESTIMATE_TOKENS_PER_IMAGE,
      output: outputImageCount * IMAGE_ESTIMATE_TOKENS_PER_IMAGE,
    },
  };
}

function hasUnknownTokenRate(breakdown: Record<string, unknown>) {
  return ["text", "audio", "image", "video"].some((modality) => {
    const row = breakdown[modality];
    return Boolean(row && typeof row === "object" && (row as { warn?: unknown }).warn === "UNKNOWN_RATE");
  });
}

/**
 * 이미지 생성 요청의 예상 코인.
 *
 * 과금과 같은 billingKey 해석과 같은 calcCoins 공식을 쓰므로
 * fixed 전용 모델뿐 아니라 hybrid(`fixed_minimum_plus_token_excess`) 모델도 실제 청구 구조를 반영한다.
 * 전략이 요구하는 요율이 가격 snapshot에 없으면 **0이 아니라 null**을 돌려준다(fail-closed).
 * 상한 판정이 요율 누락을 "무료"로 오해하지 않게 하기 위한 것이다.
 */
export function estimateImageGenerationCoins(args: {
  provider: AiProviderType;
  modelName: string;
  promptChars: number;
  inputImageCount: number;
  outputImageCount: number;
  aspectRatio?: unknown;
  size?: unknown;
  pricing: { tokenMap: TokenPricingMapType; fixedMap: FixedPricingMapType };
}): ImageGenerationCoinEstimateType | null {
  const provider = String(args.provider || "").trim().toLowerCase();
  const modelName = String(args.modelName || "").trim();
  if (!provider || !modelName) return null;

  const options = resolveImageGenOptions({
    provider: args.provider,
    modelName,
    aspectRatio: args.aspectRatio,
    size: args.size,
  });
  // 과금 variant 규칙은 imagePipeline과 동일하다 — google만 size를 variant로 쓴다.
  const variant = provider === "google" ? options.size : undefined;
  const billingStrategy = resolveMediaBillingStrategy({
    provider: args.provider,
    modelName,
    modality: "image",
    variant,
    pricing: args.pricing,
  });
  const billingKey = resolveBillingKeyWithPricingMaps({
    provider: args.provider,
    model: modelName,
    variant,
    modality: "image",
    tokenMap: args.pricing.tokenMap,
    fixedMap: args.pricing.fixedMap,
  });
  if (!billingKey) return null;

  const billsToken = billingStrategy === "token" || billingStrategy === "hybrid";
  const billsFixed = billingStrategy === "fixed" || billingStrategy === "hybrid";
  const billableImageCount = resolveBillableImageCount({
    provider,
    outputImageCount: args.outputImageCount,
    inputImageCount: args.inputImageCount,
  });
  const usage = billsToken
    ? estimateImageGenerationTokenUsage({
        promptChars: args.promptChars,
        inputImageCount: args.inputImageCount,
        outputImageCount: args.outputImageCount,
      })
    : null;

  const { coins, breakdown } = calcCoinsWithPricingMaps({
    billingKey: billingKey as BillingKeyLikeType,
    ...(usage ? { usage } : {}),
    ...(billsFixed ? { fixed: { images: billableImageCount } } : {}),
    tokenMap: args.pricing.tokenMap,
    fixedMap: args.pricing.fixedMap,
  });

  // 요율을 못 찾은 성분은 calcCoins가 0으로 계산한다. 상한 판정에서는 이것을 견적 실패로 다룬다.
  if (billsToken && hasUnknownTokenRate(breakdown as Record<string, unknown>)) return null;
  if (billsFixed && !breakdown.fixedImages) return null;
  if (!Number.isFinite(coins) || coins < 0) return null;

  return { coins, billingKey, billingStrategy, billableImageCount, usage };
}
