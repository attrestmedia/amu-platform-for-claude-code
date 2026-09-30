import { NextRequest, NextResponse } from "next/server";
import { withGuestOrAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import { handleUploadPOST, handleUploadDELETE } from "libs/server-utils/file/fileUploadHandler";
import type { UploadScopeType } from "types/ai";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(upload) 기능 요청 처리
 * @process 요청 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain files
 * @scope global
 */

export const runtime = "nodejs";

function getDefaultScope(user: AuthenticatedUserType): UploadScopeType {
  const id = String(toUnknownRecord(user).ID || "");
  return id.startsWith("guest:") ? "guest" : "user";
}

function getGuestKey(user: AuthenticatedUserType) {
  const id = String(toUnknownRecord(user).ID || "");
  return id.startsWith("guest:") ? id.slice("guest:".length) : id;
}

async function resolveUniverseId(req: NextRequest, form?: FormData) {
  const u = new URL(req.url);
  return (
    String(form?.get("universeId") || "").trim() ||
    u.searchParams.get("universeId") ||
    req.headers.get("x-universe-id") ||
    ""
  ).trim();
}

/**
 * POST /api/upload
 * form-data:
 * - file: File (required)
 * - kind: string (optional)
 * - pid: string (optional)
 * - scope: "user" | "guest" | "universe" (optional; default = 로그인:user / 게스트:guest)
 * - universeId: string (scope=universe일 때 필요)
 */
export const POST = withGuestOrAuth(
  async (_data: unknown, user: AuthenticatedUserType, req: NextRequest) => {
    // multipart를 여기서 소비해야 하므로, formData를 한 번만 읽고 handler에 전달
    const form = await req.formData();

    const scopeRaw = String(form.get("scope") || "").trim() as UploadScopeType;
    const scope: UploadScopeType =
      scopeRaw === "universe" || scopeRaw === "user" || scopeRaw === "guest" ? scopeRaw : getDefaultScope(user);

    // scope별 baseDir / baseUrl 계산
    if (scope === "universe") {
      const universeId = await resolveUniverseId(req, form);
      if (!universeId) return NextResponse.json({ success: false, error: "missing_universeId" }, { status: 400 });

      // 게스트는 universe 업로드 금지
      const isGuest = String(toUnknownRecord(user).ID || "").startsWith("guest:");
      if (isGuest) return NextResponse.json({ success: false, error: "auth_required" }, { status: 401 });

      const universe = await getUniverseById(universeId);
      if (!universe) return NextResponse.json({ success: false, error: "UNIVERSE_NOT_FOUND" }, { status: 404 });

      if (!canEditUniverse(user, universe)) {
        return NextResponse.json({ success: false, error: "no_universe_edit_permission" }, { status: 403 });
      }

      const actor = String(toUnknownRecord(user).ID || toUnknownRecord(user).uid || "");
      return handleUploadPOST(req, { scope: "universe", ownerId: universeId, universeId, createdBy: actor }, form);
    }

    if (scope === "guest") {
      const guestKey = getGuestKey(user);
      return handleUploadPOST(req, { scope: "guest", ownerId: guestKey, createdBy: `guest:${guestKey}` }, form);
    }

    // scope === "user"
    {
      const userRecord = toUnknownRecord(user);
      const isGuest = String(userRecord.ID || "").startsWith("guest:");
      if (isGuest) return NextResponse.json({ success: false, error: "auth_required" }, { status: 401 });

      const ownerId = String(userRecord.ID || userRecord.uid || "unknown");
      return handleUploadPOST(req, { scope: "user", ownerId, createdBy: ownerId }, form);
    }
  },
  undefined,
  "upload",
  { bodyParser: "none" } // multipart body를 middleware가 소비하지 않게
);

// DELETE /api/upload?url=... / scope=universe일 경우 universeId도 필요
export const DELETE = withGuestOrAuth(
  async (_data: unknown, user: AuthenticatedUserType, req: NextRequest) => {
    const u = new URL(req.url);
    const scopeRaw = (u.searchParams.get("scope") || "").trim() as UploadScopeType;
    const scope: UploadScopeType =
      scopeRaw === "universe" || scopeRaw === "user" || scopeRaw === "guest" ? scopeRaw : getDefaultScope(user);

    if (scope === "universe") {
      const universeId = await resolveUniverseId(req);
      if (!universeId) return NextResponse.json({ success: false, error: "missing_universeId" }, { status: 400 });

      const isGuest = String(toUnknownRecord(user).ID || "").startsWith("guest:");
      if (isGuest) return NextResponse.json({ success: false, error: "auth_required" }, { status: 401 });

      const universe = await getUniverseById(universeId);
      if (!universe) return NextResponse.json({ success: false, error: "UNIVERSE_NOT_FOUND" }, { status: 404 });

      if (!canEditUniverse(user, universe)) {
        return NextResponse.json({ success: false, error: "no_universe_edit_permission" }, { status: 403 });
      }

      const actor = String(toUnknownRecord(user).ID || toUnknownRecord(user).uid || "");
      return handleUploadDELETE(req, { scope: "universe", ownerId: universeId, universeId, createdBy: actor });
    }

    if (scope === "guest") {
      const guestKey = getGuestKey(user);
      return handleUploadDELETE(req, { scope: "guest", ownerId: guestKey, createdBy: `guest:${guestKey}` });
    }

    // scope === "user"
    {
      const userRecord = toUnknownRecord(user);
      const isGuest = String(userRecord.ID || "").startsWith("guest:");
      if (isGuest) return NextResponse.json({ success: false, error: "auth_required" }, { status: 401 });

      const ownerId = String(userRecord.ID || userRecord.uid || "unknown");
      return handleUploadDELETE(req, { scope: "user", ownerId, createdBy: ownerId });
    }
  },
  undefined,
  "upload_delete",
  { bodyParser: "none" }
);
