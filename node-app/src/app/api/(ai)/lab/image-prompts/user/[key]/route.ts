import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getUserKeyOrThrow, getUserImageModel } from "libs/server-utils/api/apiSafetyHelper";
import { IMAGE_STUDIO_USER_PROMPTS_KEY } from "consts/app";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

export const GET = withAuth(
  async (_data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) => {
    const userKey = getUserKeyOrThrow(user);
    const model = await getUserImageModel(userKey);

    const key = decodeURIComponent(ctx.params.key);
    const doc = await model.findOne({ key }).lean();

    if (!doc) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: doc });
  },
  undefined,
  `${IMAGE_STUDIO_USER_PROMPTS_KEY}:get-one`,
);
