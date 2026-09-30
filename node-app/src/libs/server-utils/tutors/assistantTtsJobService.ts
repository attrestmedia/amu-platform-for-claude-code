import {
  TUTORS_ASSISTANT_TTS_ERROR_CODE,
  TUTORS_ASSISTANT_TTS_TEXT_ONLY,
  buildTutorsAssistantTtsJobRecord,
  evaluateTutorsAssistantTtsJobCreate,
  type TutorsAssistantTtsJobPolicy,
  type TutorsAssistantTtsJobRecord,
  type TutorsAssistantTtsMessageRef,
  type TutorsAssistantTtsReasonCode,
  type TutorsAssistantTtsVoiceSnapshot,
} from "./assistantTtsJobContract";
import {
  buildTutorsAssistantTtsVoiceSnapshot,
  type TutorsAssistantTtsVoicePolicy,
} from "./assistantTtsVoicePolicy";
import type { TutorsAssistantTtsMetricInput } from "./assistantTtsWorker";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS job 생성·자산 확정 서비스(의존성 주입)
 * @process 클라이언트 body 정규화 → 서버 메시지/revision 고정 → job 생성/재사용 → R2 HEAD → CAS
 * @domain tutors-tts
 * @scope server
 *
 * 이 모듈은 DB·R2·provider에 직접 의존하지 않는다. 라우트가 실제 deps를 주입하고,
 * 계약 테스트는 mock deps로 provider 호출 0건과 상태 전이를 검증한다.
 */

export type TutorsAssistantTtsAssistantMessage = {
  role?: unknown;
  content?: unknown;
  clientId?: unknown;
  personaId?: unknown;
  sessionId?: unknown;
  userId?: unknown;
};

export type TutorsAssistantTtsCreateDeps = {
  loadAssistantMessage: (ref: TutorsAssistantTtsMessageRef) => Promise<TutorsAssistantTtsAssistantMessage | null>;
  countDailyJobs: (args: { uid: string; now: Date }) => Promise<number>;
  findJobByOperationKey: (operationKey: string) => Promise<TutorsAssistantTtsJobRecord | null>;
  createJob: (record: TutorsAssistantTtsJobRecord) => Promise<{ created: boolean; job: TutorsAssistantTtsJobRecord }>;
  resolveReadyAudio?: (
    job: TutorsAssistantTtsJobRecord,
  ) => Promise<{ audioUrl: string; audioMeta: Record<string, unknown> } | null>;
  /** Stream B 계측 call site(기본 off). 설정 스위치가 꺼져 있으면 기록하지 않는다. */
  recordMetric?: (args: TutorsAssistantTtsMetricInput) => Promise<unknown>;
};

async function defaultCreateRecordMetric(args: TutorsAssistantTtsMetricInput) {
  try {
    const { recordTutorVoicePilotMetricFromConfig } = await import(
      "libs/server-utils/tutors/tutorPilotMetrics"
    );
    await recordTutorVoicePilotMetricFromConfig(args);
  } catch {
    // 계측 실패·미설정(default off)은 job 생성 흐름을 막지 않는다.
  }
}

async function recordCreateMetric(
  deps: TutorsAssistantTtsCreateDeps,
  uid: string,
  messageRef: TutorsAssistantTtsMessageRef,
  metric: TutorsAssistantTtsMetricInput["metric"],
) {
  const recorder = deps.recordMetric ?? defaultCreateRecordMetric;
  await recorder({
    uid,
    universeId: messageRef.universeId || "tutors",
    metric,
    idempotencyKey: `${messageRef.assistantClientId}:${metric}`,
  }).catch(() => undefined);
}

export type TutorsAssistantTtsCreateArgs = {
  policy: TutorsAssistantTtsJobPolicy;
  voicePolicy: TutorsAssistantTtsVoicePolicy;
  uid: string;
  mode: string;
  messageRef: TutorsAssistantTtsMessageRef;
  /** 서버가 persona/legacy profile에서 고른 승인 voiceId. 클라이언트 주장이 아니다. */
  selectedVoiceId: string;
  format?: string;
  speed?: number;
  consentVersion: string;
  now?: Date;
};

export type TutorsAssistantTtsCreateResult =
  | {
      ok: false;
      status: number;
      errorCode: typeof TUTORS_ASSISTANT_TTS_ERROR_CODE;
      fallback: typeof TUTORS_ASSISTANT_TTS_TEXT_ONLY;
      reasonCode: TutorsAssistantTtsReasonCode;
    }
  | { ok: true; status: 202; jobId: string; jobStatus: "queued" }
  | {
      ok: true;
      status: 200;
      jobId: string;
      jobStatus: "succeeded";
      audioUrl: string;
      audioMeta: Record<string, unknown>;
    };

function deniedService(reasonCode: TutorsAssistantTtsReasonCode, status: number): TutorsAssistantTtsCreateResult {
  return {
    ok: false,
    status,
    errorCode: TUTORS_ASSISTANT_TTS_ERROR_CODE,
    fallback: TUTORS_ASSISTANT_TTS_TEXT_ONLY,
    reasonCode,
  };
}

