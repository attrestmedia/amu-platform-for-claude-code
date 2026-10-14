export const AGE_ASSURANCE_OUTCOMES = ["ADULT", "MINOR", "FAILED", "EXPIRED", "CANCELLED", "UNKNOWN"] as const;
export type AgeAssuranceOutcome = (typeof AGE_ASSURANCE_OUTCOMES)[number];
export type AgeAssuranceEnvironment = "test" | "live";
export type AgeAssuranceAttemptStatus = "requested" | "completed" | "failed" | "expired";

export type AgeAssuranceStartResponse = {
  ok: true;
  attemptId: string;
  txId: string;
  authUrl: string;
  expiresAt: string;
  environment: AgeAssuranceEnvironment;
};

export type AgeAssuranceCompleteRequest = { attemptId: string };

export type AgeAssuranceStateView = {
  outcome: AgeAssuranceOutcome | null;
  eligible: boolean;
  environment: AgeAssuranceEnvironment | null;
  verifiedAt: string | null;
  expiresAt: string | null;
};

export type AgeAssuranceCompleteResponse = { ok: true; state: AgeAssuranceStateView };
export type AgeAssuranceStateResponse = { ok: true; state: AgeAssuranceStateView };
export type AgeAssuranceErrorResponse = { ok: false; errorCode: string; message: string };
