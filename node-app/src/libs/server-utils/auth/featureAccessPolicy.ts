import "server-only";
import { USER_ROLES } from "consts/auth";
import {
  FEATURE_ROLLOUT_DECLARATIONS,
  FEATURE_ROLLOUT_POLICY_REF,
  isFeatureKey,
  isFeatureRolloutStage,
  type FeatureRolloutDeclaration,
  type FeatureRolloutStage,
} from "consts/system/featureRollout";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import type { IUpdateUserData } from "types/user";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 서버에서 feature rollout 단계와 접근 권한을 fail-closed로 판정
 * @process 선언 조회·검증  서버 역할/cohort 증거 판정  허용 또는 403 오류 반환
 * @domain auth
 * @scope server
 */

export const FEATURE_ACCESS_DENIED_ERROR_CODE = "FEATURE_ACCESS_DENIED" as const;
export const FEATURE_ACCESS_DENIED_MESSAGE = "아직 이용할 수 없는 기능입니다.";

export type FeatureAccessDenyReason =
  | "invalid_feature_key"
  | "feature_not_declared"
  | "invalid_declaration"
  | "administrator_required"
  | "cohort_evidence_required"
  | "policy_resolution_failed";

export type FeatureAccessDecision =
  | { allowed: true; featureKey: string; stage: FeatureRolloutStage; via: "administrator" | "verified_cohort" | "public" }
  | { allowed: false; featureKey: string; stage: FeatureRolloutStage | null; reason: FeatureAccessDenyReason };

/** 서버가 발급·검증한 cohort 증거만 전달한다. 관리자 역할은 증거로 사용하지 않는다. */
export type VerifiedCohortEvidenceResolver = (args: { featureKey: string; user: unknown }) => Promise<boolean>;

/** 본인인증 증거 발급자가 도입되기 전까지 cohort 접근을 허용하지 않는다. */
export const resolveVerifiedCohortEvidenceUnavailable: VerifiedCohortEvidenceResolver = async () => false;

