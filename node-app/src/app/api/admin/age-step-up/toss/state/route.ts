import { NextResponse } from "next/server";
import { AGE_ASSURANCE_FEATURE_KEYS } from "consts/system/featureRollout";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  deleteAgeAssuranceState,
  getAgeAssuranceState,
} from "libs/server-utils/identity/ageAssurance/ageAssuranceService";
import { ageAssuranceErrorResponse } from "../routeError";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getHandler(_data: unknown, user: AuthenticatedUserType) {
  try {
    return NextResponse.json(await getAgeAssuranceState(user));
  } catch (error) {
    return ageAssuranceErrorResponse(error);
  }
}

async function deleteHandler(_data: unknown, user: AuthenticatedUserType) {
  try {
    return NextResponse.json(await deleteAgeAssuranceState(user));
  } catch (error) {
    return ageAssuranceErrorResponse(error);
  }
}

export const GET = withAuth(getHandler, undefined, "admin/age-step-up/toss/state:get", {
  requireAdmin: true,
  featureAccess: AGE_ASSURANCE_FEATURE_KEYS.stepUp,
  bodyParser: "none",
});

export const DELETE = withAuth(deleteHandler, undefined, "admin/age-step-up/toss/state:delete", {
  requireAdmin: true,
  featureAccess: AGE_ASSURANCE_FEATURE_KEYS.stepUp,
  bodyParser: "none",
});
