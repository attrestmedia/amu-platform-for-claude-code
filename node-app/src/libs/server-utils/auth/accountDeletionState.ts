import type {
  AccountDeletionFailureStage,
  AccountDeletionRequestStatus,
} from "models/user/AccountDeletionRequestSchema";

export const ACCOUNT_DELETION_WORKER_ENABLED = process.env.ACCOUNT_DELETION_WORKER_ENABLED === "true";
// WordPress suspend/delete can each consume up to 20 seconds; renew remains authoritative.
export const ACCOUNT_DELETION_LEASE_MS = 180_000;
export const ACCOUNT_DELETION_MAX_RETRIES = 5;
export const ACCOUNT_DELETION_BASE_BACKOFF_MS = 5_000;
export const ACCOUNT_DELETION_MAX_BACKOFF_MS = 15 * 60_000;
export const ACCOUNT_DELETION_MANUAL_REASON_CODES = [
  "WORDPRESS_STAGE_REPAIRED",
  "IDENTITY_RECHECKED",
  "OPERATOR_APPROVED",
] as const;
export const ACCOUNT_DELETION_HOLD_REASON_CODES = ["LEGAL_HOLD"] as const;
export const ACCOUNT_DELETION_INGRESS_HOLD_ERROR = "ACCOUNT_DELETION_INGRESS_HOLD";
export const ACCOUNT_DELETION_SUPPORT_EMAIL = "amu@allmyuniverse.com";
export const ACCOUNT_DELETION_INGRESS_HOLD_MESSAGE = `탈퇴 요청은 현재 보류 중입니다. 요청 권리는 유지되며 고객지원(${ACCOUNT_DELETION_SUPPORT_EMAIL})으로 문의해 주세요.`;

export function isIntegratedAccountDeletionIngress() {
  return process.env.ACCOUNT_DELETION_INGRESS === "integrated";
}

export type AccountDeletionErrorClass = {
  errorCode: string;
  retryable: boolean;
  stage: AccountDeletionFailureStage;
};

const ALLOWED_TRANSITIONS: Record<AccountDeletionRequestStatus, readonly AccountDeletionRequestStatus[]> = {
  requested: ["review_required", "accepted", "failed"],
  review_required: ["accepted"],
  accepted: ["processing", "failed"],
  processing: ["completed", "failed"],
  failed: ["accepted", "processing"],
  completed: [],
};

export function canTransition(from: AccountDeletionRequestStatus, to: AccountDeletionRequestStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isRetryableFailure(status: AccountDeletionRequestStatus, retryable: boolean) {
  return status === "failed" && retryable;
}

export function calculateAccountDeletionBackoff(retryCount: number, jitterMs = 0) {
  const exponent = Math.max(0, Math.min(16, Math.trunc(retryCount) - 1));
  const delay = Math.min(ACCOUNT_DELETION_MAX_BACKOFF_MS, ACCOUNT_DELETION_BASE_BACKOFF_MS * 2 ** exponent);
  return Math.min(ACCOUNT_DELETION_MAX_BACKOFF_MS, delay + Math.max(0, Math.trunc(jitterMs)));
}

export function safeAccountDeletionErrorCode(value: unknown, fallback = "INTERNAL_ERROR") {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : fallback;
}

export function classifyAccountDeletionError(
  error: unknown,
  stage: AccountDeletionFailureStage,
): AccountDeletionErrorClass {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const status = Number(record.status || 0);
  const errorCode = safeAccountDeletionErrorCode(record.errorCode, "WORDPRESS_STAGE_FAILED");
  const reason = `${String(record.name || "")} ${String(record.code || "")}`;
  const retryable =
    status === 408 || status === 429 || status >= 500 || /timeout|abort|network|socket|econn|temporar/i.test(reason);
  return { errorCode, retryable, stage };
}

export function isAdministrativeHoldCode(errorCode: string) {
  return ["ADMIN_ACCOUNT_DELETION_FORBIDDEN", "WORDPRESS_IDENTITY_MISMATCH", "WORDPRESS_USER_NOT_FOUND"].includes(
    errorCode,
  );
}
