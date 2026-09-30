import { NextRequest, NextResponse } from "next/server";
import { estimateStudioAudio } from "libs/server-utils/lab/studioAudioEstimate";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_AUDIO_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ENDPOINT = "ai/agent/gen-studio-audio-estimate";

function safe(value: unknown) {
  return String(value ?? "").trim();
}

/** EL-502 UI 견적 라우트와 동일한 status 매핑을 쓴다(agent 경로에서도 같은 fail-closed). */
function audioAgentErrorStatus(errorCode: string) {
  if (errorCode === "UNAUTHORIZED") return 401;
  if (errorCode === "MODEL_DISABLED" || errorCode === "MODEL_NOT_SELECTABLE") return 403;
  if (errorCode === "COIN_INSUFFICIENT") return 402;
  if (
    errorCode === "PRICING_NOT_FOUND" ||
    errorCode === "SPEECH_MODEL_NOT_AVAILABLE" ||
    errorCode === "PROVIDER_CREDENTIAL_UNAVAILABLE"
  ) {
    return 503;
  }
  if (errorCode === "IDEMPOTENCY_CONFLICT") return 409;
  return 400;
}

/** route는 입력 형식만 본다. 승인 voice·template·locale·speed·가격 검증은 도메인 함수가 소유한다. */
function validateAudioAgentBody(data: unknown) {
  const body = toUnknownRecord(data);
  if (body.modality !== "audio") return { valid: false as const, error: "modality_invalid" };
  if (!safe(body.clientRequestId)) return { valid: false as const, error: "clientRequestId_required" };
  const text = String(body.text ?? "");
  if (!text.trim()) return { valid: false as const, error: "text_required" };
  if (text.length > AGENT_AUDIO_POLICY.maxTextChars) return { valid: false as const, error: "text_too_long" };
  return { valid: true as const };
}

/**
 * @docHint
 * @purpose Agent/MCP 무과금 audio 견적(서버 가격 snapshot)
 * @process agent key(genstudio:audio:read) -> fail-closed rate limit -> 입력 형식 검증 -> estimateStudioAudio(enqueue와 동일 가격 preflight) -> {ok,error,errorCode}
 * @domain gen-studio
 * @scope agent-api
 */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:audio:read" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: `${ENDPOINT}:estimate`,
      limitPerMinute: AGENT_AUDIO_POLICY.maxEstimateRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });
    const body = await request.json().catch(() => null);
    const validation = validateAudioAgentBody(body);
    if (!validation.valid) return NextResponse.json({ ok: false, error: validation.error, errorCode: "INVALID_INPUT" }, { status: 400 });

    // 요청 본문의 scope·visibility·uid를 신뢰하지 않고 서버가 user/private로 고정한다.
    const result = await estimateStudioAudio({
      request: { ...toUnknownRecord(body), scope: "user", visibility: "private", uid: auth.uid },
      uid: auth.uid,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status: audioAgentErrorStatus(result.errorCode) });
    }
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to estimate audio job" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
