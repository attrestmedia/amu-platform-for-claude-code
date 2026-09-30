import { createTextHash } from "utils/common";
import {
  ELEVENLABS_DEFAULT_TTS_MODEL,
  isApprovedElevenLabsVoiceId,
} from "consts/ai/voiceCatalog";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS job의 순수 계약(상태·operation key·판정·기록)
 * @process 정책 판정 → 소유권/revision 고정 → job record 빌드 → 서버 재검증
 * @domain tutors-tts
 * @scope server
 *
 * DB·Redis·R2·provider에 의존하지 않는 순수 판정만 담는다. 운영 기본값은 닫힘이며,
 * 클라이언트가 보낸 text/provider/model/uid/voiceProfile/결제 주장은 승인 근거가 아니다.
 * provider 호출이 시작된 뒤의 unknown_outcome은 자동 재시도하지 않는다.
 */

export const TUTORS_ASSISTANT_TTS_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown_outcome",
] as const;

export type TutorsAssistantTtsJobStatus = (typeof TUTORS_ASSISTANT_TTS_JOB_STATUSES)[number];

/** provider 호출이 시작된 뒤 남는 상태 — 자동 재시도 금지, TTL 자동 삭제 금지. */
export const TUTORS_ASSISTANT_TTS_TERMINAL_STATUSES = ["succeeded", "failed", "cancelled"] as const;

export const TUTORS_ASSISTANT_TTS_MODES = ["playback", "autoplay"] as const;
export type TutorsAssistantTtsMode = (typeof TUTORS_ASSISTANT_TTS_MODES)[number];

export const TUTORS_ASSISTANT_TTS_ERROR_CODE = "TUTORS_ASSISTANT_TTS_GATE_CLOSED" as const;
export const TUTORS_ASSISTANT_TTS_TEXT_ONLY = "text_only" as const;

export const TUTORS_ASSISTANT_TTS_REASON_CODES = [
  "not_activated",
  "uid_unavailable",
  "unsupported_mode",
  "assistant_message_not_found",
  "assistant_message_not_owned",
  "assistant_message_contract_mismatch",
  "content_hash_missing",
  "voice_not_approved",
  "audience_not_eligible",
  "consent_version_mismatch",
  "daily_limit_disabled",
  "daily_limit_exceeded",
  "job_not_owned",
  "content_hash_mismatch",
  "budget_unavailable",
  "unsupported_status",
  "provider_not_configured",
] as const;

export type TutorsAssistantTtsReasonCode = (typeof TUTORS_ASSISTANT_TTS_REASON_CODES)[number];

export type TutorsAssistantTtsTrustedAudience = "verified_adult" | "verified_minor" | "unknown";

export type TutorsAssistantTtsJobPolicy = {
  /** 서버 기능 플래그다. 클라이언트 값으로 열 수 없다. */
  capabilityEnabled?: boolean;
  /** 서버가 승인한 provider만. 기본 빈 배열(닫힘). */
  providerAllowlist?: readonly string[];
  /** 서버가 승인한 model만. 기본 빈 배열(닫힘). */
  modelAllowlist?: readonly string[];
  /** 서버가 승인한 ElevenLabs voice만. 기본 빈 배열(닫힘). */
  voiceAllowlist?: readonly string[];
  /** 서버가 확인한 이용자 자격. 요청 필드가 아니다. */
  trustedAudienceEligibility?: TutorsAssistantTtsTrustedAudience;
  /** 서버가 시행 중인 동의 버전. */
  approvedConsentVersion?: string;
  /** 사용자별 일일 job 상한. 0은 의도적 차단, null/undefined는 미확정. */
  maxJobsPerUserPerDay?: number | null;
  /** worker lease 유지 시간(ms). */
  leaseMs?: number;
  /** terminal transport metadata 보존 상한(시간). */
  transportTtlHours?: number;
};

export const TUTORS_ASSISTANT_TTS_DEFAULT_LEASE_MS = 5 * 60 * 1000;
export const TUTORS_ASSISTANT_TTS_MAX_TRANSPORT_TTL_HOURS = 24;

/** 운영 기본값 — 전부 닫힘. 실제 provider 호출은 승인 이후에도 별도 게이트가 필요하다. */
export function getDefaultTutorsAssistantTtsJobPolicy(): TutorsAssistantTtsJobPolicy {
  return {
    capabilityEnabled: false,
    providerAllowlist: [],
    modelAllowlist: [],
    voiceAllowlist: [],
    trustedAudienceEligibility: "unknown",
    approvedConsentVersion: undefined,
    maxJobsPerUserPerDay: null,
    leaseMs: TUTORS_ASSISTANT_TTS_DEFAULT_LEASE_MS,
    transportTtlHours: TUTORS_ASSISTANT_TTS_MAX_TRANSPORT_TTL_HOURS,
  };
}

