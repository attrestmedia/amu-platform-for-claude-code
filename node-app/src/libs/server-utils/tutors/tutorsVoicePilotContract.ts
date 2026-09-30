import {
  ELEVENLABS_TTS_SPEED_RANGE,
  isApprovedElevenLabsVoiceId,
} from "consts/ai/voiceCatalog";

/**
 * @docHint
 * @purpose EL-603 Tutors Voice 파일럿 비노출 준비 순수 계약
 * @process 노출 deny-by-default  노출 Voice 교집합  baseline fail-closed  계측 key  preference  TUTORS-240 경계
 * @domain tutors-voice-pilot
 * @scope server
 *
 * R1은 어떤 cohort도 열지 않는다. 실제 provider 호출·계측 수집·노출은 G-EL-PILOT 해소 후 별도 승인이다.
 * 이 모듈은 DB·provider·클라이언트 저장소에 의존하지 않는 순수 판정만 담는다.
 */

export const TUTORS_VOICE_PILOT_METRIC_KEYS = [
  "voice_playback_start",
  "voice_playback_failure",
  "voice_text_only_fallback",
  "voice_latency_bucket",
] as const;

export type TutorsVoicePilotMetricKey = (typeof TUTORS_VOICE_PILOT_METRIC_KEYS)[number];

/** 파일럿 계측 기록 스위치 — R1 기본 off. 실제 수집은 G-EL-PILOT 승인 후. */
export const TUTORS_VOICE_PILOT_RECORDING_ENABLED = false;

export const TUTORS_VOICE_PILOT_EXPOSURE_REASON_CODES = [
  "not_activated",
  "cohort_disabled",
  "cohort_uid_not_allowed",
  "cohort_universe_not_allowed",
  "rollout_ratio_zero",
  "rollout_ratio_not_matched",
  "consent_version_unconfirmed",
  "allowlist_empty",
] as const;

export type TutorsVoicePilotExposureReasonCode = (typeof TUTORS_VOICE_PILOT_EXPOSURE_REASON_CODES)[number];

export const TUTORS_VOICE_PILOT_LATENCY_BUCKETS = ["lt_1s", "1s_3s", "3s_5s", "gt_5s"] as const;
export type TutorsVoicePilotLatencyBucket = (typeof TUTORS_VOICE_PILOT_LATENCY_BUCKETS)[number];

/** TUTORS-240이 소유하는 따라 읽기·발음 분석 기능. 파일럿에서 노출하지 않는다. */
export const TUTORS_PILOT_ANALYSIS_FEATURES = [
  "read_aloud",
  "pronunciation_assessment",
  "pronunciation_score",
  "raw_audio_analysis",
] as const;
export type TutorsPilotAnalysisFeature = (typeof TUTORS_PILOT_ANALYSIS_FEATURES)[number];

export type TutorsVoicePilotExposurePolicy = {
  /** 서버 기능 플래그. 기본 false. 클라이언트 값으로 열 수 없다. */
  capabilityEnabled?: boolean;
  /** 서버가 승인한 cohort uid allowlist. 기본 빈 배열(닫힘). */
  approvedCohortUids?: readonly string[];
  /** 서버가 승인한 cohort universe allowlist. uid 목록이 없을 때 쓰는 점진 노출 축. 기본 빈 배열. */
  cohortUniverseIds?: readonly string[];
  /** 서버가 승인한 롤아웃 비율(0..1). 기본 0. */
  rolloutRatio?: number;
  /** 서버가 승인한 ElevenLabs voice allowlist. 기본 빈 배열. */
  voiceAllowlist?: readonly string[];
  /** 계측 기록 스위치. 기본 false. */
  recordingEnabled?: boolean;
};

/** 운영 기본값 — 전부 닫힘. 어떤 cohort도 열지 않는다. */
export function getDefaultTutorsVoicePilotExposurePolicy(): TutorsVoicePilotExposurePolicy {
  return {
    capabilityEnabled: false,
    approvedCohortUids: [],
    rolloutRatio: 0,
    voiceAllowlist: [],
    recordingEnabled: false,
  };
}

function normalizedList(value: readonly string[] | undefined) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

/**
 * 노출 가능 Voice = 승인 ElevenLabs production 카탈로그 ∩ 서버 voiceAllowlist.
 * allowlist가 비면(기본) 결과는 항상 0개다.
 */
