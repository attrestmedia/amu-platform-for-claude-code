import { SPEECH_MODEL_CATALOG, type SpeechBillingUnitType } from "./speechModel";

/**
 * @docHint
 * @purpose speech 지출 상한 판정용 정가(USD) 환산표
 * @process 모델별 단가 조회  요청 수량 → USD 환산
 * @domain speech
 * @scope shared
 *
 * EL-204-S3.
 *
 * **왜 코드에 두는가.** 이 표는 운영자가 조정하는 값이 아니라 **provider가 공시한 사실**이다
 * (rules/runtime-configurable-constants.md의 "외부 규격이 정한 값"). 조정 대상인 상한 수치는
 * DB(`speech.runtime-controls.v1`)에 있고, 이 표는 그 상한을 판정하기 위한 환산 기준일 뿐이다.
 *
 * **왜 정가인가.** Grant로 현금 지출이 0이어도 상한은 정가로 계산한다 — EL-004의
 * "Grant 만료 후 정상 정가로 성립하지 않는 기능은 애초에 열지 않는다"를 상한 자체가 지키게 하려는 것이다.
 *
 * **출처와 한계.** 2026-09-06 벤더 문서 조사값이며 AMU 실측이 아니다
 * (web-automation-project/ai-model-tracker/config/elevenlabs_documented_models.yaml).
 * 값이 없는 모델은 `null`이고, **0으로 대체하지 않는다** — 단가를 모르는 요청은 무료가 아니라 판정 불가다.
 */

export type SpeechListPrice = {
  /** 단가가 적용되는 수량 단위. 모델 카탈로그의 billingUnit과 축이 같아야 한다. */
  unit: Exclude<SpeechBillingUnitType, "credit">;
  /** unit 몇 개당 usd인지. character는 1,000자당, 초 단위는 1시간/1분당처럼 provider 표기를 그대로 옮긴다. */
  perQuantity: number;
  usd: number;
  source: string;
};

/** provider·modelName → 정가. 카탈로그에 있어도 여기 없으면 판정 불가다. */
export const SPEECH_LIST_PRICE_USD: Record<string, SpeechListPrice | null> = {
  // ElevenLabs — 벤더 가격 페이지 기준(미실측)
  "elevenlabs/eleven-flash-v2-5": { unit: "character", perQuantity: 1_000, usd: 0.05, source: "elevenlabs pricing/api 2026-09-06" },
  "elevenlabs/eleven-multilingual-v2": { unit: "character", perQuantity: 1_000, usd: 0.1, source: "elevenlabs pricing/api 2026-09-06" },
  "elevenlabs/eleven-v3": { unit: "character", perQuantity: 1_000, usd: 0.1, source: "elevenlabs pricing/api 2026-09-06" },
  "elevenlabs/scribe-v2": { unit: "audio_second", perQuantity: 3_600, usd: 0.22, source: "elevenlabs pricing/api 2026-09-06" },
  // Text-to-Dialogue는 공식 가격표에서 단가를 확인하지 못했다. null을 0으로 바꾸지 않는다.
  "elevenlabs/eleven-v3-conversational": null,
};

export function getSpeechListPrice(provider: string, modelName: string): SpeechListPrice | null {
  const key = `${String(provider || "").trim().toLowerCase()}/${String(modelName || "").trim()}`;
  return SPEECH_LIST_PRICE_USD[key] ?? null;
}

/**
 * 요청 수량을 정가 USD로 환산한다.
 *
 * 단가를 모르거나 단위 축이 어긋나면 `null`이다. **0을 돌려주지 않는다** —
 * 0은 "공짜"라는 뜻이고 상한 판정을 그냥 통과시켜 버린다.
 */
export function estimateSpeechListPriceUsd(args: {
  provider: string;
  modelName: string;
  unit: SpeechBillingUnitType;
  quantity: number;
}): number | null {
  const price = getSpeechListPrice(args.provider, args.modelName);
  if (!price) return null;
  if (price.unit !== args.unit) return null;
  const quantity = Number(args.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  return (quantity / price.perQuantity) * price.usd;
}

/** 정가를 아는 모델 목록. 카탈로그와의 누락 대조에 쓴다. */
export function listPricedSpeechModelKeys() {
  return Object.entries(SPEECH_LIST_PRICE_USD)
    .filter(([, price]) => price !== null)
    .map(([key]) => key);
}

/** 카탈로그에 있으나 정가가 없는 항목. 강제 대상 provider에서 이 목록은 곧 호출 불가를 뜻한다. */
export function listUnpricedSpeechModelKeys() {
  return SPEECH_MODEL_CATALOG.filter((policy) => !getSpeechListPrice(policy.provider, policy.modelName)).map(
    (policy) => `${policy.provider}/${policy.modelName}`,
  );
}
