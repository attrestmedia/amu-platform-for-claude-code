import {
  evaluateTutorsAssistantTtsWorkerGate,
  resolveTutorsAssistantTtsLeaseMs,
  resolveTutorsAssistantTtsTerminalStatus,
  type TutorsAssistantTtsJobPolicy,
  type TutorsAssistantTtsJobRecord,
  type TutorsAssistantTtsMessageRef,
  type TutorsAssistantTtsReasonCode,
} from "./assistantTtsJobContract";
import type { TutorsAssistantTtsVoicePolicy } from "./assistantTtsVoicePolicy";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS durable worker(의존성 주입)
 * @process claim/lease → 서버 재검증 → ElevenLabs synth 1회 → R2 HEAD → 메시지 CAS → 상태 전이
 * @domain tutors-tts
 * @scope server
 *
 * provider 호출이 시작된 작업의 lease 상실·timeout은 unknown_outcome으로 남기고 자동 재시도하지 않는다.
 * 매핑 미확정 voice는 text-only이며 임의 Voice나 OpenAI fallback은 없다.
 */

export const TUTORS_ASSISTANT_TTS_PROVIDER = "elevenlabs" as const;

export type TutorsAssistantTtsWorkerMessage = {
  role?: unknown;
  content?: unknown;
  clientId?: unknown;
  personaId?: unknown;
  sessionId?: unknown;
  userId?: unknown;
};

export type TutorsAssistantTtsProviderCallState = "completed" | "not_sent" | "unknown_outcome";

export type TutorsAssistantTtsSynthesizeResult = {
  audioBuffer: unknown;
  contentType: string;
  bytes: number;
  providerCallState: TutorsAssistantTtsProviderCallState;
  providerRequestId?: string;
  /** text-only로 수렴해야 하는 경우(voice 미확정/장애) true. */
  textOnly?: boolean;
  /** provider 후 과금된 코인·문자 수(후속 저장 실패 보상에 사용). */
  billing?: { coins: number; fixedCharacters?: number };
};

/** Stream B: Tutors Voice 파일럿 계측 입력. 설정 스위치가 꺼져 있으면 기록되지 않는다. */
export type TutorsAssistantTtsMetricInput = {
  uid: string;
  universeId: string;
  metric: "voice_playback_start" | "voice_playback_failure" | "voice_text_only_fallback" | "voice_latency_bucket";
  idempotencyKey: string;
  detail?: Record<string, unknown>;
};

export type TutorsAssistantTtsWorkerDeps = {
  /** worker kill/lease 만료 재시작 시 stale running job을 unknown_outcome으로 회수한다. */
  recoverStaleJobs?: (args: { now: Date }) => Promise<number>;
  claimJob: (args: { jobId?: string; leaseMs: number; now: Date }) => Promise<TutorsAssistantTtsJobRecord | null>;
  loadAssistantMessage: (ref: TutorsAssistantTtsMessageRef) => Promise<TutorsAssistantTtsWorkerMessage | null>;
  resolveTrustedAudienceEligibility: (uid: string) => Promise<unknown>;
  resolveConsentVersion: () => Promise<string>;
  preflightBudget: (args: { job: TutorsAssistantTtsJobRecord; uid: string }) => Promise<boolean>;
  synthesize: (args: {
    job: TutorsAssistantTtsJobRecord;
    message: TutorsAssistantTtsWorkerMessage;
  }) => Promise<TutorsAssistantTtsSynthesizeResult>;
  saveAsset: (args: {
    job: TutorsAssistantTtsJobRecord;
    audioBuffer: unknown;
    contentType: string;
    bytes: number;
  }) => Promise<{ storage: unknown; audioMeta: Record<string, unknown> }>;
  assertStorage: (storage: unknown) => Promise<unknown>;
  attachAudioMeta: (args: { job: TutorsAssistantTtsJobRecord; audioMeta: Record<string, unknown> }) => Promise<number>;
  deleteAsset: (storage: unknown) => Promise<boolean>;
  /** provider 후 저장 실패를 기존 코인 정산 primitive로 보상한다. 실패 시 reconciliation을 남긴다. */
  compensateBilling?: (args: {
    job: TutorsAssistantTtsJobRecord;
    coins: number;
    fixedCharacters?: number;
    reason: string;
  }) => Promise<{ ok: boolean; errorCode?: string }>;
  markStatus: (args: {
    jobId: string;
    status: TutorsAssistantTtsJobRecord["status"];
    patch?: Record<string, unknown>;
  }) => Promise<unknown>;
  /** Stream B 계측 call site(기본 off). 설정 스위치가 꺼져 있으면 기록하지 않는다. */
  recordMetric?: (args: TutorsAssistantTtsMetricInput) => Promise<unknown>;
};

