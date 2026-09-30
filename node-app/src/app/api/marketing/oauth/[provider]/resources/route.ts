import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listMarketingOAuthResources } from "libs/marketing/auth/oauthProviderLifecycle";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";
import { isSupportedOAuthProvider } from "libs/marketing/auth/oauthProviderRegistry";
import { toSafeString } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (_data, _user, request, ctx: { params: Promise<{ provider: string }> }) => {
    if (!request) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    const { provider } = await ctx.params;
    if (!isSupportedOAuthProvider(provider)) {
      return NextResponse.json({ success: false, error: "unsupported_provider" }, { status: 400 });
    }
    const universeId = toSafeString(new URL(request.url).searchParams.get("universeId"));
    const connection = await resolveMarketingOAuthAccess({ universeId, provider, allowSelectionRequired: true });
    if (!connection) {
      return NextResponse.json({ success: false, error: "oauth_connection_unavailable" }, { status: 409 });
    }
    try {
      const resources = await listMarketingOAuthResources({
        provider,
        accessToken: connection.accessToken,
        appCredential: connection.appCredential,
        providerAccountId: connection.providerAccountId,
        displayName: connection.displayName,
      });
      return NextResponse.json({ success: true, data: { resources } });
    } catch {
      return NextResponse.json({ success: false, error: "resource_lookup_failed" }, { status: 502 });
    }
  },
  undefined,
  "marketing_oauth_resources",
  { bodyParser: "none", checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
