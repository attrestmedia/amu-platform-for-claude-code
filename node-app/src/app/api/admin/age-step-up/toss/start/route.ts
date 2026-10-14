import { NextResponse } from "next/server";
import { AGE_ASSURANCE_FEATURE_KEYS } from "consts/system/featureRollout";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { startAgeAssurance } from "libs/server-utils/identity/ageAssurance/ageAssuranceService";
import { ageAssuranceErrorResponse } from "../routeError";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function validateStartBody(data: UnknownRecord) {
  return data && typeof data === "object" && !Array.isArray(data)
    ? { valid: true }
    : { valid: false, error: "요청 형식이 올바르지 않습니다." };
}

async function postHandler(_data: UnknownRecord, user: AuthenticatedUserType, request: Request) {
  try {
    return NextResponse.json(await startAgeAssurance(user, { origin: new URL(request.url).origin }));
  } catch (error) {
    return ageAssuranceErrorResponse(error);
  }
}

export const POST = withAuth(postHandler, validateStartBody, "admin/age-step-up/toss/start", {
  requireAdmin: true,
  featureAccess: AGE_ASSURANCE_FEATURE_KEYS.stepUp,
  bodyParser: "json",
});
