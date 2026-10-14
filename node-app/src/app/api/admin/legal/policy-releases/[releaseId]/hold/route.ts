import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { releasePolicyReleaseHold } from "libs/database/legal/policyReleaseHoldRepo";
import { POLICY_RELEASE_POLICY_IDS, type PolicyReleasePolicyId } from "models/legal";

export const runtime = "nodejs";

const RELEASE_ID_PATTERN = /^[a-z-]+@\d+\.\d+\.\d+$/;

/**
 * @docHint
 * @purpose PRS-006 관리자가 정책 릴리스 hold를 해제한다.
 * @process 관리자 권한 확인  입력·releaseId 검증  hold 해제와 감사 이벤트 기록  JSON 응답 반환
 * @domain legal-policy
 * @scope admin-api
 */
async function postHandler(data: unknown, user: AuthenticatedUserType, _request: Request, context: NextRouteContext) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const keys = payload ? Object.keys(payload).sort() : [];
  const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
  if (
    !payload ||
    keys.length !== 2 ||
    keys[0] !== "active" ||
    keys[1] !== "reason" ||
    payload.active !== false ||
    reason.length < 1 ||
    reason.length > 500
  ) {
    return NextResponse.json({ ok: false, error: "유효하지 않은 hold 해제 요청입니다.", errorCode: "INVALID_INPUT" }, { status: 400 });
  }

  const releaseId = String(context?.params?.releaseId || "").trim();
  if (!RELEASE_ID_PATTERN.test(releaseId)) {
    return NextResponse.json({ ok: false, error: "유효한 releaseId가 필요합니다.", errorCode: "INVALID_INPUT" }, { status: 400 });
  }
  const policyId = releaseId.slice(0, releaseId.lastIndexOf("@"));
  if (!POLICY_RELEASE_POLICY_IDS.includes(policyId as PolicyReleasePolicyId)) {
    return NextResponse.json({ ok: false, error: "유효한 releaseId가 필요합니다.", errorCode: "INVALID_INPUT" }, { status: 400 });
  }

  const staffUserId = String(user?.ID || user?.uid || "").trim();
  if (!staffUserId) {
    return NextResponse.json({ ok: false, error: "관리자 식별자를 확인할 수 없습니다.", errorCode: "INVALID_INPUT" }, { status: 400 });
  }

  const result = await releasePolicyReleaseHold({
    releaseId,
    policyId: policyId as PolicyReleasePolicyId,
    reason,
    releasedBy: `admin:${staffUserId}`,
    requestId: randomUUID(),
    manifestRevision: null,
  });
  return NextResponse.json({ ok: true, changed: result.changed });
}

export const POST = withAuth(postHandler, undefined, "admin/legal/policy-releases/hold:post", {
  requireAdmin: true,
  bodyParser: "json",
});
