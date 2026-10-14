import "server-only";
import { randomBytes } from "crypto";
import { AGE_ASSURANCE_FEATURE_KEYS } from "consts/system/featureRollout";
import { assertFeatureAccessOrThrow } from "libs/server-utils/auth/featureAccessPolicy";
import {
  claimAgeAssuranceAttempt,
  countRecentAgeAssuranceAttempts,
  createAgeAssuranceAttempt,
  deleteAgeAssuranceUserData,
  findAgeAssuranceAttempt,
  findAgeAssuranceState,
  markAgeAssuranceAttemptCompleted,
  markAgeAssuranceAttemptExpired,
  markAgeAssuranceAttemptFailed,
  releaseAgeAssuranceAttempt,
  upsertAgeAssuranceState,
  type AgeAssuranceAttemptRecord,
  type AgeAssuranceStateRecord,
} from "libs/server-utils/identity/ageAssurance/ageAssuranceRepository";
import { isAgeAssuranceAdmin, resolveAgeAssuranceUid } from "./ageAssuranceIdentity";
import { resolveAgeEligibility } from "libs/server-utils/auth/ageEligibilityGate";
import { getIdentityVerificationResult, requestIdentityVerification } from "libs/server-utils/identity/tossCert/tossCertClient";
import type {
  AgeAssuranceCompleteResponse,
  AgeAssuranceEnvironment,
  AgeAssuranceOutcome,
  AgeAssuranceStartResponse,
  AgeAssuranceStateView,
} from "types/identity/ageAssurance";

export type AgeAssuranceErrorCode =
  | "AGE_ASSURANCE_CREDENTIAL_UNAVAILABLE"
  | "AGE_ASSURANCE_LIVE_CREDENTIAL_BLOCKED"
  | "AGE_ASSURANCE_ATTEMPT_NOT_FOUND"
  | "AGE_ASSURANCE_ATTEMPT_ALREADY_USED"
  | "AGE_ASSURANCE_ATTEMPT_EXPIRED"
  | "AGE_ASSURANCE_RESULT_NOT_READY"
  | "AGE_ASSURANCE_PROVIDER_ERROR"
  | "AGE_ASSURANCE_RATE_LIMITED"
  | "AGE_ASSURANCE_INELIGIBLE";

export class AgeAssuranceServiceError extends Error {
  readonly errorCode: AgeAssuranceErrorCode;
  readonly status: number;

  constructor(errorCode: AgeAssuranceErrorCode, status: number, message: string) {
    super(message);
    this.name = "AgeAssuranceServiceError";
    this.errorCode = errorCode;
    this.status = status;
  }
}

type AttemptCreateInput = {
  uid: string;
  txId: string;
  nonce: string;
  environment: AgeAssuranceEnvironment;
  requestedAt: Date;
  expiresAt: Date;
};

export type AgeAssuranceServiceRepository = {
  countRecentAttempts: typeof countRecentAgeAssuranceAttempts;
  createAttempt: (input: AttemptCreateInput) => Promise<AgeAssuranceAttemptRecord>;
  findAttempt: typeof findAgeAssuranceAttempt;
  claimAttempt: typeof claimAgeAssuranceAttempt;
  releaseAttempt: typeof releaseAgeAssuranceAttempt;
  markAttemptExpired: typeof markAgeAssuranceAttemptExpired;
  markAttemptFailed: typeof markAgeAssuranceAttemptFailed;
  markAttemptCompleted: typeof markAgeAssuranceAttemptCompleted;
  findState: typeof findAgeAssuranceState;
  upsertState: typeof upsertAgeAssuranceState;
  deleteUserData: typeof deleteAgeAssuranceUserData;
};

export type AgeAssuranceServiceDeps = {
  repository?: AgeAssuranceServiceRepository;
  requestIdentityVerification?: typeof requestIdentityVerification;
  getIdentityVerificationResult?: typeof getIdentityVerificationResult;
  assertFeatureAccess?: typeof assertFeatureAccessOrThrow;
  isAdmin?: (user: unknown) => boolean;
  isDevelopment?: () => boolean;
  now?: () => Date;
  createNonce?: () => string;
};

