import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

type GoogleOAuthConnectionStatus = {
  providerAccountId?: string;
  displayName?: string;
  isActive?: boolean;
  connectionStatus?: string;
  tokenHealth?: string;
  selectedResourceId?: string;
  selectedResourceName?: string;
  lastValidatedAt?: string | null;
  lastValidationErrorCode?: string;
  scopeAssessment?: { missingScopes?: string[] };
};

function legacySummary(raw: unknown) {
  const status = toUnknownRecord(raw);
  const extras = toUnknownRecord(status.extras);
  return {
    exists: status.exists === true,
    ready: status.ready === true,
    missing: Array.isArray(status.missing) ? status.missing.map(toSafeString).filter(Boolean) : [],
    authMode: "legacy" as const,
    lastValidatedAt: toSafeString(extras.lastValidatedAt),
    lastValidationStatus: toSafeString(extras.lastValidationStatus),
    lastValidationCode: toSafeString(extras.lastValidationCode),
    lastValidationRequestId: toSafeString(extras.lastValidationRequestId),
  };
}

function oauthMissing(connection: GoogleOAuthConnectionStatus) {
  const missingScopes = Array.isArray(connection.scopeAssessment?.missingScopes)
    ? connection.scopeAssessment.missingScopes.map(toSafeString).filter(Boolean)
    : [];
  if (connection.connectionStatus === "permission_missing") return missingScopes.length ? missingScopes : ["oauthScope"];
  if (connection.connectionStatus === "reauth_required") return ["oauthReauthorization"];
  if (connection.tokenHealth === "refresh_failed" || connection.tokenHealth === "reauth_required") {
    return ["oauthTokenRefresh"];
  }
  if (!toSafeString(connection.selectedResourceId)) return ["customerId"];
  return [];
}

export function buildAdsCredentialStatus(args: {
  legacyStatus: Record<string, unknown>;
  googleOAuthConnections: GoogleOAuthConnectionStatus[];
}) {
  const googleOAuth = args.googleOAuthConnections.find(
    (connection) => connection.isActive === true && connection.connectionStatus !== "disconnected",
  );
  const naver = legacySummary(args.legacyStatus.naver_ads);
  if (!googleOAuth) {
    return {
      naver_ads: naver,
      google_ads: legacySummary(args.legacyStatus.google_ads),
    };
  }

  const missing = oauthMissing(googleOAuth);
  const ready =
    googleOAuth.connectionStatus === "connected" &&
    googleOAuth.tokenHealth !== "refresh_failed" &&
    googleOAuth.tokenHealth !== "reauth_required" &&
    Boolean(toSafeString(googleOAuth.selectedResourceId));

  return {
    naver_ads: naver,
    google_ads: {
      exists: true,
      ready,
      missing,
      authMode: "oauth" as const,
      connectionStatus: toSafeString(googleOAuth.connectionStatus),
      tokenHealth: toSafeString(googleOAuth.tokenHealth),
      providerAccountId: toSafeString(googleOAuth.providerAccountId),
      displayName: toSafeString(googleOAuth.displayName),
      selectedResourceId: toSafeString(googleOAuth.selectedResourceId),
      selectedResourceName: toSafeString(googleOAuth.selectedResourceName),
      lastValidatedAt: toSafeString(googleOAuth.lastValidatedAt),
      lastValidationStatus: ready ? "valid" : "pending",
      lastValidationCode: toSafeString(googleOAuth.lastValidationErrorCode),
      lastValidationRequestId: "",
    },
  };
}
