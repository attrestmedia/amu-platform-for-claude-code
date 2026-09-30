import { NextResponse } from "next/server";
import { ELEVENLABS_API_BASE_URL } from "libs/server-utils/audio/providers/elevenlabsSpeech";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { logger } from "utils/log";
import { extractCodedError } from "utils/common";

/**
 * @docHint
 * @purpose 계정 ElevenLabs voice 목록 조회 대행 (승인 목록 작성용)
 * @process 관리자 인증 → DB 자격증명 주입 → GET /v1/voices → 화이트리스트 필드만 반환
 * @domain system-control
 * @scope admin-api
 *
 * EL-004/EL-303. 승인 목록(ELEVENLABS_APPROVED_VOICE_CATALOG)에 넣을 voiceId·요율·권리를 확인하기 위한
 * **조회 전용** 경로다. voiceId는 계정에 귀속된 opaque 값이라 추측할 수 없고, 요율(credit multiplier)은
 * Library 공유 voice에만 붙으므로 category를 함께 봐야 한다.
 *
 * - 크레딧을 소비하지 않는다. 합성은 하지 않고 목록만 읽는다.
 * - API key는 서버 밖으로 나가지 않는다. 응답에 자격증명을 담지 않는다.
 * - provider 응답을 그대로 흘리지 않고 **화이트리스트 필드만** 옮긴다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ElevenLabsVoice = {
  voice_id?: unknown;
  name?: unknown;
  category?: unknown;
  labels?: unknown;
  description?: unknown;
  preview_url?: unknown;
  sharing?: unknown;
};

function toText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * 요율 관련 값은 provider 응답 구조가 확정되지 않았다(추정). 있으면 옮기고 없으면 null로 둔다.
 * **없는 것을 1로 채우지 않는다** — 확인하지 못한 요율을 표준 요율로 위장하면 안 된다.
 */
function readRate(sharing: unknown): number | null {
  if (!sharing || typeof sharing !== "object") return null;
  const record = sharing as Record<string, unknown>;
  for (const key of ["rate", "voice_rate", "credit_multiplier"]) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

async function getHandler() {
  try {
    const { payload } = await resolvePlatformCredential("ai.elevenlabs.default");
    const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices`, {
      headers: { "xi-api-key": String(payload.apiKey || ""), Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      logger.warn("[speech-voices] upstream error", { status: response.status });
      return NextResponse.json(
        { ok: false, errorCode: `UPSTREAM_HTTP_${response.status}`, error: "voice 목록을 조회하지 못했습니다." },
        { status: 502 },
      );
    }

    const body = (await response.json().catch(() => null)) as { voices?: unknown } | null;
    const raw = Array.isArray(body?.voices) ? (body?.voices as ElevenLabsVoice[]) : [];
    const voices = raw.map((voice) => {
      const category = toText(voice.category, 40).toLowerCase();
      const rate = readRate(voice.sharing);
      return {
        voiceId: toText(voice.voice_id, 128),
        name: toText(voice.name, 120),
        category,
        // 승인 목록은 premade만 허용한다(요율·유료 전용 제한을 구조적으로 회피).
        allowlistEligible: category === "premade" && rate === null,
        labels: voice.labels && typeof voice.labels === "object" ? (voice.labels as Record<string, unknown>) : {},
        description: toText(voice.description, 300),
        previewUrl: toText(voice.preview_url, 500),
        /** null이면 "확인하지 못했다"이며 표준 요율(1)을 뜻하지 않는다. */
        observedRate: rate,
      };
    });

    return NextResponse.json({ ok: true, count: voices.length, voices });
  } catch (error: unknown) {
    const { message, errorCode, status } = extractCodedError(error);
    logger.error("[speech-voices] failed", { message, errorCode });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status: status || 500 });
  }
}

export const GET = withAuth(getHandler, undefined, "admin/speech-voices:get", {
  requireAdmin: true,
  bodyParser: "none",
});
