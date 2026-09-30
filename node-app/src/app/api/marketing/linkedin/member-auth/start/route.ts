import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { getMarketingSocialCollectSettings } from "libs/database/marketing";
import {
  LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE,
  LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE,
} from "libs/api/thirdparty/linkedin/linkedinMemberAnalyticsClient";
import { createMarketingOAuthTransaction } from "libs/marketing/auth/oauthTransactionService";
import { buildLinkedInMemberAuthUrl } from "libs/marketing/auth/linkedinMemberAuthUrls";
import { toSafeString } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_MEMBER_AUTH_BASE_SCOPES = ["openid", "profile", "w_member_social"];

export const GET = withAuth(
  async (_data, user, request) => {
    if (!request) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    const universeId = toSafeString(new URL(request.url).searchParams.get("universeId"));
    if (!universeId) {
      return NextResponse.json({ success: false, error: "universe_id_required" }, { status: 400 });
    }

    const [credential, collectSettings] = await Promise.all([
      getDecryptedCredential(universeId, "linkedin"),
      getMarketingSocialCollectSettings(universeId),
    ]);
    const clientId = toSafeString(credential?.clientId);
    if (!clientId) {
      return NextResponse.json({ success: false, error: "linkedin_app_not_ready" }, { status: 503 });
    }

    const redirectUri = buildLinkedInMemberAuthUrl("/api/marketing/linkedin/member-auth/callback", request);
    const { state } = await createMarketingOAuthTransaction({
      provider: "linkedin",
      universeId,
      actorId: toSafeString(user?.uid || user?.ID),
      codeVerifier: "",
      redirectUri,
      returnPath: `/marketing-oops/connections?universeId=${encodeURIComponent(universeId)}`,
    });
    const authUrl = new URL(LINKEDIN_AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    const scopes = collectSettings?.linkedinMemberAnalyticsEnabled
      ? [...LINKEDIN_MEMBER_AUTH_BASE_SCOPES, LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE, LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE]
      : LINKEDIN_MEMBER_AUTH_BASE_SCOPES;
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("state", state);
    return NextResponse.redirect(authUrl);
  },
  undefined,
  "marketing_linkedin_member_auth_start",
  { bodyParser: "none", checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
