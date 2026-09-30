import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { disconnectLinkedInMemberToken } from "libs/database/secure/linkedinMemberTokens";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (data) => {
    const universeId = toSafeString(toUnknownRecord(data).universeId);
    if (!universeId) return NextResponse.json({ success: false, error: "universe_id_required" }, { status: 400 });
    const result = await disconnectLinkedInMemberToken(universeId);
    return NextResponse.json({ success: true, data: result });
  },
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_linkedin_member_auth_disconnect",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
