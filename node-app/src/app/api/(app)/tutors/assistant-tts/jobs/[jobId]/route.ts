import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import {
  findTutorsAssistantTtsJobById,
  loadTutorsAssistantMessageForTts,
  markTutorsAssistantTtsJobStatus,
} from "libs/database/conversations";
import { getExistingVoiceAssetPlaybackUrl } from "libs/server-utils/audio/voiceAssetStorage";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS job 상태 조회 API(소유자 전용)
 * @process 인증 → job 소유권 확인 → audioUrl/audioMeta 상태 조회
 * @domain tutors-tts
 * @scope api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(_data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const uid = String(toUnknownRecord(user).uid || toUnknownRecord(user).ID || "").trim();
  if (!uid) return NextResponse.json({ error: "로그인이 필요합니다.", errorCode: "AUTH_REQUIRED" }, { status: 401 });

  const jobId = String(ctx?.params?.jobId || "").trim();
  if (!jobId) return NextResponse.json({ error: "jobId가 필요합니다.", errorCode: "TUTORS_ASSISTANT_TTS_JOB_ID_REQUIRED" }, { status: 400 });

  const job = await findTutorsAssistantTtsJobById(jobId);
  if (!job || job.uid !== uid) {
    return NextResponse.json({ error: "job을 찾을 수 없습니다.", errorCode: "TUTORS_ASSISTANT_TTS_JOB_NOT_FOUND" }, { status: 404 });
  }

  if (job.status === "succeeded") {
    const message = await loadTutorsAssistantMessageForTts(job.messageRef);
    const audioMeta = toUnknownRecord(message?.audioMeta);
    const playback = await getExistingVoiceAssetPlaybackUrl(audioMeta.storage);
    return NextResponse.json(
      {
        jobId: job.jobId,
        status: job.status,
        ...(playback?.url ? { audioUrl: playback.url, audioMeta } : {}),
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      jobId: job.jobId,
      status: job.status,
      ...(job.status === "failed" || job.status === "unknown_outcome"
        ? { errorCode: job.status === "unknown_outcome" ? "TUTORS_ASSISTANT_TTS_UNKNOWN_OUTCOME" : "TUTORS_ASSISTANT_TTS_FAILED" }
        : {}),
    },
    { status: 200 },
  );
}

export const GET = withAuth(handleGET, undefined, "tutors/assistant-tts/jobs:getOne");

/**
 * H3: queued 단계 취소. 소유자 본인·queued에서만 cancelled로 전이한다.
 * 이미 provider 호출이 시작된 running 이후는 취소할 수 없고(409), 무과금을 약속하지 않는다.
 */
async function handlePOST(data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const uid = String(toUnknownRecord(user).uid || toUnknownRecord(user).ID || "").trim();
  if (!uid) return NextResponse.json({ error: "로그인이 필요합니다.", errorCode: "AUTH_REQUIRED" }, { status: 401 });

  const jobId = String(ctx?.params?.jobId || "").trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId가 필요합니다.", errorCode: "TUTORS_ASSISTANT_TTS_JOB_ID_REQUIRED" }, { status: 400 });
  }
  const action = String(toUnknownRecord(data).action || "").trim();
  if (action !== "cancel") {
    return NextResponse.json({ error: "지원하지 않는 동작입니다.", errorCode: "TUTORS_ASSISTANT_TTS_ACTION_INVALID" }, { status: 400 });
  }

  const job = await findTutorsAssistantTtsJobById(jobId);
  if (!job || job.uid !== uid) {
    return NextResponse.json({ error: "job을 찾을 수 없습니다.", errorCode: "TUTORS_ASSISTANT_TTS_JOB_NOT_FOUND" }, { status: 404 });
  }
  if (job.status !== "queued") {
    return NextResponse.json(
      { error: "이미 시작된 작업은 취소할 수 없습니다.", errorCode: "TUTORS_ASSISTANT_TTS_NOT_CANCELLABLE", status: job.status },
      { status: 409 },
    );
  }

  const { matched } = await markTutorsAssistantTtsJobStatus({ jobId, status: "cancelled" });
  if (Number(matched) <= 0) {
    return NextResponse.json(
      { error: "이미 시작된 작업은 취소할 수 없습니다.", errorCode: "TUTORS_ASSISTANT_TTS_NOT_CANCELLABLE", status: job.status },
      { status: 409 },
    );
  }
  return NextResponse.json({ jobId, status: "cancelled" }, { status: 200 });
}

export const POST = withAuth(handlePOST, undefined, "tutors/assistant-tts/jobs:cancel", { bodyParser: "json" });
