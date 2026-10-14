import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { listRecentPolicyReleaseEvents, type PolicyReleaseEventKind } from "libs/database/legal/policyReleaseEventRepo";

export const runtime = "nodejs";

const EVENT_KINDS: readonly PolicyReleaseEventKind[] = [
  "deployed_observed",
  "notice_observed",
  "activation_observed",
  "mismatch",
  "hold_set",
  "hold_released",
  "run_failed",
];
const EVENT_KIND_SET = new Set<string>(EVENT_KINDS);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type EventQuery = { limit: number; kinds?: PolicyReleaseEventKind[] };

function parseEventQuery(request: NextRequest): EventQuery | null {
  const params = new URL(request.url).searchParams;
  const rawLimits = params.getAll("limit");
  if (rawLimits.length > 1) return null;

  let limit = DEFAULT_LIMIT;
  if (rawLimits.length === 1) {
    const rawLimit = rawLimits[0];
    if (!/^[1-9]\d*$/.test(rawLimit)) return null;
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit > MAX_LIMIT) return null;
  }

  const rawKinds = params.getAll("kinds");
  if (rawKinds.length > 1) return null;
  if (rawKinds.length === 0) return { limit };

  const kinds = rawKinds[0].split(",").map((kind) => kind.trim());
  if (kinds.length === 0 || kinds.some((kind) => !kind || !EVENT_KIND_SET.has(kind))) return null;
  return { limit, kinds: [...new Set(kinds)] as PolicyReleaseEventKind[] };
}

/**
 * @docHint
 * @purpose 관리자에게 정책 릴리스 검증 이벤트의 최소 표시 필드를 제공한다.
 * @process 관리자 권한 확인  query 검증  최근 이벤트 조회  민감하지 않은 표시 필드만 JSON 반환
 * @domain legal-policy
 * @scope admin-api
 */
async function getHandler(_data: Record<string, unknown>, _user: AuthenticatedUserType, request: NextRequest) {
  const query = parseEventQuery(request);
  if (!query) {
    return NextResponse.json(
      { ok: false, error: "이벤트 조회 조건이 올바르지 않습니다.", errorCode: "INVALID_INPUT" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const events = await listRecentPolicyReleaseEvents(query);
  return NextResponse.json({
    ok: true,
    events: events.map(({ releaseId, kind, outcome, observedAt, lagMs, actor, detail }) => ({
      releaseId,
      kind,
      outcome,
      observedAt,
      lagMs,
      actor,
      detail,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAuth(getHandler, undefined, "admin/legal/policy-releases/events:get", { requireAdmin: true });
