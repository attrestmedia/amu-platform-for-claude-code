import { NextResponse } from "next/server";
import { AGE_ASSURANCE_FEATURE_KEYS } from "consts/system/featureRollout";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { completeAgeAssurance } from "libs/server-utils/identity/ageAssurance/ageAssuranceService";
import { ageAssuranceErrorResponse } from "../routeError";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function validateCompleteBody(data: UnknownRecord) {
  return typeof data?.attemptId === "string" && data.attemptId.trim().length > 0 && data.attemptId.length <= 128
    ? { valid: true }
    : { valid: false, error: "인증 시도 식별자가 필요합니다." };
}

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType) {
  try {
    // Client supplied outcome, eligibility, txId, and other fields are intentionally ignored.
    return NextResponse.json(await completeAgeAssurance(user, data?.attemptId));
  } catch (error) {
    return ageAssuranceErrorResponse(error);
  }
}

export const POST = withAuth(postHandler, validateCompleteBody, "admin/age-step-up/toss/complete", {
  requireAdmin: true,
  featureAccess: AGE_ASSURANCE_FEATURE_KEYS.stepUp,
  bodyParser: "json",
});
