import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { estimateStudioAudio, getStudioAudioCatalog } from "libs/server-utils/lab/studioAudioEstimate";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safe(value: unknown) {
  return String(value || "").trim();
}

function uidOf(user: AuthenticatedUserType) {
  return safe(user?.uid || user?.ID || user?.id);
}

function requestBody(data: unknown) {
  const body = toUnknownRecord(data);
  const nested = toUnknownRecord(body.request);
  return Object.keys(nested).length ? nested : body;
}

function errorStatus(errorCode: string) {
  if (errorCode === "UNAUTHORIZED") return 401;
  if (errorCode === "MODEL_DISABLED" || errorCode === "MODEL_NOT_SELECTABLE") return 403;
  if (errorCode === "COIN_INSUFFICIENT") return 402;
  if (
    errorCode === "SPEECH_MODEL_NOT_AVAILABLE" ||
    errorCode === "PROVIDER_CREDENTIAL_UNAVAILABLE" ||
    // enqueue의 assertPricingConfigured와 같은 fail-closed다.
    errorCode === "PRICING_NOT_FOUND"
  ) {
    return 503;
  }
  return 400;
}

/** 무과금 카탈로그 조회 — 승인 Voice·모델·속도 범위·상한. 서버 판정값만 내려보낸다. */
async function handleGET(_data: unknown, user: AuthenticatedUserType, _request: NextRequest) {
  const uid = uidOf(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({ ok: true, data: getStudioAudioCatalog() });
}

/** 무과금 견적 — server 가격 snapshot. 예약·queue·과금을 수행하지 않는다. */
async function handlePOST(data: unknown, user: AuthenticatedUserType, _request: NextRequest) {
  const uid = uidOf(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const result = await estimateStudioAudio({ request: requestBody(data), uid });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, errorCode: result.errorCode },
      { status: errorStatus(result.errorCode) },
    );
  }
  return NextResponse.json({ ok: true, data: result.data });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-audio-estimate:get", { bodyParser: "none" });
export const POST = withAuth(handlePOST, undefined, "lab/studio-audio-estimate:post", { bodyParser: "json" });
