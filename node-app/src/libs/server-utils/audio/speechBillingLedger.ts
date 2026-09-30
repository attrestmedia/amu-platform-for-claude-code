import "server-only";

import { createHash } from "crypto";
import { SPEECH_BILLING_UNIT_TYPES, type SpeechBillingUnitType } from "consts/ai";
import type { BillableProviderType } from "types/ai";
import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";
import { createSpeechError } from "./guards";

/**
 * @docHint
 * @purpose EL-203 speech 견적·예약·정산·불명 결과 원장 계약(순수 로직)
 * @process 문자 수 계수  usage 레코드 검증  예약 상태 전이  정산 산출
 * @domain billing
 * @scope server
 */

// ---------------------------------------------------------------------------
// 1. 문자 계수 — provider 정의와 AMU 계수를 함께 남긴다
// ---------------------------------------------------------------------------

/**
 * ADR-EL-001 D5 — 문자는 문자로 센다. 토큰 추정으로 대체하지 않는다.
 *
 * `code_points`가 AMU 기본이다. UTF-16 code unit(String.length)은 BMP 밖 문자(이모지 등)를
 * 2로 세므로 한국어 본문에서는 같지만 이모지가 섞이면 어긋난다. 어느 정의를 provider가 쓰는지는
 * 실호출(EL-401) 전까지 확정할 수 없으므로 **두 값을 모두 기록**하고 청구 대조에 쓴다.
 */
export const SPEECH_CHARACTER_COUNT_MODES = ["code_points", "utf16_code_units"] as const;
export type SpeechCharacterCountModeType = (typeof SPEECH_CHARACTER_COUNT_MODES)[number];

export const DEFAULT_SPEECH_CHARACTER_COUNT_MODE: SpeechCharacterCountModeType = "code_points";

export type SpeechCharacterCount = {
  /** 과금 계산에 쓰는 값. mode가 가리키는 정의를 따른다. */
  counted: number;
  mode: SpeechCharacterCountModeType;
  codePoints: number;
  utf16CodeUnits: number;
  /** SSML/태그를 제거하기 전 원문 기준 값. provider가 태그를 과금하는지 미확인이라 함께 남긴다. */
  rawCodePoints: number;
  normalization: "NFC";
  ssmlStripped: boolean;
};

const SSML_TAG_PATTERN = /<[^>]*>/g;

/**
 * 문자 수를 센다.
 *
 * - 항상 NFC 정규화 후에 센다. 같은 한글이 NFD로 들어오면 자모가 분리돼 문자 수가 2~3배가 된다.
 * - `stripSsml`이 true면 태그를 제거한 본문만 센다. **provider가 태그를 과금 대상에 포함하는지는
 *   미확인이므로** rawCodePoints를 함께 남겨 실호출에서 대조한다(EL-401).
 */
export function countSpeechCharacters(
  text: string,
  options: { mode?: SpeechCharacterCountModeType; stripSsml?: boolean } = {},
): SpeechCharacterCount {
  const mode = options.mode || DEFAULT_SPEECH_CHARACTER_COUNT_MODE;
  const stripSsml = options.stripSsml === true;
  const raw = String(text ?? "").normalize("NFC");
  const body = stripSsml ? raw.replace(SSML_TAG_PATTERN, "") : raw;

  const codePoints = Array.from(body).length;
  const utf16CodeUnits = body.length;

  return {
    counted: mode === "utf16_code_units" ? utf16CodeUnits : codePoints,
    mode,
    codePoints,
    utf16CodeUnits,
    rawCodePoints: Array.from(raw).length,
    normalization: "NFC",
    ssmlStripped: stripSsml,
  };
}

// ---------------------------------------------------------------------------
// 2. usage 레코드 — quantity와 unit을 항상 함께 기록한다
// ---------------------------------------------------------------------------

export const SPEECH_USAGE_SOURCES = ["provider_reported", "amu_counted", "cache", "unknown"] as const;
export type SpeechUsageSourceType = (typeof SPEECH_USAGE_SOURCES)[number];

export type SpeechUsageRecord = {
  quantity: number;
  unit: SpeechBillingUnitType;
  usageSource: SpeechUsageSourceType;
  /** provider가 응답 헤더로 준 값. 단위를 확인한 경우에만 채운다. 문자 수로 자동 해석하지 않는다. */
  providerReportedQuantity?: number | null;
  providerReportedUnit?: SpeechBillingUnitType | null;
  /** AMU가 직접 센 값. provider 청구와 대조하기 위해 항상 함께 남긴다. */
  amuCountedQuantity?: number | null;
  audioDurationMs?: number | null;
  /** null은 미확인이고 0은 무료다. 둘을 뭉개지 않는다(ADR-EL-001 D5). */
  estimatedCost: number | null;
  actualCost: number | null;
  currency?: string | null;
  priceSnapshotId?: string | null;
  voiceRateSnapshotId?: string | null;
};

