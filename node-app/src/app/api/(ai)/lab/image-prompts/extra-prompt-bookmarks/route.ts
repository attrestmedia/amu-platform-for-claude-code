import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  addUserImageExtraPromptBookmark,
  clearUserImageExtraPromptBookmarks,
  listUserImageExtraPromptBookmarks,
  removeUserImageExtraPromptBookmark,
} from "libs/server-utils/lab/imageExtraPromptBookmarkRepo";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Gen Studio 이미지 템플릿별 사용자 extraPrompt 저장함 API
 * @process 인증 사용자 확인  action/templateKey/text/id 검증  사용자 문서 저장  JSON 응답 반환
 * @domain lab
 * @scope user-api
 */

const MAX_TEMPLATE_KEY_CHARS = 128;
const MAX_EXTRA_PROMPT_CHARS = 2000;

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

function getSafeTemplateKey(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, MAX_TEMPLATE_KEY_CHARS);
}

function getSafeExtraPrompt(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, MAX_EXTRA_PROMPT_CHARS);
}

export const GET = withAuth(
  async (_data: unknown, user: AuthenticatedUserType, request?: NextRequest) => {
    const uid = getSafeUid(user);
    if (!uid) return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });

    const searchParams = request ? new URL(request.url).searchParams : undefined;
    const templateKey = getSafeTemplateKey(searchParams?.get("templateKey"));
    const items = await listUserImageExtraPromptBookmarks(uid, templateKey);
    return NextResponse.json({ ok: true, data: { items } });
  },
  undefined,
  "lab/image-prompts/extra-prompt-bookmarks:get",
);

export const POST = withAuth(
  async (body: UnknownRecord, user: AuthenticatedUserType) => {
    const uid = getSafeUid(user);
    if (!uid) return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });

    const userEmail = getSafeEmail(user);
    const action = String(body?.action || "").trim();

    if (action === "add") {
      const templateKey = getSafeTemplateKey(body?.templateKey);
      const text = getSafeExtraPrompt(body?.text);
      if (!templateKey) return NextResponse.json({ ok: false, error: "template_key_required" }, { status: 400 });
      if (!text) return NextResponse.json({ ok: false, error: "extra_prompt_required" }, { status: 400 });

      const items = await addUserImageExtraPromptBookmark({ uid, userEmail, templateKey, text });
      return NextResponse.json({ ok: true, data: { items } });
    }

    if (action === "remove") {
      const id = String(body?.id || "").trim();
      if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

      const items = await removeUserImageExtraPromptBookmark(uid, userEmail, id);
      return NextResponse.json({ ok: true, data: { items } });
    }

    if (action === "clear_template") {
      const templateKey = getSafeTemplateKey(body?.templateKey);
      if (!templateKey) return NextResponse.json({ ok: false, error: "template_key_required" }, { status: 400 });

      const items = await clearUserImageExtraPromptBookmarks(uid, userEmail, templateKey);
      return NextResponse.json({ ok: true, data: { items } });
    }

    if (action === "clear_all") {
      const items = await clearUserImageExtraPromptBookmarks(uid, userEmail);
      return NextResponse.json({ ok: true, data: { items } });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  },
  undefined,
  "lab/image-prompts/extra-prompt-bookmarks:write",
);
