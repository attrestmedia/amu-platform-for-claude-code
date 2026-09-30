import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { selectOAuthConnectionResource } from "libs/database/secure/oauthConnections";
import { listMarketingOAuthResources } from "libs/marketing/auth/oauthProviderLifecycle";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";
import { isSupportedOAuthProvider } from "libs/marketing/auth/oauthProviderRegistry";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (data, user, _request, ctx: { params: Promise<{ provider: string }> }) => {
    const { provider } = await ctx.params;
    if (!isSupportedOAuthProvider(provider)) {
      return NextResponse.json({ success: false, error: "unsupported_provider" }, { status: 400 });
    }
    const body = toUnknownRecord(data);
    const universeId = toSafeString(body.universeId);
    const resourceId = toSafeString(body.resourceId);
    if (!universeId || !resourceId) {
      return NextResponse.json({ success: false, error: "resource_selection_required" }, { status: 400 });
    }
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
      const selected = resources.find((resource) => resource.id === resourceId);
      if (!selected) {
        return NextResponse.json({ success: false, error: "resource_not_accessible" }, { status: 403 });
      }
      await selectOAuthConnectionResource({
        ownerType: "universe",
        ownerId: universeId,
        provider,
        providerAccountId: connection.providerAccountId,
        resourceId: selected.id,
        resourceName: selected.name,
        resourceType: selected.type,
        managerResourceId: selected.managerResourceId,
        actor: toSafeString(user?.userEmail || user?.userEmailLower || user?.uid || user?.ID),
      });
      return NextResponse.json({ success: true, data: { selected } });
    } catch {
      return NextResponse.json({ success: false, error: "resource_selection_failed" }, { status: 502 });
    }
  },
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_oauth_select_resource",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
