import "server-only";
import { AGE_ASSURANCE_FEATURE_KEYS } from "consts/system/featureRollout";
import { assertFeatureAccessOrThrow } from "libs/server-utils/auth/featureAccessPolicy";
import { isAgeAssuranceAdmin, resolveAgeAssuranceUid } from "libs/server-utils/identity/ageAssurance/ageAssuranceIdentity";
import { getAgeAssuranceStateModel } from "libs/server-utils/identity/ageAssurance/ageAssuranceRepository";
import type { AgeAssuranceEnvironment, AgeAssuranceOutcome } from "types/identity/ageAssurance";

export type AgeEligibilityReason =
  | "eligible"
  | "verification_required"
  | "verification_expired"
  | "ineligible_outcome"
  | "test_environment_admin_required";

export type AgeEligibilityDecision = { eligible: boolean; reason: AgeEligibilityReason };

type AgeEligibilityState = {
  outcome?: AgeAssuranceOutcome;
  environment?: AgeAssuranceEnvironment;
  expiresAt?: Date | string | null;
};

export type AgeEligibilityGateDeps = {
  assertFeatureAccess?: typeof assertFeatureAccessOrThrow;
  findState?: (uid: string) => Promise<AgeEligibilityState | null>;
  isAdmin?: (user: unknown) => boolean;
  isDevelopment?: () => boolean;
  now?: () => Date;
};

async function findStoredState(uid: string): Promise<AgeEligibilityState | null> {
  const Model = await getAgeAssuranceStateModel();
  return Model.findOne({ uid }).lean<AgeEligibilityState | null>();
}

export async function resolveAgeEligibility(
  args: { user: unknown; featureKey: string },
  deps: AgeEligibilityGateDeps = {},
): Promise<AgeEligibilityDecision> {
  await (deps.assertFeatureAccess ?? assertFeatureAccessOrThrow)({
    user: args.user,
    featureKey: args.featureKey,
  });

  const uid = resolveAgeAssuranceUid(args.user);
  if (!uid) return { eligible: false, reason: "verification_required" };

  const state = await (deps.findState ?? findStoredState)(uid);
  if (!state) return { eligible: false, reason: "verification_required" };

  const expiry = state.expiresAt instanceof Date ? state.expiresAt : new Date(state.expiresAt ?? "");
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= (deps.now?.() ?? new Date()).getTime()) {
    return { eligible: false, reason: "verification_expired" };
  }
  if (state.outcome !== "ADULT") return { eligible: false, reason: "ineligible_outcome" };
  if (
    state.environment === "test" &&
    (!(deps.isDevelopment ?? (() => process.env.NODE_ENV === "development"))() ||
      !(deps.isAdmin ?? isAgeAssuranceAdmin)(args.user))
  ) {
    return { eligible: false, reason: "test_environment_admin_required" };
  }
  if (state.environment !== "test" && state.environment !== "live") {
    return { eligible: false, reason: "verification_required" };
  }

  return { eligible: true, reason: "eligible" };
}

export async function assertAgeEligibilityOrThrow(
  args: { user: unknown; featureKey: string },
  deps: AgeEligibilityGateDeps = {},
) {
  const decision = await resolveAgeEligibility(args, deps);
  if (decision.eligible) return decision;
  throw Object.assign(new Error("연령 확인을 완료한 계정만 이 기능을 이용할 수 있습니다."), {
    errorCode: "AGE_ASSURANCE_INELIGIBLE",
    status: 403,
    detail: { featureKey: args.featureKey, reason: decision.reason },
  });
}

export { AGE_ASSURANCE_FEATURE_KEYS };
