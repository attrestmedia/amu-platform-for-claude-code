import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getVoiceDataPurposeConsentStatus,
  getQwenPurposeConsentStatus,
  recordQwenPurposeConsent,
  recordVoiceDataPurposeConsent,
  revokeQwenPurposeConsent,
  revokeVoiceDataPurposeConsent,
} from "libs/server-utils/auth/purposeConsentService";
import {
  QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS,
  VOICE_DATA_CONSENT_PURPOSE_ID,
  type QwenPersistedPurposeConsentId,
} from "consts/legal/voiceDataConsent";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 기존 회원의 Tutors 원음 이해 목적별 동의·재동의·철회 API
 * @process 서버 인증 UID·이메일 확인  purposeConsents 저장 동의 조회  철회 시각 기록
 * @domain privacy-consent
 * @scope account-api
 */

function identity(user: unknown) {
  const record = toUnknownRecord(user);
  return {
    uid: String(record.uid || record.ID || ""),
    email: String(record.userEmail || record.user_email || "").trim().toLowerCase(),
  };
}

function isQwenPurposeId(value: unknown): value is QwenPersistedPurposeConsentId {
  return QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS.includes(value as QwenPersistedPurposeConsentId);
}

async function handleGET(_data: unknown, user: unknown, request: NextRequest) {
  const purposeId = request.nextUrl.searchParams.get("purposeId");
  if (isQwenPurposeId(purposeId)) {
    return NextResponse.json({
      ok: true,
      consent: await getQwenPurposeConsentStatus({ ...identity(user), purposeId }),
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (purposeId && purposeId !== VOICE_DATA_CONSENT_PURPOSE_ID) {
    return NextResponse.json({ ok: false, errorCode: "PURPOSE_ID_INVALID" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, consent: await getVoiceDataPurposeConsentStatus(identity(user)) }, { headers: { "Cache-Control": "no-store" } });
}

type ConsentBody = { agreed?: boolean; purposeId?: string };

async function handlePOST(data: ConsentBody, user: unknown) {
  if (isQwenPurposeId(data.purposeId)) {
    return NextResponse.json({
      ok: true,
      consent: await recordQwenPurposeConsent({ ...identity(user), purposeId: data.purposeId, agreed: data.agreed === true }),
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (data.purposeId && data.purposeId !== VOICE_DATA_CONSENT_PURPOSE_ID) {
    return NextResponse.json({ ok: false, errorCode: "PURPOSE_ID_INVALID" }, { status: 400 });
  }
  if (data.agreed !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "원음 이해 목적 동의를 확인해 주세요.",
        errorCode: "VOICE_DATA_CONSENT_REQUIRED",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, consent: await recordVoiceDataPurposeConsent(identity(user)) }, { headers: { "Cache-Control": "no-store" } });
}

async function handleDELETE(_data: unknown, user: unknown, request: NextRequest) {
  const purposeId = request.nextUrl.searchParams.get("purposeId");
  if (isQwenPurposeId(purposeId)) {
    return NextResponse.json({
      ok: true,
      consent: await revokeQwenPurposeConsent({ ...identity(user), purposeId }),
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (purposeId && purposeId !== VOICE_DATA_CONSENT_PURPOSE_ID) {
    return NextResponse.json({ ok: false, errorCode: "PURPOSE_ID_INVALID" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, consent: await revokeVoiceDataPurposeConsent(identity(user)) }, { headers: { "Cache-Control": "no-store" } });
}

const options = { allowStalePolicyConsent: true } as const;
export const GET = withAuth(handleGET, undefined, "account:voice-data-consent:get", {
  ...options,
  bodyParser: "none",
});
export const POST = withAuth<ConsentBody>(handlePOST, undefined, "account:voice-data-consent:update", {
  ...options,
  bodyParser: "json",
});
export const DELETE = withAuth(handleDELETE, undefined, "account:voice-data-consent:revoke", {
  ...options,
  bodyParser: "none",
});
