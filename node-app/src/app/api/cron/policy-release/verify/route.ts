/**
 * @docHint
 * @purpose 전용 secret으로 정책 릴리스 정합성 검증을 실행한다.
 * @process 입력·secret 검증  Redis 중복 실행 차단  검증 실행·잠금 해제
 * @domain legal-policy
 * @scope policy-release-cron
 */

import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { POLICY_RELEASE_CRON_SECRET } from "consts/env/server";
import { getPolicyReleaseRuntime } from "libs/server-utils/legal/policyReleaseRuntime";
import {
  PolicyReleaseVerificationError,
  runPolicyReleaseVerification,
  type PolicyReleaseVerificationInput,
} from "libs/server-utils/legal/policyReleaseVerification";
import { getRedisClient } from "libs/cache/redisClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCK_KEY = "policy-release:verify:lock";
const LOCK_TTL_MS = 600_000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const RUN_ID_PATTERN = /^[A-Za-z0-9._:-]{8,64}$/;

type CronRouteDependencies = {
  secret?: string;
  getRuntime?: typeof getPolicyReleaseRuntime;
  getRedis?: typeof getRedisClient;
  verify?: typeof runPolicyReleaseVerification;
};

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseInput(value: unknown): PolicyReleaseVerificationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.runId !== "string" || !RUN_ID_PATTERN.test(record.runId)) return null;
  if (!Number.isInteger(record.attempt) || Number(record.attempt) < 1 || Number(record.attempt) > 3) return null;
  if (record.mode !== "daily" && record.mode !== "deploy") return null;
  if (typeof record.trigger !== "string" || record.trigger.length > 120) return null;
  return {
    runId: record.runId,
    attempt: Number(record.attempt),
    mode: record.mode,
    trigger: record.trigger,
  };
}

export async function handlePolicyReleaseVerificationPost(
  request: NextRequest,
  dependencies: CronRouteDependencies = {},
): Promise<NextResponse> {
  const secret = dependencies.secret === undefined ? POLICY_RELEASE_CRON_SECRET : dependencies.secret;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET_NOT_CONFIGURED" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED_CRON" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let input: PolicyReleaseVerificationInput | null;
  try {
    input = parseInput(await request.json());
  } catch {
    input = null;
  }
  if (!input) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if ((dependencies.getRuntime ?? getPolicyReleaseRuntime)().mode === "legacy") {
    return NextResponse.json({ ok: true, mode: "legacy", skipped: true }, { headers: NO_STORE_HEADERS });
  }

  const owner = `${input.runId}#${input.attempt}`;
  let redis;
  try {
    redis = await (dependencies.getRedis ?? getRedisClient)();
    const result = await redis.set(LOCK_KEY, owner, "PX", LOCK_TTL_MS, "NX");
    if (result !== "OK") {
      return NextResponse.json({ ok: false, error: "RUN_LOCKED" }, { status: 409, headers: NO_STORE_HEADERS });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "LOCK_UNAVAILABLE" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const summary = await (dependencies.verify ?? runPolicyReleaseVerification)(input);
    if (summary.skipped) {
      return NextResponse.json({ ok: true, mode: "legacy", skipped: true }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({
      ok: true,
      mode: "manifest",
      runMode: input.mode,
      summary: {
        compared: summary.compared ?? 0,
        onceRecorded: summary.onceRecorded ?? 0,
        mismatches: summary.mismatches ?? 0,
        holdsSet: summary.holdsSet ?? 0,
        warnings: summary.warnings ?? 0,
      },
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof PolicyReleaseVerificationError) {
      return NextResponse.json({ ok: false, error: error.errorCode }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    console.error("[policy-release-cron] verification failed");
    return NextResponse.json({ ok: false, error: "POLICY_RELEASE_VERIFICATION_FAILED" }, { status: 500, headers: NO_STORE_HEADERS });
  } finally {
    try {
      await redis.eval(
        `local value = redis.call("GET", KEYS[1]); if value == ARGV[1] then return redis.call("DEL", KEYS[1]) end; return 0`,
        1,
        LOCK_KEY,
        owner,
      );
    } catch {
      console.error("[policy-release-cron] lock release failed");
    }
  }
}

export async function POST(request: NextRequest) {
  return handlePolicyReleaseVerificationPost(request);
}
