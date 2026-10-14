import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getOverseasTransferRefusalStatus,
  OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS,
  recordOverseasTransferRefusal,
  withdrawOverseasTransferRefusal,
} from "libs/server-utils/auth/overseasTransferRefusalService";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose ElevenLabs 국외 이전 거부 상태 조회·거부·철회 API
 * @process 인증 UID 확인  처리자 키 allowlist 검증  서버 시각으로 거부 이력 저장
 * @domain privacy-rights
 * @scope account-api
 */

type RequestBody = { processorKey?: unknown };
type AllowedProcessorKey = (typeof OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS)[number];

const noStoreHeaders = { "Cache-Control": "no-store" };

function identity(user: unknown) {
  const record = toUnknownRecord(user);
  return String(record.uid || record.ID || "").trim();
}

function isAllowedProcessorKey(value: unknown): value is AllowedProcessorKey {
  return typeof value === "string" && OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS.includes(value as AllowedProcessorKey);
}

function invalidProcessorKey() {
  return NextResponse.json({ ok: false, errorCode: "INVALID_PROCESSOR_KEY" }, { status: 400, headers: noStoreHeaders });
}

function unavailable() {
  return NextResponse.json(
    { ok: false, errorCode: "OVERSEAS_TRANSFER_REFUSAL_UNAVAILABLE" },
    { status: 503, headers: noStoreHeaders },
  );
}

function success(data: Awaited<ReturnType<typeof getOverseasTransferRefusalStatus>>) {
  return NextResponse.json({ ok: true, data }, { headers: noStoreHeaders });
}

async function handleGET(_data: unknown, user: unknown, request: NextRequest) {
  const processorKey = request.nextUrl.searchParams.get("processorKey");
  if (!isAllowedProcessorKey(processorKey)) return invalidProcessorKey();

  try {
    return success(await getOverseasTransferRefusalStatus({ uid: identity(user), processorKey }));
  } catch {
    return unavailable();
  }
}

async function handlePOST(data: RequestBody, user: unknown) {
  if (!isAllowedProcessorKey(data?.processorKey)) return invalidProcessorKey();

  try {
    return success(await recordOverseasTransferRefusal({ uid: identity(user), processorKey: data.processorKey }));
  } catch {
    return unavailable();
  }
}

async function handleDELETE(data: RequestBody, user: unknown) {
  if (!isAllowedProcessorKey(data?.processorKey)) return invalidProcessorKey();

  try {
    return success(await withdrawOverseasTransferRefusal({ uid: identity(user), processorKey: data.processorKey }));
  } catch {
    return unavailable();
  }
}

const options = { allowStalePolicyConsent: true } as const;
export const GET = withAuth(handleGET, undefined, "account:overseas-transfer-refusal:get", {
  ...options,
  bodyParser: "none",
});
export const POST = withAuth<RequestBody>(handlePOST, undefined, "account:overseas-transfer-refusal:update", {
  ...options,
  bodyParser: "json",
});
export const DELETE = withAuth<RequestBody>(handleDELETE, undefined, "account:overseas-transfer-refusal:withdraw", {
  ...options,
  bodyParser: "json",
});
