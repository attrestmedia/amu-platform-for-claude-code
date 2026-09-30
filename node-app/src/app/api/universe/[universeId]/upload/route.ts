import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { NextRouteContext } from "libs/server-utils/api/_helpers";
import { handleUploadPOST, handleUploadDELETE } from "libs/server-utils/file/fileUploadHandler";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / upload) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain files
 * @scope universe
 */

export const runtime = "nodejs";

function resolveUniverseId(context: NextRouteContext) {
  const params = toUnknownRecord(context?.params);
  return String(params.universeId || "").trim();
}

// 유니버스 전용 래퍼 - 권한 체크: withAuth + checkUniversePermission(requireEdit)
export const POST = withAuth(
  async (_body: unknown, user: unknown, req: NextRequest, context: NextRouteContext) => {
    const universeId = resolveUniverseId(context);
    if (!universeId) {
      return NextResponse.json({ success: false, error: "missing_universeId" }, { status: 400 });
    }

    const actor = String(toUnknownRecord(user).ID || toUnknownRecord(user).uid || "");
    return handleUploadPOST(req, { scope: "universe", ownerId: universeId, universeId, createdBy: actor });
  },
  undefined,
  "universe_upload",
  {
    checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
    bodyParser: "none",
  }
);

export const DELETE = withAuth(
  async (_data: unknown, user: unknown, req: NextRequest, context: NextRouteContext) => {
    const universeId = resolveUniverseId(context);
    if (!universeId) {
      return NextResponse.json({ success: false, error: "missing_universeId" }, { status: 400 });
    }

    const actor = String(toUnknownRecord(user).ID || toUnknownRecord(user).uid || "");
    return handleUploadDELETE(req, { scope: "universe", ownerId: universeId, universeId, createdBy: actor });
  },
  undefined,
  "universe_upload_delete",
  {
    checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
    bodyParser: "none",
  }
);
