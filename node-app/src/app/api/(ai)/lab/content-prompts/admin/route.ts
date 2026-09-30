import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listContentPrompts } from "libs/database/lab";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

async function getHandler(_data: unknown, _user: AuthenticatedUserType, req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || undefined;
  const category = searchParams.get("category") || undefined;
  const enabled = searchParams.get("enabled");
  const enabledBool = enabled === null ? undefined : enabled === "true";
  const rows = await listContentPrompts({ q, category, enabled: enabledBool });
  return NextResponse.json({ ok: true, data: rows }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAuth(getHandler, undefined, "lab/content-prompts:admin-list", {
  requireAdmin: true,
  bodyParser: "none",
});
