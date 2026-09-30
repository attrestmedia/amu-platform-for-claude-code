import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getLinkedInMemberTokenStatus } from "libs/database/secure/linkedinMemberTokens";
import { getCredentialStatus } from "libs/database/secure/credentials";
import {
  LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE,
  LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE,
} from "libs/api/thirdparty/linkedin/linkedinMemberAnalyticsClient";
import { toSafeString } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(
  async (_data, _user, request) => {
    if (!request) {
      return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    }

    const universeId = toSafeString(new URL(request.url).searchParams.get("universeId"));
    if (!universeId) {
      return NextResponse.json({ success: false, error: "universe_id_required" }, { status: 400 });
    }

    const [status, credentialStatus] = await Promise.all([
      getLinkedInMemberTokenStatus(universeId),
      getCredentialStatus(universeId),
    ]);
    const appCredential = credentialStatus.linkedin;
    const scopes = status.exists && Array.isArray(status.scope) ? status.scope : [];
    const appUpdatedAt = toSafeString(appCredential?.updatedAt) || null;
    const tokenUpdatedAt = status.exists ? toSafeString(status.updatedAt) : "";
    const appCredentialChangedAfterToken = Boolean(
      appUpdatedAt && tokenUpdatedAt && new Date(appUpdatedAt).getTime() > new Date(tokenUpdatedAt).getTime(),
    );

    return NextResponse.json({
      success: true,
      data: {
        ...status,
        appReady: appCredential?.ready === true,
        appUpdatedAt,
        appMissing: Array.isArray(appCredential?.missing) ? appCredential.missing : [],
        appCredentialChangedAfterToken,
        capabilities: {
          postAnalytics: scopes.includes(LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE),
          profileAnalytics: scopes.includes(LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE),
        },
      },
    });
  },
  undefined,
  "marketing_linkedin_member_auth_status",
  {
    bodyParser: "none",
    checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
  },
);
