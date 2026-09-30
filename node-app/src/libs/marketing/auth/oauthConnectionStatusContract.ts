import type {
  OAuthConnectionProvider,
  OAuthConnectionStatus,
} from "models/secure/OAuthConnectionSchema";

export type OAuthConnectionStatusInput = {
  provider: OAuthConnectionProvider;
  connectionStatus: OAuthConnectionStatus;
  accessTokenExpiresAt: Date | null;
  refreshTokenPresent: boolean;
  refreshTokenExpiresAt: Date | null;
  lastValidationError: string;
  nowMs?: number;
};

export type OAuthTokenHealth = "valid" | "refreshable" | "refresh_failed" | "reauth_required";

const PRIMARY_REMEDIATION_STATUSES = new Set<OAuthConnectionStatus>([
  "selection_required",
  "permission_missing",
]);

function isGoogleProvider(provider: OAuthConnectionProvider) {
  return provider === "google_analytics" || provider === "google_ads";
}

export function deriveOAuthConnectionStatus(input: OAuthConnectionStatusInput) {
  const nowMs = input.nowMs ?? Date.now();
  const accessTokenExpired = !!input.accessTokenExpiresAt && input.accessTokenExpiresAt.getTime() <= nowMs;
  const refreshTokenExpired =
    !!input.refreshTokenExpiresAt && input.refreshTokenExpiresAt.getTime() <= nowMs;
  const canRefresh = isGoogleProvider(input.provider) && input.refreshTokenPresent && !refreshTokenExpired;
  const cannotRecoverExpiredToken = accessTokenExpired && !canRefresh;
  const reauthRequired = input.connectionStatus === "reauth_required" || cannotRecoverExpiredToken;
  const connectionStatus = PRIMARY_REMEDIATION_STATUSES.has(input.connectionStatus)
    ? input.connectionStatus
    : reauthRequired
      ? "reauth_required"
      : input.connectionStatus;
  const tokenHealth: OAuthTokenHealth = reauthRequired
    ? "reauth_required"
    : !accessTokenExpired
      ? "valid"
      : input.lastValidationError
        ? "refresh_failed"
        : "refreshable";

  return {
    connectionStatus,
    accessTokenExpired,
    canRefresh,
    refreshTokenExpired,
    tokenHealth,
    lastValidationErrorCode: input.lastValidationError,
  };
}

export function getConnectionStatusAfterRefresh(args: {
  connectionStatus: OAuthConnectionStatus;
  selectedResourceId: string;
}) {
  if (args.connectionStatus !== "reauth_required") return args.connectionStatus;
  return args.selectedResourceId ? ("connected" as const) : ("selection_required" as const);
}