export type TutorsAssistantTtsWorkerResult =
  | { ok: true; processed: false; reason: "no_job" }
  | {
      ok: true;
      processed: true;
      jobId: string;
      status: TutorsAssistantTtsJobRecord["status"];
      reasonCode: TutorsAssistantTtsReasonCode | "attached" | "compensated" | "text_only" | "unknown_outcome";
    };

async function markStatusSafe(
  deps: TutorsAssistantTtsWorkerDeps,
  args: { jobId: string; status: TutorsAssistantTtsJobRecord["status"]; patch?: Record<string, unknown> },
) {
  await deps.markStatus(args).catch(() => undefined);
}

/** 기본 계측 기록기 — 서버 설정(runtime-config)을 읽어 스위치가 켜졌을 때만 기록한다. */
async function defaultRecordMetric(args: TutorsAssistantTtsMetricInput) {
  try {
    const { recordTutorVoicePilotMetricFromConfig } = await import(
      "libs/server-utils/tutors/tutorPilotMetrics"
    );
    await recordTutorVoicePilotMetricFromConfig(args);
  } catch {
    // 계측 실패·미설정(default off)은 재생 흐름을 막지 않는다.
  }
}

async function recordJobMetric(
  deps: TutorsAssistantTtsWorkerDeps,
  job: TutorsAssistantTtsJobRecord,
  metric: TutorsAssistantTtsMetricInput["metric"],
  detail?: Record<string, unknown>,
) {
  const recorder = deps.recordMetric ?? defaultRecordMetric;
  await recorder({
    uid: job.uid,
    universeId: job.messageRef.universeId || "tutors",
    metric,
    idempotencyKey: `${job.jobId}:${metric}`,
    detail,
  }).catch(() => undefined);
}

/**
 * worker 1회 실행. 게이트가 닫히면 provider 호출 전에 종료한다.
 * 성공 시에만 R2 HEAD 검증을 거쳐 CAS로 audioMeta를 연결한다.
 */