export type ResolveFeatureAccessArgs = {
  featureKey: string;
  /** 인증 미들웨어가 서버에서 병합한 user. request body·헤더 등 클라이언트 값은 전달하지 않는다. */
  user: unknown;
  /** 테스트 주입용. 운영에서는 FEATURE_ROLLOUT_DECLARATIONS를 사용한다. */
  declarations?: Readonly<Record<string, FeatureRolloutDeclaration>>;
  /** 테스트 주입용. 운영에서는 현재 unavailable resolver를 사용한다. */
  resolveCohortEvidence?: VerifiedCohortEvidenceResolver;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDeclaration(value: unknown): value is FeatureRolloutDeclaration {
  if (!isRecord(value)) return false;
  if (!isFeatureRolloutStage(value.stage)) return false;
  if (!Array.isArray(value.publicLaunchGates) || !value.publicLaunchGates.every((gate) => typeof gate === "string" && gate.trim().length > 0)) {
    return false;
  }
  if (value.policyRef !== FEATURE_ROLLOUT_POLICY_REF || typeof value.ledgerRef !== "string" || !value.ledgerRef.trim()) {
    return false;
  }
  return value.stage === "admin_only" || (typeof value.launchApprovalRef === "string" && value.launchApprovalRef.trim().length > 0);
}

function logDeniedDecision(decision: Extract<FeatureAccessDecision, { allowed: false }>, user: unknown) {
  const userId = isRecord(user) ? user.ID : undefined;
  const safeUserId = typeof userId === "string" || typeof userId === "number" ? userId : undefined;

  logger.warn("기능 접근 거부", {
    featureKey: decision.featureKey,
    reason: decision.reason,
    stage: decision.stage,
    ...(safeUserId === undefined ? {} : { ID: safeUserId }),
  });
}

export async function resolveFeatureAccess(args: ResolveFeatureAccessArgs): Promise<FeatureAccessDecision> {
  let featureKey = "";

  try {
    const rawFeatureKey = (args as ResolveFeatureAccessArgs | null | undefined)?.featureKey;
    featureKey = typeof rawFeatureKey === "string" ? rawFeatureKey : "";

    if (!isFeatureKey(rawFeatureKey)) {
      const decision: FeatureAccessDecision = { allowed: false, featureKey, stage: null, reason: "invalid_feature_key" };
      logDeniedDecision(decision, args?.user);
      return decision;
    }

    const declarations = args.declarations ?? FEATURE_ROLLOUT_DECLARATIONS;
    if (!Object.prototype.hasOwnProperty.call(declarations, featureKey)) {
      const decision: FeatureAccessDecision = { allowed: false, featureKey, stage: null, reason: "feature_not_declared" };
      logDeniedDecision(decision, args.user);
      return decision;
    }

    const declaration = declarations[featureKey];
    const stage = isRecord(declaration) && isFeatureRolloutStage(declaration.stage) ? declaration.stage : null;
    if (!isValidDeclaration(declaration)) {
      const decision: FeatureAccessDecision = { allowed: false, featureKey, stage, reason: "invalid_declaration" };
      logDeniedDecision(decision, args.user);
      return decision;
    }

    const user = args.user;
    const isAdministrator = isRecord(user) && getUserRole(user as unknown as IUpdateUserData).includes(USER_ROLES.ADMINISTRATOR);

    if (declaration.stage === "admin_only") {
      const decision: FeatureAccessDecision = isAdministrator
        ? { allowed: true, featureKey, stage: declaration.stage, via: "administrator" }
        : { allowed: false, featureKey, stage: declaration.stage, reason: "administrator_required" };
      if (!decision.allowed) logDeniedDecision(decision, user);
      return decision;
    }

    if (declaration.stage === "verified_cohort") {
      if (isAdministrator) return { allowed: true, featureKey, stage: declaration.stage, via: "administrator" };

      let hasEvidence = false;
      try {
        hasEvidence = (await (args.resolveCohortEvidence ?? resolveVerifiedCohortEvidenceUnavailable)({ featureKey, user })) === true;
      } catch {
        hasEvidence = false;
      }

      const decision: FeatureAccessDecision = hasEvidence
        ? { allowed: true, featureKey, stage: declaration.stage, via: "verified_cohort" }
        : { allowed: false, featureKey, stage: declaration.stage, reason: "cohort_evidence_required" };
      if (!decision.allowed) logDeniedDecision(decision, user);
      return decision;
    }

    return { allowed: true, featureKey, stage: declaration.stage, via: "public" };
  } catch (error) {
    try {
      logger.error("기능 접근 정책 판정 실패", { errorName: error instanceof Error ? error.name : "UnknownError" });
    } catch {
      // 로거 자체가 실패해도 접근 거부 결과를 반환한다.
    }
    return { allowed: false, featureKey, stage: null, reason: "policy_resolution_failed" };
  }
}

/** provider dispatch 직전에 호출한다. 거부 결과는 기존 API 오류 직렬화기가 처리할 403으로 만든다. */
export async function assertFeatureAccessOrThrow(
  args: ResolveFeatureAccessArgs,
): Promise<Extract<FeatureAccessDecision, { allowed: true }>> {
  const decision = await resolveFeatureAccess(args);
  if (decision.allowed) return decision;

  const error = new Error(FEATURE_ACCESS_DENIED_MESSAGE) as Error & {
    errorCode: typeof FEATURE_ACCESS_DENIED_ERROR_CODE;
    status: 403;
    detail: { featureKey: string; reason: FeatureAccessDenyReason };
  };
  error.errorCode = FEATURE_ACCESS_DENIED_ERROR_CODE;
  error.status = 403;
  error.detail = { featureKey: decision.featureKey, reason: decision.reason };
  throw error;
}
