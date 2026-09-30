import { NextRequest, NextResponse } from "next/server";
import { enqueueStudioAudioJob, listStudioAudioJobsForUser } from "libs/server-utils/lab/studioAudioJobQueue";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_AUDIO_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { extractCodedError } from "utils/common";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ENDPOINT = "ai/agent/gen-studio-audio-jobs";

function safe(value: unknown) {
  return String(value ?? "").trim();
}

function parseIds(raw: string | null) {
  return Array.from(new Set(String(raw || "").split(",").map(safe).filter(Boolean))).slice(0, 20);
}

function errorStatus(errorCode: string) {
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

function validateAudioAgentBody(data: unknown) {
  const body = toUnknownRecord(data);
  if (body.modality !== "audio") return { valid: false as const, error: "modality_invalid" };
  if (!safe(body.clientRequestId)) return { valid: false as const, error: "clientRequestId_required" };
  const text = String(body.text ?? "");
  if (!text.trim()) return { valid: false as const, error: "text_required" };
  if (text.length > AGENT_AUDIO_POLICY.maxTextChars) return { valid: false as const, error: "text_too_long" };
  return { valid: true as const };
}

/** 목록은 video list와 같이 compact transport만 돌려준다(자산은 id만). */
function toAgentAudioJobSummary(job: {
  jobId: string;
  status: string;
  provider: string;
  modelName: string;
  segmentCount: number;
  completedSegments: number[];
  billing: Record<string, unknown>;
  assets: Array<{ assetId: string }>;
  error: { code?: string; message?: string } | null;
}) {
  const billing = job.billing || {};
  return {
    jobId: job.jobId,
    status: job.status,
    provider: job.provider,
    modelName: job.modelName,
    segmentCount: job.segmentCount,
    completedSegments: job.completedSegments || [],
    estimatedCoins: Number(billing.estimatedCoins || 0),
    actualCoins: Number(billing.actualCoins || 0),
    refundedCoins: Number(billing.refundedCoins || 0),
    pricingRevision: safe(billing.pricingRevision),
    reconciliationRequired: Boolean(billing.reconciliationRequired),
    assets: (job.assets || []).map((asset) => asset.assetId),
    errorCode: job.error?.code,
    errorMessage: job.error?.message,
  };
}

/**
 * @docHint
 * @purpose Agent/MCP 생성 job 목록(소유자 한정)
 * @process agent key(genstudio:audio:read) -> fail-closed rate limit -> listStudioAudioJobsForUser(uid 필터) -> compact transport
 * @domain gen-studio
 * @scope agent-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:audio:read" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: `${ENDPOINT}:read`,
      limitPerMinute: AGENT_AUDIO_POLICY.maxReadRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });
    const requestedJobIds = parseIds(request.nextUrl.searchParams.get("jobIds"));
    const jobs = await listStudioAudioJobsForUser({
      uid: auth.uid,
      jobIds: requestedJobIds.length ? requestedJobIds : undefined,
      limit: Number(request.nextUrl.searchParams.get("limit") || 8),
    });
    const found = new Set(jobs.map((job) => job.jobId));
    const missing = requestedJobIds.filter((jobId) => !found.has(jobId));
    return NextResponse.json({ ok: true, data: { jobs: jobs.map(toAgentAudioJobSummary), missing } });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to read audio jobs" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

/**
 * @docHint
 * @purpose Agent/MCP audio 생성 예약·enqueue(과금)
 * @process agent key(genstudio:audio:generate, wildcard 거부) -> fail-closed rate limit -> 입력 형식 검증 -> scope user 고정 -> enqueueStudioAudioJob -> 202/200
 * @domain gen-studio
 * @scope agent-api
 */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, {
      scope: "genstudio:audio:generate",
      allowWildcard: false,
      allowLegacyWildcard: true,
    });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: `${ENDPOINT}:generate`,
      limitPerMinute: AGENT_AUDIO_POLICY.maxRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });
    const body = await request.json().catch(() => null);
    const validation = validateAudioAgentBody(body);
    if (!validation.valid) return NextResponse.json({ ok: false, error: validation.error, errorCode: "INVALID_INPUT" }, { status: 400 });

    // 본문의 scope·visibility·uid를 신뢰하지 않는다 — 서버가 user/private로 고정한다.
    const result = await enqueueStudioAudioJob({
      request: { ...toUnknownRecord(body), scope: "user" },
      user: { uid: auth.uid, ID: auth.uid } as AuthenticatedUserType,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status: errorStatus(result.errorCode) });
    }
    return NextResponse.json({ ok: true, data: { job: result.job, reused: result.reused } }, { status: result.reused ? 200 : 202 });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to enqueue audio job" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