export function resolveExposableTutorsVoices(args: {
  voiceAllowlist?: readonly string[];
  catalog?: readonly { voiceId: string }[];
}): string[] {
  const allowlist = new Set(normalizedList(args.voiceAllowlist));
  if (allowlist.size === 0) return [];
  const catalog = args.catalog || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of catalog) {
    const voiceId = String(entry?.voiceId || "").trim();
    if (!voiceId || seen.has(voiceId)) continue;
    if (!allowlist.has(voiceId)) continue;
    // productionOnly=true는 rightsStatus=verified_commercial && usage=production을 요구한다.
    if (!isApprovedElevenLabsVoiceId(voiceId, { productionOnly: true })) continue;
    seen.add(voiceId);
    result.push(voiceId);
  }
  return result;
}

export type TutorsVoicePilotExposureDecision =
  | { exposed: true; reasonCode: "allowed"; status: 200; voices: string[] }
  | { exposed: false; reasonCode: TutorsVoicePilotExposureReasonCode; status: number };

/**
 * @deprecated uid allowlist 전용 구 노출 판정. universe cohort + ratio 버킷을 지원하는
 * `resolveTutorsVoicePilotSurface`(→ `resolveTutorsVoicePilotExposureFromConfig`)를 사용한다.
 * 기존 호출부 호환을 위해 남겨 둔다.
 */
export function resolveTutorsVoicePilotExposure(args: {
  policy: TutorsVoicePilotExposurePolicy;
  uid: unknown;
  consentVersion: unknown;
  catalog?: readonly { voiceId: string }[];
}): TutorsVoicePilotExposureDecision {
  const policy = args.policy;
  if (policy.capabilityEnabled !== true) return { exposed: false, reasonCode: "not_activated", status: 503 };

  const cohort = normalizedList(policy.approvedCohortUids);
  if (cohort.length === 0) return { exposed: false, reasonCode: "cohort_disabled", status: 403 };

  const uid = String(args.uid || "").trim();
  if (!uid || !cohort.includes(uid)) return { exposed: false, reasonCode: "cohort_uid_not_allowed", status: 403 };

  const rolloutRatio = Number(policy.rolloutRatio);
  if (!Number.isFinite(rolloutRatio) || rolloutRatio <= 0) {
    return { exposed: false, reasonCode: "rollout_ratio_zero", status: 403 };
  }

  const consentVersion = String(args.consentVersion || "").trim();
  if (!consentVersion) return { exposed: false, reasonCode: "consent_version_unconfirmed", status: 403 };

  const voices = resolveExposableTutorsVoices({
    voiceAllowlist: policy.voiceAllowlist,
    catalog: args.catalog,
  });
  if (voices.length === 0) return { exposed: false, reasonCode: "allowlist_empty", status: 403 };

  return { exposed: true, reasonCode: "allowed", status: 200, voices };
}

export type TutorsVoicePilotBaselineInput = {
  primaryMetric?: unknown;
  minDenominator?: unknown;
  mde?: unknown;
  observationWindowDays?: unknown;
  guardrails?: {
    maxFailureRate?: unknown;
    maxP95LatencyMs?: unknown;
    maxCostPerRequestUsd?: unknown;
  } | null;
};

export type TutorsVoicePilotGuardrailLimits = {
  maxFailureRate: number;
  maxP95LatencyMs: number;
  maxCostPerRequestUsd: number;
};

export type TutorsVoicePilotBaseline =
  | { status: "incomplete"; missing: string[]; failClosed: true }
  | {
      status: "ready";
      missing: [];
      failClosed: false;
      primaryMetric: string;
      minDenominator: number;
      mde: number;
      observationWindowDays: number;
      guardrails: TutorsVoicePilotGuardrailLimits;
    };

/**
 * 사전 등록 baseline 계약. primary metric·최소 분모·MDE·관측 창·guardrail 값이
 * 하나라도 없으면 `incomplete`로 fail-closed 한다(0/미설정을 통과로 보지 않는다).
 */
