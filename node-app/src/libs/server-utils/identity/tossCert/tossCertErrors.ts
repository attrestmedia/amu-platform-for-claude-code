import "server-only";

function safeCode(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) return fallback;
  return value;
}

export class TossCertLiveCredentialBlockedError extends Error {
  readonly errorCode = "TOSS_CERT_LIVE_CREDENTIAL_BLOCKED";
  readonly status = 503;

  constructor() {
    super("Toss Cert live credentials are blocked");
    this.name = "TossCertLiveCredentialBlockedError";
  }
}

export class TossCertApiError extends Error {
  readonly errorCode: string;
  readonly errorType: string | number | null;
  readonly httpStatus: number;

  constructor(args: { errorCode?: unknown; errorType?: unknown; httpStatus: number }) {
    super("Toss Cert provider request failed");
    this.name = "TossCertApiError";
    this.errorCode = safeCode(args.errorCode, "TOSS_CERT_UPSTREAM_ERROR");
    this.errorType =
      typeof args.errorType === "string" || typeof args.errorType === "number" ? args.errorType : null;
    this.httpStatus = args.httpStatus;
  }
}

export class TossCertSessionIntegrityError extends Error {
  constructor() {
    super("Toss Cert response integrity validation failed");
    this.name = "TossCertSessionIntegrityError";
  }
}

export function classifyTossCertCredentialVerificationError(error: unknown): string {
  if (error instanceof TossCertLiveCredentialBlockedError) return "TOSS_CERT_LIVE_CREDENTIAL_BLOCKED";
  if (error instanceof TossCertApiError) {
    if (error.httpStatus === 401 || error.errorCode.toLowerCase() === "invalid_client") {
      return "TOSS_CERT_INVALID_CLIENT";
    }
    if (error.httpStatus === 429) return "TOSS_CERT_RATE_LIMITED";
  }
  return "TOSS_CERT_UPSTREAM_ERROR";
}