/**
 * 단위 없는 수량, 미확인 비용의 0 기록, provider 헤더의 무단 단위 해석을 거부한다.
 * fail-closed — 검증을 통과하지 못한 usage로는 과금하지 않는다.
 */
export function assertSpeechUsageRecordOrThrow(record: SpeechUsageRecord): SpeechUsageRecord {
  const quantity = Number(record?.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw createSpeechError("speech 사용량 수치가 올바르지 않습니다.", "SPEECH_PRICING_UNVERIFIED", 400);
  }
  if (!(SPEECH_BILLING_UNIT_TYPES as readonly string[]).includes(record?.unit)) {
    throw createSpeechError("speech 사용량 단위가 확인되지 않았습니다.", "SPEECH_PRICING_UNVERIFIED", 400);
  }
  if (!(SPEECH_USAGE_SOURCES as readonly string[]).includes(record?.usageSource)) {
    throw createSpeechError("speech 사용량 출처가 확인되지 않았습니다.", "SPEECH_PRICING_UNVERIFIED", 400);
  }
  if (record.providerReportedQuantity != null && !record.providerReportedUnit) {
    // 헤더 숫자만 있고 단위가 없으면 문자 수로 단정하지 않는다.
    throw createSpeechError(
      "provider가 보고한 사용량의 단위를 확인할 수 없습니다.",
      "SPEECH_PRICING_UNVERIFIED",
      400,
    );
  }
  if (record.usageSource === "unknown" && record.actualCost !== null) {
    throw createSpeechError(
      "관측되지 않은 사용량의 실비용은 null이어야 합니다.",
      "SPEECH_PRICING_UNVERIFIED",
      400,
    );
  }
  return record;
}

// ---------------------------------------------------------------------------
// 3. 예약 상태기계 (ADR-EL-001 D6)
// ---------------------------------------------------------------------------

export const SPEECH_BILLING_STATES = [
  "estimated",
  "reserved",
  "executing",
  "settled",
  "released",
  "compensated",
  "unknown_outcome",
] as const;
export type SpeechBillingStateType = (typeof SPEECH_BILLING_STATES)[number];

export const SPEECH_BILLING_TERMINAL_STATES: readonly SpeechBillingStateType[] = [
  "settled",
  "released",
  "compensated",
  "unknown_outcome",
];

/**
 * 허용 전이표.
 *
 * `unknown_outcome`에서 나가는 전이는 **없다**. 자동 재호출·자동 재청구·자동 해제를 모두 금지하며,
 * 사람이 provider 청구와 대조한 뒤 별도 운영 절차로만 정리한다(ADR-EL-001 D6).
 */
const SPEECH_BILLING_TRANSITIONS: Record<SpeechBillingStateType, readonly SpeechBillingStateType[]> = {
  estimated: ["reserved", "released"],
  reserved: ["executing", "released"],
  executing: ["settled", "compensated", "unknown_outcome"],
  settled: [],
  released: [],
  compensated: [],
  unknown_outcome: [],
};

export function canTransitionSpeechBillingState(
  from: SpeechBillingStateType,
  to: SpeechBillingStateType,
): boolean {
  return (SPEECH_BILLING_TRANSITIONS[from] || []).includes(to);
}

export function assertSpeechBillingTransitionOrThrow(
  from: SpeechBillingStateType,
  to: SpeechBillingStateType,
): SpeechBillingStateType {
  if (canTransitionSpeechBillingState(from, to)) return to;
  const errorCode = from === "unknown_outcome" ? "SPEECH_UNKNOWN_OUTCOME" : "SPEECH_BILLING_STATE_INVALID";
  throw createSpeechError(`speech 과금 상태를 ${from}에서 ${to}로 바꿀 수 없습니다.`, errorCode, 409);
}

// ---------------------------------------------------------------------------
// 4. operation key / 요청 hash — 멱등과 충돌 검증
// ---------------------------------------------------------------------------

export type SpeechOperationKind = "speech_synthesize" | "speech_transcribe";

