import "server-only";

import {
  listOAuthConnectionStatus,
  updateOAuthConnectionValidation,
} from "libs/database/secure/oauthConnections";
import { getMarketingOAuthAppReadiness } from "libs/marketing/auth/oauthAppCredentials";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";
import { assessOAuthScopes, getConnectionStatusAfterScopeRepair } from "libs/marketing/auth/oauthScopeContract";
import type { OAuthConnectionProvider, OAuthConnectionStatus } from "models/secure/OAuthConnectionSchema";

export async function getMarketingOAuthConnectionStatus(args: {
  universeId: string;
  provider: OAuthConnectionProvider;
}) {
  const readiness = await getMarketingOAuthAppReadiness(args.provider);
  let connections = await listOAuthConnectionStatus({
    ownerType: "universe",
    ownerId: args.universeId,
    provider: args.provider,
  });

  const permissionRepairs = connections
    .filter((connection) => connection.connectionStatus === "permission_missing")
    .map((connection) => ({ connection, assessment: assessOAuthScopes(args.provider, connection.scope) }))
    .filter(({ assessment }) => assessment.reported && assessment.complete)
    .map(({ connection, assessment }) =>
      updateOAuthConnectionValidation({
        ownerType: "universe",
        ownerId: args.universeId,
        provider: args.provider,
        providerAccountId: connection.providerAccountId,
        errorCode: "",
        connectionStatus: getConnectionStatusAfterScopeRepair({
          provider: args.provider,
          currentStatus: connection.connectionStatus,
          selectedResourceId: connection.selectedResourceId,
          scopeReported: assessment.reported,
          scopeComplete: true,
        }) as OAuthConnectionStatus,
      }),
    );
  if (permissionRepairs.length) {
    await Promise.all(permissionRepairs);
  }

  const isGoogleProvider = args.provider === "google_analytics" || args.provider === "google_ads";
  if (readiness.ready && isGoogleProvider) {
    await resolveMarketingOAuthAccess({
      universeId: args.universeId,
      provider: args.provider,
      allowSelectionRequired: true,
    });
  }

  connections = await listOAuthConnectionStatus({
    ownerType: "universe",
    ownerId: args.universeId,
    provider: args.provider,
  });

  return {
    provider: args.provider,
    appReady: readiness.ready,
    appCredentialSource: readiness.source,
    connections: connections.map((connection) => ({
      ...connection,
      scopeAssessment: assessOAuthScopes(args.provider, connection.scope),
    })),
  };
}