export type TutorsAssistantTtsMessageRef = {
  userId: string;
  personaId: string;
  userPersonaId?: string;
  universeId?: string;
  sessionId: string;
  assistantClientId: string;
};

export type TutorsAssistantTtsAssistantMessage = {
  role?: unknown;
  content?: unknown;
  clientId?: unknown;
  personaId?: unknown;
  sessionId?: unknown;
  userId?: unknown;
};

export type TutorsAssistantTtsVoiceSnapshot = {
  provider: "elevenlabs";
  voiceId: string;
  modelName: string;
  locale: string;
  voiceRevision: string;
  voiceFingerprint: string;
};

export type TutorsAssistantTtsJobRecord = {
  jobId: string;
  /** 인증 uid(지갑·예산 소유자). */
  uid: string;
  /** 대화 저장소 소유 키(user.ID). uid와 다를 수 있어 분리 저장한다. */
  ownerUserId: string;
  /** H5: 중복 요청 수렴 키. builder가 실제 format으로 계산해 고정한다. */
  operationKey: string;
  /** H5: 이 job의 합성 format. repo가 operationKey를 재구성할 때 하드코딩 대신 사용한다. */
  format: string;
  status: TutorsAssistantTtsJobStatus;
  attempt: number;
  lease: null;
  messageRef: TutorsAssistantTtsMessageRef;
  contentHash: string;
  voice: TutorsAssistantTtsVoiceSnapshot | null;
  stageOperationId: string;
  consentVersion: string;
  priceSnapshot: Record<string, unknown> | null;
  providerRequestId: null;
  billingRef: null;
  expiresAt: Date;
};

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizedList(value: readonly string[] | undefined) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizedText).filter(Boolean);
}

function denied(reasonCode: TutorsAssistantTtsReasonCode, status = 403) {
  return { allowed: false as const, reasonCode, status };
}

