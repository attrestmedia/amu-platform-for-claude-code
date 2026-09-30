import { NextResponse } from "next/server";
import { TUTORS_NAMESPACE_KEY } from "consts/app";
import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import { ELEVENLABS_DEFAULT_TTS_MODEL } from "consts/ai/voiceCatalog";
import { refundAIUsageOrThrow } from "libs/services/aiUsageBilling";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import {
  attachTutorsAssistantMessageAudioMetaCas,
  claimTutorsAssistantTtsJob,
  loadTutorsAssistantMessageForTts,
  markTutorsAssistantTtsJobStatus,
  recoverStaleRunningTutorsAssistantTtsJobs,
} from "libs/database/conversations";
import { buildSpeechBillingContext } from "libs/server-utils/audio/routeUtils";
import { assertSpeechBudgetOrThrow } from "libs/server-utils/audio/speechBudgetGuard";
import { synthesizeSpeech } from "libs/server-utils/audio/synthesizeSpeech";
import {
  assertVoiceAssetStorage,
  buildChatVoiceStorageKey,
  deleteVoiceAssetByStorage,
  resolveAudioExt,
  saveVoiceBufferToR2,
} from "libs/server-utils/audio/voiceAssetStorage";
import { buildMessageAudioMeta } from "libs/server-utils/audio/cacheKeys";
import { getDefaultTutorsAssistantTtsJobPolicy } from "libs/server-utils/tutors/assistantTtsJobContract";
import { runTutorsAssistantTtsWorker } from "libs/server-utils/tutors/assistantTtsWorker";
import { getDefaultTutorsAssistantTtsVoicePolicy } from "libs/server-utils/tutors/assistantTtsVoicePolicy";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS durable worker poll API(관리자 전용)
 * @process 관리자 인증 → 원자적 lease claim → 소유권/revision/동의/자격/예산 재검증 → ElevenLabs 1회 → R2 HEAD → CAS
 * @domain tutors-tts
 * @scope api
 *
 * 기본 정책은 닫혀이며 실제 provider 호출은 발생하지 않는다. provider 호출이 시작된 작업의
 * lease 상실·timeout은 unknown_outcome으로 남기고 자동 재시도하지 않는다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(data: unknown) {
  return withApiTimeout(async () => {
    const body = toUnknownRecord(data);
    const jobId = String(body.jobId || "").trim() || undefined;
    const now = new Date();
    const policy = getDefaultTutorsAssistantTtsJobPolicy();
    const voicePolicy = getDefaultTutorsAssistantTtsVoicePolicy();

    const result = await runTutorsAssistantTtsWorker(
      { policy, voicePolicy, jobId, now },
      {
        recoverStaleJobs: async ({ now: recoverNow }) =>
          await recoverStaleRunningTutorsAssistantTtsJobs({ now: recoverNow }),
        claimJob: async ({ jobId: targetJobId, leaseMs, now: claimNow }) =>
          await claimTutorsAssistantTtsJob({ jobId: targetJobId, leaseMs, now: claimNow }),
        loadAssistantMessage: async (ref) => await loadTutorsAssistantMessageForTts(ref),
        // 서버 신뢰 성인 출처가 확정되기 전에는 unknown으로 fail-closed한다.
        resolveTrustedAudienceEligibility: async () => "unknown",
        resolveConsentVersion: async () => CURRENT_ACCOUNT_POLICY.privacy.version,
        preflightBudget: async ({ job }) => {
          try {
            const message = await loadTutorsAssistantMessageForTts(job.messageRef);
            const text = String(message?.content || "");
            const characters = Array.from(text.normalize("NFC")).length;
            await assertSpeechBudgetOrThrow({
              provider: "elevenlabs",
              modelName: job.voice?.modelName || ELEVENLABS_DEFAULT_TTS_MODEL,
              unit: "character",
              quantity: characters,
              billing: buildSpeechBillingContext({
                user: { uid: job.uid, ID: job.uid },
                routeHint: "tutors",
                universeId: job.messageRef.universeId || "tutors",
                sessionId: job.messageRef.sessionId,
                npcId: job.messageRef.personaId,
                clientId: job.messageRef.assistantClientId,
                operation: "speech_synthesize",
              }),
            });
            return true;
          } catch {
            return false;
          }
        },
        synthesize: async ({ job, message }) => {
          const text = String(message?.content || "").trim();
          if (!text || !job.voice) {
            return { audioBuffer: null, contentType: "", bytes: 0, providerCallState: "not_sent" as const, textOnly: true };
          }
          try {
            const billing = buildSpeechBillingContext({
              user: { uid: job.uid, ID: job.uid },
              routeHint: "tutors",
              universeId: job.messageRef.universeId || "tutors",
              sessionId: job.messageRef.sessionId,
              npcId: job.messageRef.personaId,
              clientId: job.messageRef.assistantClientId,
              operation: "speech_synthesize",
            });
            const synthesized = await synthesizeSpeech({
              provider: "elevenlabs",
              modelName: job.voice.modelName || ELEVENLABS_DEFAULT_TTS_MODEL,
              text,
              format: "mp3",
              speed: 1,
              locale: job.voice.locale,
              routeHint: "tutors",
              voiceProfile: {
                provider: "elevenlabs",
                voiceId: job.voice.voiceId,
                modelName: job.voice.modelName,
                locale: job.voice.locale,
                voiceRevision: job.voice.voiceRevision,
              },
              billing: {
                ...billing,
                meta: { ...billing.meta, operationId: job.stageOperationId },
              },
            });
            return {
              audioBuffer: synthesized.audioBuffer,
              contentType: String(synthesized.contentType || "audio/mpeg"),
              bytes: Number(synthesized.bytes || 0),
              providerCallState: "completed" as const,
              providerRequestId: String(toUnknownRecord(synthesized.meta).providerRequestId || ""),
              billing: {
                coins: Number(synthesized.billing?.coins || 0),
                fixedCharacters:
                  Number(toUnknownRecord(toUnknownRecord(synthesized.meta).billingFixed).characters || 0) || undefined,
              },
            };
          } catch (error) {
            const providerCallState = String((error as { providerCallState?: unknown })?.providerCallState || "not_sent");
            const state = providerCallState === "unknown_outcome" ? "unknown_outcome" : "not_sent";
            return {
              audioBuffer: null,
              contentType: "",
              bytes: 0,
              providerCallState: state as "not_sent" | "unknown_outcome",
              textOnly: state !== "unknown_outcome",
            };
          }
        },
        saveAsset: async ({ job, audioBuffer, contentType, bytes }) => {
          const buffer = audioBuffer as Buffer;
          const audioMeta = buildMessageAudioMeta({
            assistantClientId: job.messageRef.assistantClientId,
            voiceProfile: job.voice
              ? {
                  provider: job.voice.provider,
                  voiceId: job.voice.voiceId,
                  modelName: job.voice.modelName,
                  locale: job.voice.locale,
                  voiceRevision: job.voice.voiceRevision,
                }
              : undefined,
            contentType,
            bytes,
            tenantScope: job.uid,
            contentHash: job.contentHash,
            format: "mp3",
            status: "ready",
          });
          const storage = await saveVoiceBufferToR2({
            key: buildChatVoiceStorageKey({
              uid: job.uid,
              routeHint: "tutors",
              universeId: job.messageRef.universeId || "tutors",
              npcId: job.messageRef.personaId,
              sessionId: job.messageRef.sessionId,
              cacheKey: audioMeta.cacheKey || job.messageRef.assistantClientId,
              ext: resolveAudioExt(contentType, "mp3"),
            }),
            body: buffer,
            contentType: contentType || "audio/mpeg",
            access: "private",
            temporary: true,
          });
          return { storage, audioMeta: { ...audioMeta, storage } as Record<string, unknown> };
        },
        assertStorage: async (storage) => await assertVoiceAssetStorage(storage),
        attachAudioMeta: async ({ job, audioMeta }) =>
          await attachTutorsAssistantMessageAudioMetaCas({
            ref: job.messageRef,
            contentHash: job.contentHash,
            audioMeta,
          }),
        deleteAsset: async (storage) => await deleteVoiceAssetByStorage(storage),
        compensateBilling: async ({ job, coins, fixedCharacters, reason }) => {
          try {
            await refundAIUsageOrThrow({
              uid: job.uid,
              app: TUTORS_NAMESPACE_KEY,
              provider: "elevenlabs",
              modelName: job.voice?.modelName || ELEVENLABS_DEFAULT_TTS_MODEL,
              modality: "audio",
              fixed: { characters: fixedCharacters || 0 },
              coins,
              meta: {
                operationId: `voice:${job.jobId}:compensation`,
                sourceOperationId: job.stageOperationId,
                reason,
              },
            });
            return { ok: true };
          } catch (error) {
            return { ok: false, errorCode: String((error as { errorCode?: unknown })?.errorCode || "REFUND_FAILED") };
          }
        },
        markStatus: async ({ jobId: targetJobId, status, patch }) =>
          await markTutorsAssistantTtsJobStatus({ jobId: targetJobId, status, patch }),
      },
    );

    return NextResponse.json({ ok: true, data: result });
  }, 180000);
}

export const POST = withAuth(postHandler, undefined, "tutors/assistant-tts/jobs:worker-poll", {
  requireAdmin: true,
  bodyParser: "json",
});
