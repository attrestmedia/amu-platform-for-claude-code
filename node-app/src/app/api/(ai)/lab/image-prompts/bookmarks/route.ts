import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  clearUserImagePromptBookmarks,
  listUserImagePromptBookmarks,
  setUserImagePromptBookmark,
} from "libs/server-utils/lab/imagePromptBookmarkRepo";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

function getSafeUid(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "")
    .trim()
    .slice(0, 128);
}

function getSafeEmail(user: AuthenticatedUserType) {
  return String(user?.userEmail || user?.userEmailLower || "")
    .trim()
    .slice(0, 256);
}

export const GET = withAuth(
  async (_data: unknown, user: AuthenticatedUserType) => {
    const uid = getSafeUid(user);
    if (!uid) return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });

    const keys = await listUserImagePromptBookmarks(uid);
    return NextResponse.json({ ok: true, data: { keys } });
  },
  undefined,
  "lab/image-prompts/bookmarks:get",
);

export const POST = withAuth(
  async (body: UnknownRecord, user: AuthenticatedUserType) => {
    const uid = getSafeUid(user);
    if (!uid) return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });

    const email = getSafeEmail(user);
    const action = String(body?.action || "").trim();

    if (action === "clear_all") {
      const keys = await clearUserImagePromptBookmarks(uid, email);
      return NextResponse.json({ ok: true, data: { keys } });
    }

    if (action === "set") {
      const templateKey = String(body?.templateKey || "")
        .trim()
        .slice(0, 128);
      if (!templateKey) {
        return NextResponse.json({ ok: false, error: "template_key_required" }, { status: 400 });
      }

      const bookmarked = body?.bookmarked !== false;
      const keys = await setUserImagePromptBookmark(uid, email, templateKey, bookmarked);
      return NextResponse.json({ ok: true, data: { keys } });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  },
  undefined,
  "lab/image-prompts/bookmarks:write",
);