export function evaluateTutorsVoicePilotBaseline(input: TutorsVoicePilotBaselineInput = {}): TutorsVoicePilotBaseline {
  const missing: string[] = [];
  const primaryMetric = String(input.primaryMetric || "").trim();
  if (!primaryMetric) missing.push("primaryMetric");
  if (!(Number(input.minDenominator) > 0)) missing.push("minDenominator");
  if (!(Number(input.mde) > 0)) missing.push("mde");
  if (!(Number.isInteger(Number(input.observationWindowDays)) && Number(input.observationWindowDays) > 0)) {
    missing.push("observationWindowDays");
  }
  const guardrails = input.guardrails || {};
  if (!Number.isFinite(Number(guardrails.maxFailureRate)) || Number(guardrails.maxFailureRate) < 0) {
    missing.push("guardrails.maxFailureRate");
  }
  if (!(Number(guardrails.maxP95LatencyMs) > 0)) missing.push("guardrails.maxP95LatencyMs");
  if (!(Number(guardrails.maxCostPerRequestUsd) > 0)) missing.push("guardrails.maxCostPerRequestUsd");

  if (missing.length > 0) return { status: "incomplete", missing, failClosed: true };
  return {
    status: "ready",
    missing: [],
    failClosed: false,
    primaryMetric,
    minDenominator: Number(input.minDenominator),
    mde: Number(input.mde),
    observationWindowDays: Number(input.observationWindowDays),
    guardrails: {
      maxFailureRate: Number(guardrails.maxFailureRate),
      maxP95LatencyMs: Number(guardrails.maxP95LatencyMs),
      maxCostPerRequestUsd: Number(guardrails.maxCostPerRequestUsd),
    },
  };
}

export type TutorsVoicePilotObserved = {
  failureRate?: unknown;
  p95LatencyMs?: unknown;
  costPerRequestUsd?: unknown;
};

export type TutorsVoicePilotGuardrailResult =
  | { status: "incomplete"; breach: false; failClosed: true }
  | { status: "breach"; breach: true; failClosed: false; reasons: string[] }
  | { status: "within"; breach: false; failClosed: false; reasons: [] };

/** 지연·원가·실패 guardrail. baseline이 incomplete면 관측과 무관하게 fail-closed다. */
export function evaluateTutorsVoicePilotGuardrail(args: {
  baseline: TutorsVoicePilotBaseline;
  observed: TutorsVoicePilotObserved;
}): TutorsVoicePilotGuardrailResult {
  if (args.baseline.status !== "ready") return { status: "incomplete", breach: false, failClosed: true };
  const reasons: string[] = [];
  const failureRate = Number(args.observed.failureRate);
  const p95 = Number(args.observed.p95LatencyMs);
  const cost = Number(args.observed.costPerRequestUsd);
  if (Number.isFinite(failureRate) && failureRate > args.baseline.guardrails.maxFailureRate) {
    reasons.push("failure_rate_exceeds_guardrail");
  }
  if (Number.isFinite(p95) && p95 > args.baseline.guardrails.maxP95LatencyMs) {
    reasons.push("p95_latency_exceeds_guardrail");
  }
  if (Number.isFinite(cost) && cost > args.baseline.guardrails.maxCostPerRequestUsd) {
    reasons.push("cost_per_request_exceeds_guardrail");
  }
  return reasons.length > 0
    ? { status: "breach", breach: true, failClosed: false, reasons }
    : { status: "within", breach: false, failClosed: false, reasons: [] };
}

export function resolveTutorsVoicePilotLatencyBucket(durationMs: unknown): TutorsVoicePilotLatencyBucket {
  const value = Number(durationMs);
  if (!Number.isFinite(value) || value < 0) return "gt_5s";
  if (value < 1000) return "lt_1s";
  if (value < 3000) return "1s_3s";
  if (value < 5000) return "3s_5s";
  return "gt_5s";
}

export type TutorsVoicePilotPreference = {
  enabled: boolean;
  autoplay: boolean;
  speed: number;
};

/** 기존 uiControlStore 메모리 값을 ElevenLabs 속도 범위로 정규화한다. 새 영속화는 만들지 않는다. */
export function resolveTutorsVoicePilotPreference(raw: {
  assistantVoiceEnabled?: unknown;
  assistantVoiceAutoplay?: unknown;
  assistantVoiceSpeed?: unknown;
}): TutorsVoicePilotPreference {
  const enabled = raw.assistantVoiceEnabled === true;
  const autoplay = enabled && raw.assistantVoiceAutoplay === true;
  const speedRaw = Number(raw.assistantVoiceSpeed);
  const speed = Number.isFinite(speedRaw)
    ? Math.min(ELEVENLABS_TTS_SPEED_RANGE.max, Math.max(ELEVENLABS_TTS_SPEED_RANGE.min, Number(speedRaw.toFixed(2))))
    : 1;
  return { enabled, autoplay, speed };
}

