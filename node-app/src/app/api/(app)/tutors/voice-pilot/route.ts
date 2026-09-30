import { NextRequest, NextResponse } from "next/server";
import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import { ELEVENLABS_APPROVED_VOICE_CATALOG } from "consts/ai/voiceCatalog";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  loadTutorsVoicePilotConfig,
  resolveTutorsVoicePilotBaselineFromConfig,
  resolveTutorsVoicePilotSurface,
} from "libs/server-utils/tutors/tutorsVoicePilotContract";

/**
 * @docHint
 * @purpose EL-603 Voice 파일럿 surface 조회(사용자 읽기 전용)
 * @process 인증 → 서버 설정 로드 → 노출 surface 판정 → additive 응답
 * @domain tutors-voice-pilot
 * @scope api
 *
 * 설정 미비/장애 시 default deny(`denied`·빈 목록)다. 실제 cohort 노출·계측 수집은 사용자 게이트 후.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const universeId = new URL(request.url).searchParams.get("universeId")?.trim() || "";
  const uid = String((user as { uid?: unknown; ID?: unknown })?.uid || (user as { ID?: unknown })?.ID || "").trim();
  const config = await loadTutorsVoicePilotConfig();
  const surface = resolveTutorsVoicePilotSurface({
    config,
    uid,
    universeId,
    // 서버가 시행 중인 동의 버전을 서버 값으로 주입한다(클라이언트 주장 아님).
    consentVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
    catalog: ELEVENLABS_APPROVED_VOICE_CATALOG,
  });
  const baseline = resolveTutorsVoicePilotBaselineFromConfig(config);

  return NextResponse.json(
    {
      ok: true,
      data: {
        exposure: surface.exposed ? "allowed" : "denied",
        reasonCode: surface.reasonCode,
        exposableVoices: surface.voices,
        metricsRecordingEnabled: surface.metricsRecordingEnabled,
        recordingEnabled: surface.recordingEnabled,
        analysisExposed: surface.analysisExposed,
        ttsModel: String(config.ttsModel || ""),
        baseline: { status: baseline.status },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withAuth(handleGET, undefined, "tutors/voice-pilot:read", {
  bodyParser: "none",
});