export async function runTutorsAssistantTtsWorker(
  args: {
    policy: TutorsAssistantTtsJobPolicy;
    voicePolicy: TutorsAssistantTtsVoicePolicy;
    jobId?: string;
    now?: Date;
  },
  deps: TutorsAssistantTtsWorkerDeps,
): Promise<TutorsAssistantTtsWorkerResult> {
  const now = args.now || new Date();
  // worker kill/lease 만료로 running에 남은 job은 자동 재시도 대신 unknown_outcome으로 회수한다.
  if (deps.recoverStaleJobs) {
    await deps.recoverStaleJobs({ now }).catch(() => 0);
  }
  const job = await deps.claimJob({
    jobId: args.jobId,
    leaseMs: resolveTutorsAssistantTtsLeaseMs(args.policy),
    now,
  });
  if (!job) return { ok: true, processed: false, reason: "no_job" };

  const message = await deps.loadAssistantMessage(job.messageRef);
  const [trustedAudienceEligibility, consentVersion, budgetAvailable] = await Promise.all([
    deps.resolveTrustedAudienceEligibility(job.uid),
    deps.resolveConsentVersion(),
    deps.preflightBudget({ job, uid: job.uid }),
  ]);

  const gate = evaluateTutorsAssistantTtsWorkerGate({
    policy: args.policy,
    uid: job.uid,
    status: job.status,
    jobOwnerUserId: job.ownerUserId,
    jobMessageRef: job.messageRef,
    jobContentHash: job.contentHash,
    jobVoiceId: job.voice?.voiceId,
    message,
    consentVersion,
    trustedAudienceEligibility,
    budgetAvailable,
  });
  if (!gate.allowed) {
    await markStatusSafe(deps, { jobId: job.jobId, status: "failed", patch: { errorCode: gate.reasonCode } });
    await recordJobMetric(deps, job, "voice_playback_failure", { reasonCode: gate.reasonCode });
    return { ok: true, processed: true, jobId: job.jobId, status: "failed", reasonCode: gate.reasonCode };
  }

  const providerResult = await deps.synthesize({ job, message: message as TutorsAssistantTtsWorkerMessage });

  const terminalStatus = resolveTutorsAssistantTtsTerminalStatus(providerResult.providerCallState);
  if (terminalStatus === "unknown_outcome") {
    // provider 호출이 시작됐을 수 있다 — 자동 재시도하지 않고 unknown_outcome으로 보존한다.
    await markStatusSafe(deps, {
      jobId: job.jobId,
      status: "unknown_outcome",
      patch: { providerRequestId: providerResult.providerRequestId || null },
    });
    await recordJobMetric(deps, job, "voice_playback_failure", { outcome: "unknown_outcome" });
    return { ok: true, processed: true, jobId: job.jobId, status: "unknown_outcome", reasonCode: "unknown_outcome" };
  }
  if (terminalStatus !== "succeeded" || providerResult.textOnly) {
    await markStatusSafe(deps, { jobId: job.jobId, status: "failed" });
    await recordJobMetric(deps, job, "voice_text_only_fallback");
    return { ok: true, processed: true, jobId: job.jobId, status: "failed", reasonCode: "provider_not_configured" };
  }

  const billingCoins = Number(providerResult.billing?.coins || 0);
  const fixedCharacters = Number(providerResult.billing?.fixedCharacters || 0) || undefined;
  const compensate = async (reason: string): Promise<Record<string, unknown>> => {
    if (!deps.compensateBilling || billingCoins <= 0) {
      return { billingCompensation: billingCoins > 0 ? "unsupported" : "none" };
    }
    try {
      const result = await deps.compensateBilling({ job, coins: billingCoins, fixedCharacters, reason });
      return {
        billingCompensation:
          result?.ok === false ? `reconciliation_required:${result.errorCode || "unknown"}` : "refunded",
      };
    } catch (error) {
      return {
        billingCompensation: `reconciliation_required:${String((error as { errorCode?: string })?.errorCode || "exception")}`,
      };
    }
  };

  let asset: { storage: unknown; audioMeta: Record<string, unknown> } | null = null;
  try {
    asset = await deps.saveAsset({
      job,
      audioBuffer: providerResult.audioBuffer,
      contentType: providerResult.contentType,
      bytes: providerResult.bytes,
    });
    await deps.assertStorage(asset.storage);
  } catch {
    // R2 PUT/HEAD 실패 — 이미 생성된 asset이 있으면 보상 삭제하고, provider 후 과금을 보상한다.
    if (asset?.storage) await deps.deleteAsset(asset.storage).catch(() => false);
    const patch = { errorCode: "asset_storage_failed", ...(await compensate("asset_storage_failed")) };
    await markStatusSafe(deps, { jobId: job.jobId, status: "failed", patch });
    await recordJobMetric(deps, job, "voice_playback_failure", { reasonCode: "asset_storage_failed" });
    return { ok: true, processed: true, jobId: job.jobId, status: "failed", reasonCode: "compensated" };
  }

  const matched = await deps.attachAudioMeta({ job, audioMeta: asset.audioMeta });
  if (matched <= 0) {
    // 오래된 메시지이거나 revision 불일치 — 새 asset을 보상 삭제하고 원문 텍스트는 건드리지 않는다.
    await deps.deleteAsset(asset.storage).catch(() => false);
    const patch = { errorCode: "message_revision_stale", ...(await compensate("message_revision_stale")) };
    await markStatusSafe(deps, { jobId: job.jobId, status: "failed", patch });
    await recordJobMetric(deps, job, "voice_playback_failure", { reasonCode: "message_revision_stale" });
    return { ok: true, processed: true, jobId: job.jobId, status: "failed", reasonCode: "compensated" };
  }

  await markStatusSafe(deps, {
    jobId: job.jobId,
    status: "succeeded",
    patch: { providerRequestId: providerResult.providerRequestId || null },
  });
  await recordJobMetric(deps, job, "voice_playback_start", { voiceId: job.voice?.voiceId });
  return { ok: true, processed: true, jobId: job.jobId, status: "succeeded", reasonCode: "attached" };
}