export function isTutorsAssistantTtsTerminalStatus(status: TutorsAssistantTtsJobStatus) {
  return (TUTORS_ASSISTANT_TTS_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * 상태 전이. queued→running|cancelled, running→succeeded|failed|unknown_outcome만 허용한다.
 * unknown_outcome은 나가는 전이가 없다(자동 재시도 금지).
 */
export function canTransitionTutorsAssistantTtsStatus(
  from: TutorsAssistantTtsJobStatus,
  to: TutorsAssistantTtsJobStatus,
) {
  switch (from) {
    case "queued":
      return to === "running" || to === "cancelled";
    case "running":
      return to === "succeeded" || to === "failed" || to === "unknown_outcome";
    default:
      return false;
  }
}

/** provider 호출이 시작된 작업은 자동 재시도하지 않는다. queued만 재시도 후보다. */
export function canAutoRetryTutorsAssistantTtsJob(status: TutorsAssistantTtsJobStatus) {
  return status === "queued";
}

export function resolveTutorsAssistantTtsTerminalStatus(providerCallState: unknown): TutorsAssistantTtsJobStatus | null {
  const state = normalizedText(providerCallState);
  if (state === "completed") return "succeeded";
  if (state === "not_sent") return "failed";
  if (state === "unknown_outcome") return "unknown_outcome";
  return null;
}

/**
 * worker kill/lease 상실 복구 판정. provider 호출이 시작됐을 수 있는 running job은
 * lease 만료 시 자동 재시도 대신 unknown_outcome으로 보존한다.
 */
export function resolveStaleRunningTutorsAssistantTtsStatus(args: {
  status: unknown;
  leaseExpiresAt: unknown;
  now: Date;
}): "unknown_outcome" | null {
  if (normalizedText(args.status) !== "running") return null;
  const raw = args.leaseExpiresAt;
  const expiresAt = raw instanceof Date ? raw.getTime() : new Date(String(raw || "")).getTime();
  if (!Number.isFinite(expiresAt)) return "unknown_outcome";
  return expiresAt < args.now.getTime() ? "unknown_outcome" : null;
}

export function resolveTutorsAssistantTtsLeaseMs(policy: TutorsAssistantTtsJobPolicy) {
  const leaseMs = Number(policy.leaseMs);
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) return TUTORS_ASSISTANT_TTS_DEFAULT_LEASE_MS;
  return Math.min(leaseMs, 30 * 60 * 1000);
}

export function resolveTutorsAssistantTtsTransportTtlHours(policy: TutorsAssistantTtsJobPolicy) {
  const hours = Number(policy.transportTtlHours);
  if (!Number.isFinite(hours) || hours <= 0) return TUTORS_ASSISTANT_TTS_MAX_TRANSPORT_TTL_HOURS;
  return Math.min(hours, TUTORS_ASSISTANT_TTS_MAX_TRANSPORT_TTL_HOURS);
}

export function resolveTutorsAssistantTtsContentHash(content: unknown) {
  const text = normalizedText(content);
  if (!text) return "";
  return createTextHash(text.normalize("NFC"));
}

/**
 * 동일 uid·메시지 revision·voice/settings/format은 같은 operation key로 수렴한다.
 * 원문 텍스트는 key에 넣지 않고 contentHash로만 참조한다.
 */
export function buildTutorsAssistantTtsOperationKey(args: {
  uid: unknown;
  messageRef: Partial<TutorsAssistantTtsMessageRef>;
  contentHash: unknown;
  voiceId: unknown;
  modelName: unknown;
  format: unknown;
}) {
  const uid = normalizedText(args.uid);
  const ref = args.messageRef || {};
  const contentHash = normalizedText(args.contentHash);
  const voiceId = normalizedText(args.voiceId);
  const modelName = normalizedText(args.modelName);
  const format = normalizedText(args.format) || "mp3";
  if (!uid || !contentHash || !voiceId) return "";
  return [
    uid,
    normalizedText(ref.userId),
    normalizedText(ref.personaId),
    normalizedText(ref.sessionId),
    normalizedText(ref.assistantClientId),
    contentHash,
    voiceId,
    modelName,
    format,
  ].join("|");
}

export function buildTutorsAssistantTtsOperationId(jobId: unknown) {
  const id = normalizedText(jobId);
  if (!id) return "";
  return `voice:${id}:response_tts`;
}

export function buildTutorsAssistantTtsJobId(operationKey: unknown) {
  const key = normalizedText(operationKey);
  if (!key) return "";
  return `tts_${createTextHash(key).slice(0, 40)}`;
}

/** 클라이언트 body에서 승인된 필드만 추출한다. text/provider/model/uid/voiceProfile/결제 주장은 버린다. */
export function normalizeTutorsAssistantTtsClientBody(raw: unknown): {
  personaId: string;
  sessionId: string;
  assistantClientId: string;
  mode: TutorsAssistantTtsMode | "";
  speed?: number;
} {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const personaId = normalizedText(record.personaId).slice(0, 128);
  const sessionId = normalizedText(record.sessionId).slice(0, 128);
  const assistantClientId = normalizedText(record.assistantClientId).slice(0, 160);
  const modeRaw = normalizedText(record.mode);
  const mode = (TUTORS_ASSISTANT_TTS_MODES as readonly string[]).includes(modeRaw)
    ? (modeRaw as TutorsAssistantTtsMode)
    : "";
  const speedRaw = Number(record.speed);
  const speed = Number.isFinite(speedRaw) && speedRaw > 0 ? Math.min(1.2, Math.max(0.7, speedRaw)) : undefined;
  return { personaId, sessionId, assistantClientId, mode, speed };
}

export type TutorsAssistantTtsCreateDecision =
  | {
      allowed: true;
      reasonCode: "allowed";
      status: 200;
      operationKey: string;
      contentHash: string;
      jobId: string;
      mode: TutorsAssistantTtsMode;
    }
  | { allowed: false; reasonCode: TutorsAssistantTtsReasonCode; status: number };

/**
 * job 생성 판정. 서버가 읽은 메시지와 소유권·revision만 신뢰한다.
 * 메시지 미저장·소유권 불일치·content 변경이면 job/provider 호출을 만들지 않는다.
 */
export function evaluateTutorsAssistantTtsJobCreate(args: {
  policy: TutorsAssistantTtsJobPolicy;
  uid: unknown;
  mode: unknown;
  message?: TutorsAssistantTtsAssistantMessage | null;
  messageRef: TutorsAssistantTtsMessageRef;
  voiceId: unknown;
  modelName?: unknown;
  format?: unknown;
  consentVersion: unknown;
  dailyCount?: unknown;
  now?: Date;
}): TutorsAssistantTtsCreateDecision {
  const policy = args.policy;
  if (policy.capabilityEnabled !== true) return denied("not_activated");

  const uid = normalizedText(args.uid);
  if (!uid) return denied("uid_unavailable");

  const mode = normalizedText(args.mode);
  if (!(TUTORS_ASSISTANT_TTS_MODES as readonly string[]).includes(mode)) return denied("unsupported_mode");

  const message = args.message;
  if (!message) return denied("assistant_message_not_found");
  if (normalizedText(message.role) !== "assistant") return denied("assistant_message_contract_mismatch");

  const ref = args.messageRef;
  const owned =
    normalizedText(message.userId) === normalizedText(ref.userId) &&
    normalizedText(message.personaId) === normalizedText(ref.personaId) &&
    normalizedText(message.sessionId) === normalizedText(ref.sessionId) &&
    normalizedText(message.clientId) === normalizedText(ref.assistantClientId);
  if (!owned) return denied("assistant_message_not_owned");

  const contentHash = resolveTutorsAssistantTtsContentHash(message.content);
  if (!contentHash) return denied("content_hash_missing");

  const voiceId = normalizedText(args.voiceId);
  const providers = normalizedList(policy.providerAllowlist);
  const models = normalizedList(policy.modelAllowlist);
  const voices = normalizedList(policy.voiceAllowlist);
  if (
    providers.length === 0 ||
    models.length === 0 ||
    voices.length === 0 ||
    !voiceId ||
    !voices.includes(voiceId) ||
    !isApprovedElevenLabsVoiceId(voiceId, { productionOnly: true })
  ) {
    return denied("voice_not_approved");
  }

  if (policy.trustedAudienceEligibility !== "verified_adult") return denied("audience_not_eligible");

  const expectedConsent = normalizedText(policy.approvedConsentVersion);
  if (!expectedConsent || normalizedText(args.consentVersion) !== expectedConsent) {
    return denied("consent_version_mismatch");
  }

  const max = policy.maxJobsPerUserPerDay;
  if (max === null || max === undefined) return denied("daily_limit_disabled");
  const limit = Number(max);
  if (!Number.isInteger(limit) || limit <= 0) return denied("daily_limit_disabled");
  const count = Number(args.dailyCount);
  if (!Number.isFinite(count) || count < 0) return denied("daily_limit_disabled");
  if (count >= limit) return denied("daily_limit_exceeded");

  const operationKey = buildTutorsAssistantTtsOperationKey({
    uid,
    messageRef: ref,
    contentHash,
    voiceId,
    modelName: args.modelName || ELEVENLABS_DEFAULT_TTS_MODEL,
    format: args.format || "mp3",
  });
  const jobId = buildTutorsAssistantTtsJobId(operationKey);
  if (!operationKey || !jobId) return denied("content_hash_missing");

  return {
    allowed: true,
    reasonCode: "allowed",
    status: 200,
    operationKey,
    contentHash,
    jobId,
    mode: mode as TutorsAssistantTtsMode,
  };
}

/** worker 호출 직전 서버 재검증. 0/미설정/저장소 장애/자격 미확정은 차단한다. */
export function evaluateTutorsAssistantTtsWorkerGate(args: {
  policy: TutorsAssistantTtsJobPolicy;
  uid: unknown;
  status: unknown;
  /** 대화 저장소 소유 키(user.ID). uid와 분리해 검증한다. */
  jobOwnerUserId?: unknown;
  jobMessageRef: Partial<TutorsAssistantTtsMessageRef>;
  jobContentHash: unknown;
  jobVoiceId: unknown;
  message?: TutorsAssistantTtsAssistantMessage | null;
  consentVersion: unknown;
  trustedAudienceEligibility: unknown;
  budgetAvailable: unknown;
}): { allowed: true; reasonCode: "allowed" } | { allowed: false; reasonCode: TutorsAssistantTtsReasonCode; status: number } {
  const policy = args.policy;
  if (policy.capabilityEnabled !== true) return denied("not_activated", 503);

  const uid = normalizedText(args.uid);
  if (!uid) return denied("uid_unavailable");

  const status = normalizedText(args.status) as TutorsAssistantTtsJobStatus;
  if (status !== "queued" && status !== "running") return denied("unsupported_status");

  const ref = args.jobMessageRef || {};
  // uid(지갑 소유자)와 user.ID(대화 소유 키)를 분리 검증한다.
  const ownerUserId = normalizedText(args.jobOwnerUserId);
  if (!ownerUserId || ownerUserId !== normalizedText(ref.userId)) return denied("job_not_owned");

  const message = args.message;
  if (!message) return denied("assistant_message_not_found");
  if (normalizedText(message.role) !== "assistant") return denied("assistant_message_contract_mismatch");
  const owned =
    normalizedText(message.personaId) === normalizedText(ref.personaId) &&
    normalizedText(message.sessionId) === normalizedText(ref.sessionId) &&
    normalizedText(message.clientId) === normalizedText(ref.assistantClientId);
  if (!owned) return denied("job_not_owned");

  const contentHash = resolveTutorsAssistantTtsContentHash(message.content);
  if (!contentHash || contentHash !== normalizedText(args.jobContentHash)) return denied("content_hash_mismatch");

  const voiceId = normalizedText(args.jobVoiceId);
  const voices = normalizedList(policy.voiceAllowlist);
  if (!voiceId || !voices.includes(voiceId) || !isApprovedElevenLabsVoiceId(voiceId, { productionOnly: true })) {
    return denied("voice_not_approved");
  }

  if (args.trustedAudienceEligibility !== "verified_adult") return denied("audience_not_eligible");

  const expectedConsent = normalizedText(policy.approvedConsentVersion);
  if (!expectedConsent || normalizedText(args.consentVersion) !== expectedConsent) {
    return denied("consent_version_mismatch");
  }

  if (args.budgetAvailable !== true) return denied("budget_unavailable", 429);

  return { allowed: true, reasonCode: "allowed" };
}

/** R2 HEAD 검증 통과 뒤 CAS로 audioMeta를 연결하기 위한 순수 판정. */
export function canAttachTutorsAssistantTtsAudioMeta(args: {
  jobMessageRef: Partial<TutorsAssistantTtsMessageRef>;
  jobContentHash: unknown;
  message?: TutorsAssistantTtsAssistantMessage | null;
}) {
  const ref = args.jobMessageRef || {};
  const message = args.message;
  if (!message) return false;
  if (normalizedText(message.role) !== "assistant") return false;
  if (normalizedText(message.clientId) !== normalizedText(ref.assistantClientId)) return false;
  if (normalizedText(message.personaId) !== normalizedText(ref.personaId)) return false;
  if (normalizedText(message.sessionId) !== normalizedText(ref.sessionId)) return false;
  const contentHash = resolveTutorsAssistantTtsContentHash(message.content);
  return Boolean(contentHash) && contentHash === normalizedText(args.jobContentHash);
}

/**
 * job record 빌더. 원문 텍스트·오디오 바이트는 저장하지 않는다.
 * messageRef·contentHash·voice snapshot·operation ID·상태·lease·attempt·expiresAt만 담는다.
 */
export function buildTutorsAssistantTtsJobRecord(args: {
  policy: TutorsAssistantTtsJobPolicy;
  uid: unknown;
  jobId: unknown;
  messageRef: TutorsAssistantTtsMessageRef;
  contentHash: unknown;
  voice: TutorsAssistantTtsVoiceSnapshot | null;
  consentVersion: unknown;
  priceSnapshot?: Record<string, unknown> | null;
  /** H5: 서비스가 이미 계산한 operation key(있으면 재계산하지 않는다). */
  operationKey?: unknown;
  format?: unknown;
  now?: Date;
}): TutorsAssistantTtsJobRecord {
  const now = args.now || new Date();
  const ttlHours = resolveTutorsAssistantTtsTransportTtlHours(args.policy);
  const jobId = normalizedText(args.jobId);
  const uid = normalizedText(args.uid);
  const contentHash = normalizedText(args.contentHash);
  const format = normalizedText(args.format) || "mp3";
  const operationKey =
    normalizedText(args.operationKey) ||
    buildTutorsAssistantTtsOperationKey({
      uid,
      messageRef: args.messageRef,
      contentHash,
      voiceId: args.voice?.voiceId,
      modelName: args.voice?.modelName,
      format,
    });
  return {
    jobId,
    uid,
    ownerUserId: normalizedText(args.messageRef.userId),
    operationKey,
    format,
    status: "queued",
    attempt: 0,
    lease: null,
    messageRef: args.messageRef,
    contentHash: normalizedText(args.contentHash),
    voice: args.voice,
    stageOperationId: buildTutorsAssistantTtsOperationId(jobId),
    consentVersion: normalizedText(args.consentVersion),
    priceSnapshot: args.priceSnapshot || null,
    providerRequestId: null,
    billingRef: null,
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
  };
}
