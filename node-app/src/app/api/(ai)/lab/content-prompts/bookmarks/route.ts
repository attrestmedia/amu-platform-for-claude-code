import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  clearUserContentPromptBookmarks,
  listUserContentPromptBookmarks,
  setUserContentPromptBookmark,
} from "libs/server-utils/lab/imagePromptBookmarkRepo";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose Gen Studio 콘텐츠 템플릿 사용자 북마크 조회·변경
 * @process 인증 사용자 확인  템플릿 키 검증  북마크 목록 조회·토글·전체 해제  JSON 응답 반환
 * @domain gen-studio
 * @scope user-api
 */

export const runtime = "nodejs";

function getSafeUid(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim().slice(0, 128);
}

function getSafeEmail(user: AuthenticatedUserType) {
  return String(user?.userEmail || user?.userEmailLower || "").trim().slice(0, 256);
}

export const GET = withAuth(
  async (_data: unknown, user: AuthenticatedUserType) => {
    const uid = getSafeUid(user);
    if (!uid) return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });

    const keys = await listUserContentPromptBookmarks(uid);
    return NextResponse.json({ ok: true, data: { keys } });
  },
  undefined,
  "lab/content-prompts/bookmarks:get",
);

export const POST = withAuth(
  async (body: UnknownRecord, user: AuthenticatedUserType) => {
    const uid = getSafeUid(user);
    if (!uid) return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });

    const email = getSafeEmail(user);
    const action = String(body?.action || "").trim();

    if (action === "clear_all") {
      const keys = await clearUserContentPromptBookmarks(uid, email);
      return NextResponse.json({ ok: true, data: { keys } });
    }

    if (action === "set") {
      const templateKey = String(body?.templateKey || "").trim().slice(0, 128);
      if (!templateKey) {
        return NextResponse.json({ ok: false, error: "template_key_required" }, { status: 400 });
      }

      const keys = await setUserContentPromptBookmark(uid, email, templateKey, body?.bookmarked !== false);
      return NextResponse.json({ ok: true, data: { keys } });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  },
  undefined,
  "lab/content-prompts/bookmarks:write",
);