/** 기존 audio operation key 모양을 유지한다: audio:{operation}:{sessionId}:{clientId} */
export function buildSpeechOperationId(args: {
  operation: SpeechOperationKind;
  sessionId: string;
  clientId: string;
}): string {
  const sessionId = String(args.sessionId || "").trim();
  const clientId = String(args.clientId || "").trim();
  if (!sessionId || !clientId) {
    throw createSpeechError("speech operation key에 sessionId와 clientId가 필요합니다.", "SPEECH_BILLING_CONTEXT_REQUIRED", 400);
  }
  return `audio:${args.operation}:${sessionId}:${clientId}`;
}

export type SpeechRequestHashInput = {
  operation: SpeechOperationKind;
  /** 과금 주체 — uid 또는 universeId. 둘을 섞지 않는다. */
  billingScope: "user" | "universe";
  billingSubjectId: string;
  provider: BillableProviderType;
  modelName: string;
  voiceId?: string;
  voiceRevision?: string;
  locale?: string;
  format?: string;
  speed?: number;
  settings?: Record<string, unknown> | null;
  speechIntent?: Record<string, unknown> | null;
  /** 가격 revision — 단가가 바뀌면 다른 요청이다. */
  priceSnapshotId: string;
  /** 본문 자체가 아니라 본문 해시를 넣는다. 원문을 hash 입력으로 옮겨 적지 않는다. */
  contentHash: string;
};

/**
 * hash 입력으로 허용하는 값만 통과시킨다.
 *
 * Date·Map·Set·클래스 인스턴스는 `Object.entries`가 빈 배열이라 전부 `{}`로 뭉개져
 * **서로 다른 요청이 같은 hash를 갖는다.** 같은 이유로 NaN/Infinity(→ `null`)와 함수(→ `undefined`)도 막는다.
 * hash 충돌은 잘못된 예약·캐시 재사용으로 이어지므로 조용히 넘기지 않고 거부한다.
 */
function assertHashableValue(value: unknown, path: string): void {
  if (value === null || value === undefined) return;
  const type = typeof value;
  if (type === "string" || type === "boolean") return;
  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw createSpeechError(
        `speech 요청 hash 입력이 올바르지 않습니다: ${path}는 유한한 수여야 합니다.`,
        "SPEECH_PRICING_UNVERIFIED",
        400,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertHashableValue(item, `${path}[${index}]`));
    return;
  }
  if (type === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw createSpeechError(
        `speech 요청 hash 입력이 올바르지 않습니다: ${path}는 일반 객체여야 합니다.`,
        "SPEECH_PRICING_UNVERIFIED",
        400,
      );
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      assertHashableValue(item, `${path}.${key}`);
    }
    return;
  }
  throw createSpeechError(
    `speech 요청 hash 입력이 올바르지 않습니다: ${path}(${type})는 지원하지 않는 타입입니다.`,
    "SPEECH_PRICING_UNVERIFIED",
    400,
  );
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * 요청 hash. voiceId는 **대소문자를 보존**한다(ADR-EL-001 D3).
 * speed·format·settings가 빠지면 다른 요청이 같은 hash를 갖게 되어 캐시·예약이 잘못 재사용된다(D9 SPEED_NOT_IN_KEY).
 */
