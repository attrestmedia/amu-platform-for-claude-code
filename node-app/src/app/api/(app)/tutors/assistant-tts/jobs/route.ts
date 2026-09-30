import { NextResponse } from "next/server";
import { TUTORS_NAMESPACE_KEY } from "consts/app";
import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  countTutorsAssistantTtsJobsForUidDay,
  createTutorsAssistantTtsJobRecord,
  findTutorsAssistantTtsJobByOperationKey,
  loadTutorsAssistantMessageForTts,
} from "libs/database/conversations";
import { getTutorPersonaForPrompt } from "libs/database/tutors/tutorPersonaPromptRepo";
import { getExistingVoiceAssetPlaybackUrl } from "libs/server-utils/audio/voiceAssetStorage";
import { getDefaultTutorsAssistantTtsJobPolicy, normalizeTutorsAssistantTtsClientBody } from "libs/server-utils/tutors/assistantTtsJobContract";
import { createTutorsAssistantTtsJob } from "libs/server-utils/tutors/assistantTtsJobService";
import {
  getDefaultTutorsAssistantTtsVoicePolicy,
  isApprovedTutorsAssistantTtsVoiceId,
  resolveLegacyOpenAiVoiceToElevenLabs,
} from "libs/server-utils/tutors/assistantTtsVoicePolicy";
import { toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS job 생성 API
 * @process 인증 → body 정규화 → 서버 메시지 소유권/revision 고정 → job 생성/재사용
 * @domain tutors-tts
 * @scope api
 *
 * 기본 정책은 닫혀이며 실제 provider 호출은 발생하지 않는다. 클라이언트의 text/provider/model/
 * uid/voiceProfile/결제 주장은 승인 근거가 아니다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeId(value: unknown) {
  const text = String(value || "").trim();
  return /^[a-zA-Z0-9._:-]{1,160}$/.test(text) ? text : "";
}

function resolveSelectedVoiceId(persona: unknown, voiceAllowlist: readonly string[]) {
  const voiceProfile = toUnknownRecord(toUnknownRecord(persona).voiceProfile);
  const rawVoiceId = String(voiceProfile.voiceId || "").trim();
  if (!rawVoiceId) return "";
  const policy = { provider: "elevenlabs" as const, modelName: "", voiceAllowlist };
  if (isApprovedTutorsAssistantTtsVoiceId(rawVoiceId, { ...policy, modelName: "" })) return rawVoiceId;
  // 구 OpenAI profile은 승인된 ElevenLabs voice 매핑이 있을 때만 결정적으로 변환한다. 매핑 미확정이면 text-only.
  const mapped = resolveLegacyOpenAiVoiceToElevenLabs(rawVoiceId);
  if (mapped && isApprovedTutorsAssistantTtsVoiceId(mapped, { ...policy, modelName: "" })) return mapped;
  return "";
}

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType) {
  return withApiTimeout(async () => {
    const serverUserId = String(toUnknownRecord(user).ID || "").trim();
    const uid = String(toUnknownRecord(user).uid || toUnknownRecord(user).ID || "").trim();
    if (!serverUserId || !uid || serverUserId.startsWith("guest:")) {
      return NextResponse.json(
        { error: "로그인이 필요합니다.", errorCode: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }

    const body = normalizeTutorsAssistantTtsClientBody(data);
    const personaId = safeId(body.personaId);
    const sessionId = safeId(body.sessionId);
    const assistantClientId = safeId(body.assistantClientId);
    if (!personaId || !sessionId || !assistantClientId || !body.mode) {
      return NextResponse.json(
        { error: "personaId, sessionId, assistantClientId, mode가 필요합니다.", errorCode: "TUTORS_ASSISTANT_TTS_BODY_INVALID" },
        { status: 400 },
      );
    }

    const jobPolicy = getDefaultTutorsAssistantTtsJobPolicy();
    const voicePolicy = getDefaultTutorsAssistantTtsVoicePolicy();
    const persona = await getTutorPersonaForPrompt(user, personaId).catch(() => null);
    const selectedVoiceId = resolveSelectedVoiceId(persona, voicePolicy.voiceAllowlist);

    const messageRef = {
      userId: serverUserId,
      personaId,
      userPersonaId: TUTORS_NAMESPACE_KEY,
      sessionId,
      assistantClientId,
    };

    const result = await createTutorsAssistantTtsJob(
      {
        policy: jobPolicy,
        voicePolicy,
        uid,
        mode: body.mode,
        messageRef,
        selectedVoiceId,
        format: "mp3",
        speed: body.speed,
        consentVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
      },
      {
        loadAssistantMessage: async (ref) => await loadTutorsAssistantMessageForTts(ref),
        countDailyJobs: async ({ uid: uidValue, now }) => await countTutorsAssistantTtsJobsForUidDay({ uid: uidValue, now }),
        findJobByOperationKey: async (key) => await findTutorsAssistantTtsJobByOperationKey(key),
        createJob: async (record) => await createTutorsAssistantTtsJobRecord(record),
        resolveReadyAudio: async (job) => {
          const message = await loadTutorsAssistantMessageForTts(job.messageRef);
          const audioMeta = toUnknownRecord(message?.audioMeta);
          const playback = await getExistingVoiceAssetPlaybackUrl(audioMeta.storage);
          if (!playback?.url) return null;
          return { audioUrl: playback.url, audioMeta };
        },
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Tutors 음성 응답은 현재 텍스트 전용입니다.",
          errorCode: result.errorCode,
          fallback: result.fallback,
          reasonCode: result.reasonCode,
        },
        { status: result.status },
      );
    }
    if (result.status === 200) {
      return NextResponse.json(
        { jobId: result.jobId, status: result.jobStatus, audioUrl: result.audioUrl, audioMeta: result.audioMeta },
        { status: 200 },
      );
    }
    return NextResponse.json({ jobId: result.jobId, status: result.jobStatus }, { status: 202 });
  }, 15000);
}

export const POST = withAuth(postHandler, undefined, "tutors/assistant-tts/jobs:post", { bodyParser: "json" });
