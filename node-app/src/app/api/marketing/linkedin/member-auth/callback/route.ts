import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { upsertLinkedInMemberToken } from "libs/database/secure/linkedinMemberTokens";
import { buildLinkedInMemberAuthUrl } from "libs/marketing/auth/linkedinMemberAuthUrls";
import { consumeMarketingOAuthTransaction } from "libs/marketing/auth/oauthTransactionService";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { toSafeString } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LINKEDIN_ACCESS_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

async function readJsonSafe(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function redirectToConnections(request: Request, returnPath: string, status: "connected" | "failed", reason?: string) {
  const path = returnPath.startsWith("/marketing-oops/connections") ? returnPath : "/marketing-oops/connections";
  const url = new URL(buildLinkedInMemberAuthUrl(path, request));
  url.searchParams.set("marketingOAuth", status);
  url.searchParams.set("provider", "linkedin");
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export const GET = withAuth(
  async (_data, user, request) => {
    if (!request) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    const url = new URL(request.url);
    const transaction = await consumeMarketingOAuthTransaction(toSafeString(url.searchParams.get("state")));
    const returnPath = transaction?.returnPath || "/marketing-oops/connections";
    const actorId = toSafeString(user?.uid || user?.ID);
    if (!transaction || transaction.provider !== "linkedin" || transaction.actorId !== actorId) {
      return redirectToConnections(request, returnPath, "failed", "invalid_state");
    }
    const providerError = toSafeString(url.searchParams.get("error"));
    if (providerError) return redirectToConnections(request, returnPath, "failed", providerError);
    const code = toSafeString(url.searchParams.get("code"));
    if (!code) return redirectToConnections(request, returnPath, "failed", "code_missing");

    const access = await assertMarketingUniverseAccess({ user, universeId: transaction.universeId });
    if (!access.ok) return redirectToConnections(request, returnPath, "failed", access.error);
    const credential = await getDecryptedCredential(transaction.universeId, "linkedin");
    const clientId = toSafeString(credential?.clientId);
    const clientSecret = toSafeString(credential?.clientSecret);
    if (!clientId || !clientSecret) {
      return redirectToConnections(request, returnPath, "failed", "linkedin_app_not_ready");
    }

    try {
      const tokenResponse = await fetch(LINKEDIN_ACCESS_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: transaction.redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const token = await readJsonSafe(tokenResponse);
      if (!tokenResponse.ok || !token?.access_token) {
        return redirectToConnections(request, returnPath, "failed", "token_exchange_failed");
      }
      const profileResponse = await fetch(LINKEDIN_USERINFO_URL, {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const profile = await readJsonSafe(profileResponse);
      const memberId = toSafeString(profile?.sub);
      if (!profileResponse.ok || !memberId) {
        return redirectToConnections(request, returnPath, "failed", "identity_lookup_failed");
      }
      await upsertLinkedInMemberToken({
        universeId: transaction.universeId,
        memberId,
        displayName: toSafeString(profile?.name),
        accessToken: token.access_token,
        refreshToken: toSafeString(token?.refresh_token),
        expiresIn: Number(token?.expires_in || 0),
        refreshTokenExpiresIn: Number(token?.refresh_token_expires_in || 0),
        scope: token?.scope,
        actor: toSafeString(user?.userEmail || user?.userEmailLower || actorId),
      });
      return redirectToConnections(request, returnPath, "connected");
    } catch {
      return redirectToConnections(request, returnPath, "failed", "provider_request_failed");
    }
  },
  undefined,
  "marketing_linkedin_member_auth_callback",
  { bodyParser: "none" },
);