const defaultRepository: AgeAssuranceServiceRepository = {
  countRecentAttempts: countRecentAgeAssuranceAttempts,
  createAttempt: createAgeAssuranceAttempt,
  findAttempt: findAgeAssuranceAttempt,
  claimAttempt: claimAgeAssuranceAttempt,
  releaseAttempt: releaseAgeAssuranceAttempt,
  markAttemptExpired: markAgeAssuranceAttemptExpired,
  markAttemptFailed: markAgeAssuranceAttemptFailed,
  markAttemptCompleted: markAgeAssuranceAttemptCompleted,
  findState: findAgeAssuranceState,
  upsertState: upsertAgeAssuranceState,
  deleteUserData: deleteAgeAssuranceUserData,
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_TEST_RETURN_PATH = "/admin/operations/age-step-up-mock";

function createError(errorCode: AgeAssuranceErrorCode, status: number, message: string) {
  return new AgeAssuranceServiceError(errorCode, status, message);
}

function safeProviderError(error: unknown) {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const name = error instanceof Error ? error.name : "";
  const code = typeof record.errorCode === "string" ? record.errorCode : "";
  if (name.includes("LiveCredentialBlocked") || code.includes("LIVE_CREDENTIAL_BLOCKED")) {
    return createError(
      "AGE_ASSURANCE_LIVE_CREDENTIAL_BLOCKED",
      503,
      "운영 자격증명은 이 개발 흐름에서 사용할 수 없습니다.",
    );
  }
  if (name.includes("CredentialUnavailable") || code.includes("CREDENTIAL_UNAVAILABLE")) {
    return createError(
      "AGE_ASSURANCE_CREDENTIAL_UNAVAILABLE",
      503,
      "Toss Cert 테스트 자격증명을 사용할 수 없습니다.",
    );
  }
  if (code.includes("RATE_LIMITED")) {
    return createError("AGE_ASSURANCE_RATE_LIMITED", 429, "Toss Cert 테스트 요청 한도를 초과했습니다.");
  }
  return createError("AGE_ASSURANCE_PROVIDER_ERROR", 502, "Toss Cert 테스트 요청을 처리하지 못했습니다.");
}

function requireAdminAndUid(user: unknown, deps: AgeAssuranceServiceDeps) {
  const uid = resolveAgeAssuranceUid(user);
  if (!uid) throw createError("AGE_ASSURANCE_ATTEMPT_NOT_FOUND", 404, "계정을 확인할 수 없습니다.");
  if (!(deps.isAdmin ?? isAgeAssuranceAdmin)(user)) {
    throw createError("AGE_ASSURANCE_INELIGIBLE", 403, "관리자 전용 테스트 흐름입니다.");
  }
  return uid;
}

function requireDevelopmentSandbox(deps: AgeAssuranceServiceDeps) {
  if (!(deps.isDevelopment ?? (() => process.env.NODE_ENV === "development"))()) {
    throw createError(
      "AGE_ASSURANCE_LIVE_CREDENTIAL_BLOCKED",
      503,
      "Toss Cert sandbox 테스트는 로컬 development 환경에서만 사용할 수 있습니다.",
    );
  }
}

async function assertFeatureAccess(user: unknown, deps: AgeAssuranceServiceDeps) {
  await (deps.assertFeatureAccess ?? assertFeatureAccessOrThrow)({
    user,
    featureKey: AGE_ASSURANCE_FEATURE_KEYS.stepUp,
  });
}

function toIso(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stateView(state: AgeAssuranceStateRecord | null, eligible: boolean): AgeAssuranceStateView {
  if (!state) {
    return { outcome: null, eligible: false, environment: null, verifiedAt: null, expiresAt: null };
  }
  return {
    outcome: state.outcome,
    eligible,
    environment: state.environment,
    verifiedAt: toIso(state.verifiedAt),
    expiresAt: toIso(state.expiresAt),
  };
}

function isAttemptExpired(attempt: AgeAssuranceAttemptRecord, now: Date) {
  const expiry = attempt.expiresAt instanceof Date ? attempt.expiresAt : new Date(attempt.expiresAt);
  return !Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime();
}

function toFinalOutcome(result: { status?: unknown; ageGroup?: unknown }): AgeAssuranceOutcome | null {
  if (result.status === "REQUESTED" || result.status === "IN_PROGRESS") return null;
  if (result.status === "CANCELLED") return "CANCELLED";
  if (result.status === "EXPIRED") return "EXPIRED";
  if (result.status === "FAILED" || result.status === "FAIL") return "FAILED";
  if (result.status !== "COMPLETED") return "UNKNOWN";
  if (result.ageGroup === "ADULT") return "ADULT";
  if (result.ageGroup === "MINOR") return "MINOR";
  return "UNKNOWN";
}

export async function startAgeAssurance(
  user: unknown,
  args: { origin: string },
  deps: AgeAssuranceServiceDeps = {},
): Promise<AgeAssuranceStartResponse> {
  await assertFeatureAccess(user, deps);
  requireDevelopmentSandbox(deps);
  const uid = requireAdminAndUid(user, deps);
  const repository = deps.repository ?? defaultRepository;
  const now = deps.now?.() ?? new Date();
  const recentCount = await repository.countRecentAttempts(uid, new Date(now.getTime() - RATE_LIMIT_WINDOW_MS));
  if (recentCount >= RATE_LIMIT_MAX_ATTEMPTS) {
    throw createError("AGE_ASSURANCE_RATE_LIMITED", 429, "10분 내 테스트 인증 요청 한도를 초과했습니다.");
  }

  let requestUrl: string;
  try {
    const base = new URL(args.origin);
    if (
      base.protocol !== "https:" &&
      base.hostname !== "localhost" &&
      base.hostname !== "127.0.0.1" &&
      base.hostname !== "[::1]"
    ) {
      throw new Error("Unsupported origin");
    }
    requestUrl = new URL(ADMIN_TEST_RETURN_PATH, base.origin).toString();
  } catch {
    throw createError("AGE_ASSURANCE_PROVIDER_ERROR", 502, "테스트 인증 주소를 확인할 수 없습니다.");
  }

  const nonce = deps.createNonce?.() ?? randomBytes(32).toString("hex");
  let providerRequest: Awaited<ReturnType<typeof requestIdentityVerification>>;
  try {
    providerRequest = await (deps.requestIdentityVerification ?? requestIdentityVerification)({
      requestUrl,
      nonce,
      expireSeconds: 600,
    });
  } catch (error) {
    throw safeProviderError(error);
  }

  const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS);
  const attempt = await repository.createAttempt({
    uid,
    txId: providerRequest.txId,
    nonce,
    environment: "test",
    requestedAt: now,
    expiresAt,
  });

  return {
    ok: true,
    attemptId: String(attempt._id),
    txId: providerRequest.txId,
    authUrl: providerRequest.authUrl,
    expiresAt: expiresAt.toISOString(),
    environment: "test",
  };
}

export async function completeAgeAssurance(
  user: unknown,
  attemptId: unknown,
  deps: AgeAssuranceServiceDeps = {},
): Promise<AgeAssuranceCompleteResponse> {
  await assertFeatureAccess(user, deps);
  requireDevelopmentSandbox(deps);
  const uid = requireAdminAndUid(user, deps);
  if (typeof attemptId !== "string" || !/^[a-f\d]{24}$/i.test(attemptId)) {
    throw createError("AGE_ASSURANCE_ATTEMPT_NOT_FOUND", 404, "인증 시도를 찾을 수 없습니다.");
  }
  const repository = deps.repository ?? defaultRepository;
  const now = deps.now?.() ?? new Date();
  const existing = await repository.findAttempt(uid, attemptId);
  if (!existing) throw createError("AGE_ASSURANCE_ATTEMPT_NOT_FOUND", 404, "인증 시도를 찾을 수 없습니다.");
  if (isAttemptExpired(existing, now)) {
    await repository.markAttemptExpired(uid, attemptId);
    throw createError("AGE_ASSURANCE_ATTEMPT_EXPIRED", 410, "인증 시도가 만료되었습니다.");
  }
  if (existing.consumed || existing.status !== "requested") {
    throw createError("AGE_ASSURANCE_ATTEMPT_ALREADY_USED", 409, "이미 처리된 인증 시도입니다.");
  }
  if (existing.environment !== "test") {
    throw createError("AGE_ASSURANCE_LIVE_CREDENTIAL_BLOCKED", 503, "운영 환경 인증은 이 개발 흐름에서 사용할 수 없습니다.");
  }

  const claimed = await repository.claimAttempt(uid, attemptId, now);
  if (!claimed) {
    const current = await repository.findAttempt(uid, attemptId);
    if (!current) throw createError("AGE_ASSURANCE_ATTEMPT_NOT_FOUND", 404, "인증 시도를 찾을 수 없습니다.");
    if (isAttemptExpired(current, now)) {
      await repository.markAttemptExpired(uid, attemptId);
      throw createError("AGE_ASSURANCE_ATTEMPT_EXPIRED", 410, "인증 시도가 만료되었습니다.");
    }
    throw createError("AGE_ASSURANCE_ATTEMPT_ALREADY_USED", 409, "이미 처리된 인증 시도입니다.");
  }

  let providerResult: Awaited<ReturnType<typeof getIdentityVerificationResult>>;
  try {
    providerResult = await (deps.getIdentityVerificationResult ?? getIdentityVerificationResult)(claimed.txId);
  } catch (error) {
    await repository.markAttemptFailed(uid, attemptId);
    throw safeProviderError(error);
  }

  const outcome = toFinalOutcome(providerResult);
  if (!outcome) {
    await repository.releaseAttempt(uid, attemptId);
    throw createError("AGE_ASSURANCE_RESULT_NOT_READY", 409, "인증 결과가 아직 준비되지 않았습니다.");
  }

  const completedAt = deps.now?.() ?? new Date();
  const state: AgeAssuranceStateRecord = {
    uid,
    outcome,
    environment: "test",
    provider: "toss_cert",
    verifiedAt: completedAt,
    expiresAt: new Date(completedAt.getTime() + STATE_TTL_MS),
    attemptId,
  };
  await repository.upsertState(state);
  await repository.markAttemptCompleted(uid, attemptId, { outcome, resultFetchedAt: completedAt });

  const currentState = await repository.findState(uid);
  const eligibility = await resolveAgeEligibility(
    { user, featureKey: AGE_ASSURANCE_FEATURE_KEYS.stepUp },
    {
      assertFeatureAccess: deps.assertFeatureAccess,
      findState: async () => currentState,
      isAdmin: deps.isAdmin,
      isDevelopment: deps.isDevelopment,
      now: () => completedAt,
    },
  );
  return { ok: true, state: stateView(currentState, eligibility.eligible) };
}

export async function getAgeAssuranceState(
  user: unknown,
  deps: AgeAssuranceServiceDeps = {},
): Promise<{ ok: true; state: AgeAssuranceStateView }> {
  await assertFeatureAccess(user, deps);
  requireDevelopmentSandbox(deps);
  const uid = requireAdminAndUid(user, deps);
  const repository = deps.repository ?? defaultRepository;
  const state = await repository.findState(uid);
  const eligibility = await resolveAgeEligibility(
    { user, featureKey: AGE_ASSURANCE_FEATURE_KEYS.stepUp },
    {
      assertFeatureAccess: deps.assertFeatureAccess,
      findState: async () => state,
      isAdmin: deps.isAdmin,
      isDevelopment: deps.isDevelopment,
      now: deps.now,
    },
  );
  return { ok: true, state: stateView(state, eligibility.eligible) };
}

export async function deleteAgeAssuranceState(
  user: unknown,
  deps: AgeAssuranceServiceDeps = {},
): Promise<{ ok: true; state: AgeAssuranceStateView }> {
  await assertFeatureAccess(user, deps);
  requireDevelopmentSandbox(deps);
  const uid = requireAdminAndUid(user, deps);
  await (deps.repository ?? defaultRepository).deleteUserData(uid);
  return {
    ok: true,
    state: { outcome: null, eligible: false, environment: null, verifiedAt: null, expiresAt: null },
  };
}
