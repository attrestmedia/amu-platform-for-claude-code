import { NextResponse } from "next/server";
import { AGE_ASSURANCE_FEATURE_KEYS } from "consts/system/featureRollout";
import {
  isAgeStepUpMockScenario,
  type AgeStepUpMockResponse,
} from "consts/system/ageStepUpMock";
import { dispatchAgeStepUpMockVerification } from "libs/server-utils/auth/ageStepUpMockVerifier";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Admin-only synthetic step-up mock 요청 처리
 * @process 서버 인증·feature gate  scenario 검증  비저장 synthetic 응답
 * @domain identity
 * @scope server-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function validatePostBody(data: UnknownRecord) {
  if (!isAgeStepUpMockScenario(data?.scenario)) {
    return { valid: false, error: "지원하지 않는 모의 시나리오입니다." };
  }
  return { valid: true };
}

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType) {
  const result = await dispatchAgeStepUpMockVerification({ user, scenario: data?.scenario });
  return NextResponse.json({ ok: true, result } satisfies AgeStepUpMockResponse);
}

export const POST = withAuth(postHandler, validatePostBody, "admin/age-step-up/mock:post", {
  requireAdmin: true,
  featureAccess: AGE_ASSURANCE_FEATURE_KEYS.stepUp,
  bodyParser: "json",
});
