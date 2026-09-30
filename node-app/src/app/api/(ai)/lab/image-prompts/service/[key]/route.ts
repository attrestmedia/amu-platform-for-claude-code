import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getImagePromptByKeyInternal } from "libs/database/lab";
import { SERVICE_INTERNAL_IMAGE_PROMPT_KEYS } from "consts/app/serviceInternalPrompts";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

async function handler(
  _data: unknown,
  _user: AuthenticatedUserType,
  _request: NextRequest,
  context: NextRouteContext,
) {
  const key = decodeURIComponent(String(context.params.key || ""));
  if (!(SERVICE_INTERNAL_IMAGE_PROMPT_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const doc = await getImagePromptByKeyInternal(key);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: doc });
}

export const GET = withAuth(handler, undefined, "lab/image-prompts:service-get", { bodyParser: "none" });