export type TutorsVoicePilotTextOnlyFallback = {
  mode: "text_only";
  deferText: false;
  reason: string;
};

/** 음성 실패/미노출 시 텍스트 전용 동등 경로로 수렴한다. 원문 텍스트를 숨기지 않는다. */
export function resolveTutorsVoicePilotTextOnlyFallback(reason: unknown): TutorsVoicePilotTextOnlyFallback {
  return {
    mode: "text_only",
    deferText: false,
    reason: String(reason || "").trim() || "voice_unavailable",
  };
}

/** TUTORS-240 경계 — 따라 읽기·발음 분석·점수·원음 분석은 파일럿에서 노출하지 않는다. */
export function resolveTutorsPilotAnalysisExposure(feature?: unknown): {
  exposed: false;
  reasonCode: "tutors_240_gate_closed";
  feature: string;
} {
  const requested = String(feature || "").trim();
  const known = (TUTORS_PILOT_ANALYSIS_FEATURES as readonly string[]).includes(requested)
    ? requested
    : "unknown";
  return { exposed: false, reasonCode: "tutors_240_gate_closed", feature: known };
}

export function isTutorsPilotAnalysisFeatureAllowed(_feature?: unknown): boolean {
  return false;
}

/* ---------------------------------------------------------------------------
 * EL-P6-ACTIVATION Stream B — 서버 설정 기반 파일럿 노출 wiring
 *
 * PILOT-VALUES.md 권장값을 서버 설정(시스템 세팅 키)에서 읽는다. 값·동의 증거가
 * 미비하거나 조회에 실패하면 default deny(fail-closed)다. 실제 노출은 사용자 게이트 후.
 * ------------------------------------------------------------------------- */

export const TUTORS_VOICE_PILOT_SETTING_KEY = "tutors.voice-pilot.v1";

export type TutorsVoicePilotConfig = {
  capabilityEnabled?: boolean;
  pilotCohortEnabled?: boolean;
  rolloutRatio?: number;
  cohortUniverseIds?: readonly string[];
  cohortUids?: readonly string[];
  voiceAllowlist?: readonly string[];
  ttsModel?: string;
  recordingEnabled?: boolean;
  /** 계측 key 기록 스위치. runtime-config로 승격한다. 기본 false. */
  metricsRecordingEnabled?: boolean;
  baseline?: {
    primaryMetric?: unknown;
    minDenominator?: unknown;
    mde?: unknown;
    observationWindowDays?: unknown;
    guardrails?: {
      maxFailureRate?: unknown;
      maxP95LatencyMs?: unknown;
      maxCostPerRequestUsd?: unknown;
    } | null;
  } | null;
};

/** 운영 기본값 — 전부 닫힘. 설정이 없으면 이 값으로 deny된다. */
export const DEFAULT_TUTORS_VOICE_PILOT_CONFIG: TutorsVoicePilotConfig = {
  capabilityEnabled: false,
  pilotCohortEnabled: false,
  rolloutRatio: 0,
  cohortUniverseIds: [],
  cohortUids: [],
  voiceAllowlist: [],
  ttsModel: "",
  recordingEnabled: false,
  metricsRecordingEnabled: false,
  baseline: null,
};

function clampRatio(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(1, num);
}

/** 저장값은 신뢰하지 않는다. ratio는 0..1로 클램프하고 목록은 trim·dedupe한다. */
export function normalizeTutorsVoicePilotConfig(
  stored?: Partial<TutorsVoicePilotConfig> | null,
): TutorsVoicePilotConfig {
  return {
    capabilityEnabled: stored?.capabilityEnabled === true,
    pilotCohortEnabled: stored?.pilotCohortEnabled === true,
    rolloutRatio: clampRatio(stored?.rolloutRatio),
    cohortUniverseIds: Array.from(new Set(normalizedList(stored?.cohortUniverseIds))),
    cohortUids: Array.from(new Set(normalizedList(stored?.cohortUids))),
    voiceAllowlist: Array.from(new Set(normalizedList(stored?.voiceAllowlist))),
    ttsModel: String(stored?.ttsModel || "").trim().slice(0, 120),
    // 녹음(이용자 음성)은 파일럿에서도 열지 않는다. 저장값이 true여도 false로 고정한다.
    recordingEnabled: false,
    metricsRecordingEnabled: stored?.metricsRecordingEnabled === true,
    baseline: stored?.baseline ?? null,
  };
}