function buildJobVoiceSnapshot(args: {
  voiceId: string;
  policy: TutorsAssistantTtsVoicePolicy;
  contentHash: string;
  format: string;
  speed?: number;
}): TutorsAssistantTtsVoiceSnapshot | null {
  return buildTutorsAssistantTtsVoiceSnapshot({
    voiceId: args.voiceId,
    policy: args.policy,
    contentHash: args.contentHash,
    format: args.format,
    speed: args.speed,
  });
}

/**
 * job 생성. 서버가 읽은 메시지 소유권·content revision을 고정하고,
 * 중복 요청은 operation key로 하나의 job으로 수렴시킨다.
 */
export async function createTutorsAssistantTtsJob(
  args: TutorsAssistantTtsCreateArgs,
  deps: TutorsAssistantTtsCreateDeps,
): Promise<TutorsAssistantTtsCreateResult> {
  const now = args.now || new Date();
  const message = await deps.loadAssistantMessage(args.messageRef);

  const baseDecision = evaluateTutorsAssistantTtsJobCreate({
    policy: args.policy,
    uid: args.uid,
    mode: args.mode,
    message,
    messageRef: args.messageRef,
    voiceId: args.selectedVoiceId,
    modelName: args.voicePolicy.modelName,
    format: args.format || "mp3",
    consentVersion: args.consentVersion,
    dailyCount: 0,
    now,
  });
  if (!baseDecision.allowed) {
    await recordCreateMetric(deps, String(args.uid), args.messageRef, "voice_text_only_fallback");
    return deniedService(baseDecision.reasonCode, baseDecision.status);
  }

  const dailyCount = await deps.countDailyJobs({ uid: String(args.uid), now });
  const decision = evaluateTutorsAssistantTtsJobCreate({
    policy: args.policy,
    uid: args.uid,
    mode: args.mode,
    message,
    messageRef: args.messageRef,
    voiceId: args.selectedVoiceId,
    modelName: args.voicePolicy.modelName,
    format: args.format || "mp3",
    consentVersion: args.consentVersion,
    dailyCount,
    now,
  });
  if (!decision.allowed) {
    await recordCreateMetric(deps, String(args.uid), args.messageRef, "voice_text_only_fallback");
    return deniedService(decision.reasonCode, decision.status);
  }

  const existing = await deps.findJobByOperationKey(decision.operationKey);
  if (existing) {
    if (existing.status === "succeeded" && deps.resolveReadyAudio) {
      const ready = await deps.resolveReadyAudio(existing);
      if (ready) {
        return {
          ok: true,
          status: 200,
          jobId: existing.jobId,
          jobStatus: "succeeded",
          audioUrl: ready.audioUrl,
          audioMeta: ready.audioMeta,
        };
      }
    }
    await recordCreateMetric(deps, String(args.uid), args.messageRef, "voice_playback_start");
    return { ok: true, status: 202, jobId: existing.jobId, jobStatus: "queued" };
  }

  const voice = buildJobVoiceSnapshot({
    voiceId: args.selectedVoiceId,
    policy: args.voicePolicy,
    contentHash: decision.contentHash,
    format: args.format || "mp3",
    speed: args.speed,
  });
  const record = buildTutorsAssistantTtsJobRecord({
    policy: args.policy,
    uid: args.uid,
    jobId: decision.jobId,
    messageRef: args.messageRef,
    contentHash: decision.contentHash,
    voice,
    consentVersion: args.consentVersion,
    priceSnapshot: null,
    // H5: 판정에서 확정한 operation key를 그대로 고정해 format 재구성 드리프트를 막는다.
    operationKey: decision.operationKey,
    format: args.format || "mp3",
    now,
  });
  const { job } = await deps.createJob(record);
  await recordCreateMetric(deps, String(args.uid), args.messageRef, "voice_playback_start");
  return { ok: true, status: 202, jobId: job.jobId, jobStatus: "queued" };
}

export type TutorsAssistantTtsFinalizeDeps = {
  /** R2 PUT 후 HEAD(MIME/bytes/hash) 검증. 실패 시 throw. */
  assertStorage: (storage: unknown) => Promise<unknown>;
  /** 소유권·revision 포함 조건부 update(CAS). 일치 건수를 반환한다. */
  attachAudioMeta: (args: {
    job: TutorsAssistantTtsJobRecord;
    audioMeta: Record<string, unknown>;
  }) => Promise<number>;
  /** CAS 0건 또는 저장 실패 보상용 새 asset 삭제. */
  deleteAsset: (storage: unknown) => Promise<boolean>;
};

export type TutorsAssistantTtsFinalizeResult =
  | { attached: true; compensated: false }
  | { attached: false; compensated: true };

/**
 * R2 HEAD 검증 → 메시지 CAS로 audioMeta 연결. 조건부 update가 0건이면
 * 새 asset을 보상 삭제하고 원문 텍스트는 건드리지 않는다.
 */
export async function finalizeTutorsAssistantTtsAsset(
  args: { job: TutorsAssistantTtsJobRecord; storage: unknown; audioMeta: Record<string, unknown> },
  deps: TutorsAssistantTtsFinalizeDeps,
): Promise<TutorsAssistantTtsFinalizeResult> {
  await deps.assertStorage(args.storage);
  const matched = await deps.attachAudioMeta({ job: args.job, audioMeta: args.audioMeta });
  if (matched > 0) return { attached: true, compensated: false };
  await deps.deleteAsset(args.storage).catch(() => false);
  return { attached: false, compensated: true };
}