export function buildSpeechRequestHash(input: SpeechRequestHashInput): string {
  assertHashableValue(input.settings ?? null, "settings");
  assertHashableValue(input.speechIntent ?? null, "speechIntent");
  assertHashableValue(typeof input.speed === "number" ? input.speed : null, "speed");
  const canonical = stableStringify({
    operation: input.operation,
    billingScope: input.billingScope,
    billingSubjectId: String(input.billingSubjectId || "").trim(),
    provider: input.provider,
    modelName: String(input.modelName || "").trim(),
    voiceId: String(input.voiceId || "").trim(),
    voiceRevision: String(input.voiceRevision || "").trim(),
    locale: String(input.locale || "").trim().toLowerCase(),
    format: String(input.format || "").trim().toLowerCase(),
    speed: typeof input.speed === "number" ? input.speed : null,
    settings: input.settings ?? null,
    speechIntent: input.speechIntent ?? null,
    priceSnapshotId: String(input.priceSnapshotId || "").trim(),
    contentHash: String(input.contentHash || "").trim(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function hashSpeechContent(text: string): string {
  return createHash("sha256").update(String(text ?? "").normalize("NFC"), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// 5. 정산 — 예약 안에서만 청구한다
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4-1. 단위 어휘 변환 — SpeechBillingUnitType ↔ IFixedUsage / FixedCost
// ---------------------------------------------------------------------------

/**
 * ADR-EL-001 D5의 과금 단위를 실제 계산 축(IFixedUsage 키 · FixedCost 단가 필드)으로 옮긴다.
 *
 * **`audio_second`(수신 오디오 길이)와 `generated_second`(생성 오디오 길이)는 서로 다른 축이다.**
 * 둘 다 `seconds`로 계산되지만 어느 쪽인지는 usage 레코드의 `unit`이 계속 보존한다.
 * 이 함수는 계산 키만 돌려주며, **기록에서 두 단위를 합치지 않는다.**
 */
export const SPEECH_UNIT_TO_FIXED_USAGE_KEY: Record<SpeechBillingUnitType, keyof IFixedUsage> = {
  character: "characters",
  audio_second: "seconds",
  generated_second: "seconds",
  credit: "credits",
};

export const SPEECH_UNIT_TO_FIXED_RATE_FIELD: Record<SpeechBillingUnitType, string> = {
  character: "perThousandCharacters",
  audio_second: "perSecond",
  generated_second: "perSecond",
  credit: "perCredit",
};

/** usage 레코드를 과금 계산용 fixed usage로 변환한다. 단위가 없으면 변환하지 않는다. */
export function toSpeechFixedUsage(record: Pick<SpeechUsageRecord, "quantity" | "unit">): IFixedUsage {
  const key = SPEECH_UNIT_TO_FIXED_USAGE_KEY[record.unit];
  if (!key) {
    throw createSpeechError("speech 사용량 단위를 과금 단위로 변환할 수 없습니다.", "SPEECH_PRICING_UNVERIFIED", 400);
  }
  return { [key]: Math.max(0, Number(record.quantity) || 0) };
}

/** D8: provider audio seconds remain the ledger unit; customer billing uses whole started minutes. */
export function toStartedMinuteFixedUsageFromAudioSeconds(audioSeconds: number): IFixedUsage {
  if (typeof audioSeconds !== "number" || !Number.isFinite(audioSeconds) || audioSeconds <= 0) {
    throw createSpeechError("started-minute 과금에 양수 audio_second usage가 필요합니다.", "SPEECH_PRICING_UNVERIFIED", 502);
  }
  return { minutes: Math.max(1, Math.ceil(audioSeconds / 60)) };
}

/** Convert the immutable ledger record only at the customer settlement boundary. */
export function toSpeechFixedUsageForModel(args: {
  provider: string;
  modelName: string;
  record: Pick<SpeechUsageRecord, "quantity" | "unit">;
}): IFixedUsage {
  if (String(args.provider || "").trim().toLowerCase() === "openai" && args.modelName === "gpt-transcribe") {
    if (args.record.unit !== "audio_second") {
      throw createSpeechError("GPT-Transcribe started-minute 정산에는 audio_second 원장 usage가 필요합니다.", "SPEECH_PRICING_UNVERIFIED", 502);
    }
    return toStartedMinuteFixedUsageFromAudioSeconds(args.record.quantity);
  }
  return toSpeechFixedUsage(args.record);
}

function readSettlementTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function hasUnexpectedPositiveTokenUsage(
  usage: ITokenUsageBreakdown,
  allowed: readonly string[],
): boolean {
  for (const modality of ["text", "audio", "image", "video"] as const) {
    for (const direction of ["input", "output"] as const) {
      if (allowed.includes(`${modality}.${direction}`)) continue;
      const value = usage[modality]?.[direction];
      if (value === undefined) continue;
      if (value !== 0) return true;
    }
  }
  return false;
}

/** D8: preserve modality-separated provider usage and reject missing/invalid billing dimensions. */
export function normalizeSpeechTokenUsageForSettlement(args: {
  provider: string;
  modelName: string;
  usage?: ITokenUsageBreakdown;
}): ITokenUsageBreakdown | undefined {
  const provider = String(args.provider || "").trim().toLowerCase();
  const modelName = String(args.modelName || "").trim();
  const isQwenAsr = provider === "qwen" && modelName === "qwen-audio-3.1-asr-flash";
  const isGptAudio = provider === "openai" && modelName === "gpt-audio-1.5";
  if (!isQwenAsr && !isGptAudio) return args.usage;

  const usage = args.usage;
  if (!usage) {
    throw createSpeechError("모델별 modality token usage가 없어 정산할 수 없습니다.", "SPEECH_PRICING_UNVERIFIED", 502);
  }

  if (isQwenAsr) {
    const input = readSettlementTokenCount(usage.audio?.input);
    const output = readSettlementTokenCount(usage.text?.output);
    if (
      input === null || input <= 0 || output === null ||
      !Number.isSafeInteger(input + output) ||
      hasUnexpectedPositiveTokenUsage(usage, ["audio.input", "text.output"])
    ) {
      throw createSpeechError("Qwen ASR input/output token usage가 없거나 올바르지 않습니다.", "SPEECH_PRICING_UNVERIFIED", 502);
    }
    return { audio: { input }, text: { output } };
  }

  const textInput = readSettlementTokenCount(usage.text?.input);
  const textOutput = readSettlementTokenCount(usage.text?.output);
  const audioInput = readSettlementTokenCount(usage.audio?.input);
  const audioOutput = readSettlementTokenCount(usage.audio?.output);
  if (
    textInput === null || textOutput === null || audioInput === null || audioOutput === null ||
    audioInput <= 0 || textInput + audioInput <= 0 || textOutput + audioOutput <= 0 ||
    !Number.isSafeInteger(textInput + audioInput) || !Number.isSafeInteger(textOutput + audioOutput) ||
    hasUnexpectedPositiveTokenUsage(usage, ["text.input", "text.output", "audio.input", "audio.output"])
  ) {
    throw createSpeechError("GPT-Audio text/audio modality token breakdown이 없거나 올바르지 않습니다.", "SPEECH_PRICING_UNVERIFIED", 502);
  }
  return { text: { input: textInput, output: textOutput }, audio: { input: audioInput, output: audioOutput } };
}

export type SpeechSettlement = {
  chargedCoins: number;
  refundedCoins: number;
  state: SpeechBillingStateType;
  /** 실제 사용량이 예약을 넘었을 때. 초과분은 청구하지 않고 표기만 한다. */
  overRunCoins: number;
};

/**
 * 예약 코인 안에서 정산한다.
 *
 * - 실제 코인이 예약보다 작으면 차액을 환불한다.
 * - 실제 코인이 예약을 **넘으면 예약액까지만 청구**하고 초과분은 `overRunCoins`로 남긴다.
 *   예약을 넘겨 추가 청구하면 사용자가 동의하지 않은 금액을 빼앗는다.
 * - 캐시 hit(예약 0, 실제 0)은 청구도 환불도 없다.
 */
export function resolveSpeechSettlement(args: {
  reservedCoins: number;
  actualCoins: number;
}): SpeechSettlement {
  const reserved = Math.max(0, Math.floor(Number(args.reservedCoins) || 0));
  const actual = Math.max(0, Math.floor(Number(args.actualCoins) || 0));
  const charged = Math.min(reserved, actual);
  return {
    chargedCoins: charged,
    refundedCoins: Math.max(0, reserved - charged),
    overRunCoins: Math.max(0, actual - reserved),
    state: "settled",
  };
}

/**
 * provider가 **확실히 실행하지 않은** 실패(요청 검증 400 등). 예약을 전액 해제한다.
 * 실행 여부가 조금이라도 불확실하면 이 함수를 쓰지 말고 resolveSpeechUnknownOutcome을 쓴다.
 */
export function resolveSpeechRelease(args: { reservedCoins: number }): SpeechSettlement {
  const reserved = Math.max(0, Math.floor(Number(args.reservedCoins) || 0));
  return { chargedCoins: 0, refundedCoins: reserved, overRunCoins: 0, state: "released" };
}

/**
 * provider는 실행됐으나 이후 단계(R2 저장·DB 기록)가 실패해 결과를 제공하지 못한 경우.
 * provider 원가는 발생했으므로 사용자 청구를 되돌리되(보상) 원가 기록은 usage 레코드에 남긴다.
 */
export function resolveSpeechCompensation(args: { reservedCoins: number }): SpeechSettlement {
  const reserved = Math.max(0, Math.floor(Number(args.reservedCoins) || 0));
  return { chargedCoins: 0, refundedCoins: reserved, overRunCoins: 0, state: "compensated" };
}

/**
 * provider 처리 여부를 알 수 없는 종료(timeout·worker kill·연결 종단).
 * 예약을 해제하지 않고 unknown_outcome으로 남긴다. 자동 재시도·자동 fallback을 하지 않는다.
 */
export function resolveSpeechUnknownOutcome(): SpeechSettlement {
  // 예약은 그대로 둔다 — 해제(released)도 청구(settled)도 하지 않는다.
  return { chargedCoins: 0, refundedCoins: 0, overRunCoins: 0, state: "unknown_outcome" };
}