/** 설정 → 노출 정책. 설정이 없으면 닫힌 정책을 돌려준다. */
export function resolveTutorsVoicePilotPolicyFromConfig(
  config?: TutorsVoicePilotConfig | null,
): TutorsVoicePilotExposurePolicy {
  const normalized = normalizeTutorsVoicePilotConfig(config ?? DEFAULT_TUTORS_VOICE_PILOT_CONFIG);
  return {
    capabilityEnabled: normalized.capabilityEnabled,
    approvedCohortUids: normalized.cohortUids,
    cohortUniverseIds: normalized.cohortUniverseIds,
    rolloutRatio: normalized.rolloutRatio,
    voiceAllowlist: normalized.voiceAllowlist,
    recordingEnabled: false,
  };
}

/** uid의 결정적 0..99 버킷. ratio 기반 점진 노출에 쓴다(uid 목록 저장소 미도입). */
export function resolveTutorsVoicePilotRatioBucket(uid: unknown): number {
  const text = String(uid || "").trim();
  if (!text) return 100;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

export type TutorsVoicePilotRuntimePolicy = {
  recordingEnabled: false;
  metricsRecordingEnabled: boolean;
  ttsModel: string;
  exposableVoices: string[];
};

/** 설정 기반 런타임 정책. 녹음은 항상 off, 계측은 설정 스위치. */
export function resolveTutorsVoicePilotRuntimePolicy(
  config?: TutorsVoicePilotConfig | null,
  catalog?: readonly { voiceId: string }[],
): TutorsVoicePilotRuntimePolicy {
  const normalized = normalizeTutorsVoicePilotConfig(config ?? DEFAULT_TUTORS_VOICE_PILOT_CONFIG);
  return {
    recordingEnabled: false,
    metricsRecordingEnabled: normalized.metricsRecordingEnabled === true,
    ttsModel: String(normalized.ttsModel || ""),
    exposableVoices: resolveExposableTutorsVoices({
      voiceAllowlist: normalized.voiceAllowlist,
      catalog,
    }),
  };
}

export function isTutorsVoicePilotMetricsRecordingEnabled(config?: TutorsVoicePilotConfig | null): boolean {
  return normalizeTutorsVoicePilotConfig(config ?? DEFAULT_TUTORS_VOICE_PILOT_CONFIG).metricsRecordingEnabled === true;
}

/**
 * 노출 결정 + 런타임 정책을 하나의 surface로 정규화한다. 사용자 surface가 소비하는 단일 진입점이며,
 * 설정이 닫혔거나 값이 미비하면 voices는 빈 배열(default deny)이다.
 */
export type TutorsVoicePilotSurface = {
  exposed: boolean;
  reasonCode: TutorsVoicePilotExposureReasonCode | "allowed";
  voices: string[];
  recordingEnabled: false;
  metricsRecordingEnabled: boolean;
  analysisExposed: false;
};

export function resolveTutorsVoicePilotSurface(args: {
  config?: TutorsVoicePilotConfig | null;
  uid: unknown;
  universeId: unknown;
  consentVersion: unknown;
  catalog?: readonly { voiceId: string }[];
}): TutorsVoicePilotSurface {
  const decision = resolveTutorsVoicePilotExposureFromConfig(args);
  const runtime = resolveTutorsVoicePilotRuntimePolicy(args.config ?? null, args.catalog);
  return {
    exposed: decision.exposed,
    reasonCode: decision.reasonCode,
    voices: decision.exposed ? decision.voices : [],
    recordingEnabled: false,
    metricsRecordingEnabled: runtime.metricsRecordingEnabled,
    analysisExposed: false,
  };
}

/**
 * 서버 설정 기반 노출 판정. 설정/동의/allowlist 중 하나라도 없으면 deny다.
 * cohort는 uid allowlist가 있으면 uid로, 없으면 universe allowlist로 판정한다.
 */
export function resolveTutorsVoicePilotExposureFromConfig(args: {
  config?: TutorsVoicePilotConfig | null;
  uid: unknown;
  universeId: unknown;
  consentVersion: unknown;
  catalog?: readonly { voiceId: string }[];
}): TutorsVoicePilotExposureDecision {
  const config = normalizeTutorsVoicePilotConfig(args.config ?? DEFAULT_TUTORS_VOICE_PILOT_CONFIG);
  if (!config.capabilityEnabled) return { exposed: false, reasonCode: "not_activated", status: 503 };
  if (!config.pilotCohortEnabled) return { exposed: false, reasonCode: "cohort_disabled", status: 403 };

  const uids = config.cohortUids ?? [];
  const universes = config.cohortUniverseIds ?? [];
  if (uids.length === 0 && universes.length === 0) {
    return { exposed: false, reasonCode: "cohort_disabled", status: 403 };
  }

  const uid = String(args.uid || "").trim();
  const universeId = String(args.universeId || "").trim();
  if (uids.length > 0) {
    if (!uid || !uids.includes(uid)) return { exposed: false, reasonCode: "cohort_uid_not_allowed", status: 403 };
  } else if (!universeId || !universes.includes(universeId)) {
    return { exposed: false, reasonCode: "cohort_universe_not_allowed", status: 403 };
  }

  const ratio = clampRatio(config.rolloutRatio);
  if (ratio <= 0) return { exposed: false, reasonCode: "rollout_ratio_zero", status: 403 };
  if (ratio < 1 && resolveTutorsVoicePilotRatioBucket(uid || universeId) >= Math.floor(ratio * 100)) {
    return { exposed: false, reasonCode: "rollout_ratio_not_matched", status: 403 };
  }

  const consentVersion = String(args.consentVersion || "").trim();
  if (!consentVersion) return { exposed: false, reasonCode: "consent_version_unconfirmed", status: 403 };

  const voices = resolveExposableTutorsVoices({
    voiceAllowlist: config.voiceAllowlist,
    catalog: args.catalog,
  });
  if (voices.length === 0) return { exposed: false, reasonCode: "allowlist_empty", status: 403 };

  return { exposed: true, reasonCode: "allowed", status: 200, voices };
}

/** 설정 기반 baseline. 값이 미비하면 incomplete fail-closed. */
export function resolveTutorsVoicePilotBaselineFromConfig(
  config?: TutorsVoicePilotConfig | null,
): TutorsVoicePilotBaseline {
  return evaluateTutorsVoicePilotBaseline(normalizeTutorsVoicePilotConfig(
    config ?? DEFAULT_TUTORS_VOICE_PILOT_CONFIG,
  ).baseline ?? {});
}

/**
 * 서버 설정 로더. 조회 실패/미설정 시 DEFAULT(닫힘)를 돌려준다.
 * DB·프로세스 캐시에 의존하지 않도록 이 모듈에서는 순수 정규화만 하고,
 * 실제 조회는 서버 런타임에서 동적 import로 수행한다.
 */
export async function loadTutorsVoicePilotConfig(): Promise<TutorsVoicePilotConfig> {
  try {
    const [{ readSystemSetting }, { logger }] = await Promise.all([
      import("libs/database/system"),
      import("utils/log"),
    ]);
    const read = await readSystemSetting(TUTORS_VOICE_PILOT_SETTING_KEY);
    // 손상 값은 부재와 같은 닫힘 기본값으로 둔다 — 기본값 자체가 비노출이라 방향 변경 없음(INV-SSI-3).
    if (read.status === "invalid") {
      logger.error("[tutors-voice-pilot] 설정 저장값이 손상돼 닫힘 기본값을 사용합니다.", {
        valueType: read.valueType,
      });
      return normalizeTutorsVoicePilotConfig(null);
    }
    const stored = read.status === "ok" ? (read.value as Partial<TutorsVoicePilotConfig>) : null;
    return normalizeTutorsVoicePilotConfig(stored);
  } catch {
    // 설정 저장소 장애 시에도 닫힘을 유지한다(fail-closed).
    return { ...DEFAULT_TUTORS_VOICE_PILOT_CONFIG };
  }
}
