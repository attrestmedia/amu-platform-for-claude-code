import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getSpeechRuntimeControls } from "libs/server-utils/system/speechRuntimeControls";
import { buildTutorsSttPolicyFromControls } from "libs/server-utils/audio/tutorsOpenAiStt";
import {
  TUTORS_STT_ALLOWED_LANGUAGES,
  TUTORS_STT_DISCLOSURE_VERSION,
  TUTORS_STT_NOTICE,
} from "consts/legal/tutorsSttDisclosure";

/**
 * @docHint
 * @purpose API 라우트((app) / tutors / stt-status) — 서버 STT 활성 상태·고지 조회
 * @process 인증  런타임 컨트롤 조회  정책 구성  노출 상태·고지 반환
 * @domain tutors
 * @scope api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(_data: unknown, user: unknown) {
  const controls = await getSpeechRuntimeControls();
  const policy = buildTutorsSttPolicyFromControls(controls, user);
  return NextResponse.json(
    {
      ok: true,
      enabled: policy.capabilityEnabled === true,
      disclosureVersion: TUTORS_STT_DISCLOSURE_VERSION,
      notice: TUTORS_STT_NOTICE,
      languages: TUTORS_STT_ALLOWED_LANGUAGES,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withAuth(handleGET, undefined, "tutors/stt-status:get", { bodyParser: "none" });
