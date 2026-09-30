import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  detachImageAsset,
  getImageAssetByAssetId,
  hardDeleteImageAsset,
  restoreImageAsset,
  setImageAssetTemplateKey,
  setImageAssetVisibility,
  softDeleteImageAsset,
} from "libs/database/lab";
import { canAccessImageAsset, getAuthenticatedUid, isAuthenticatedAdmin } from "libs/server-utils/lab/imageAssetAccess";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { propagateImageAssetVisibilityChange } from "libs/server-utils/lab/imageAssetUrlPropagation";
import { logger } from "utils/log";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function toRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

const validateDelete = (data: UnknownRecord) => {
  const policy = toSafeString(data?.policy || "soft").toLowerCase();
  if (!["soft", "hard", "detach"].includes(policy)) {
    return { valid: false, error: "invalid_delete_policy" };
  }
  return { valid: true };
};

async function deleteHandler(data: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const assetId = decodeURIComponent(ctx?.params?.assetId || "");
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const asset = await getImageAssetByAssetId(assetId);
  if (!asset) return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });

  const allowed = await canAccessImageAsset(user, asset);
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const policy = toSafeString(data?.policy || "soft").toLowerCase();
  const reason = toSafeString(data?.reason || "user_delete");
  const deletedBy = getAuthenticatedUid(user);

  const out =
    policy === "hard"
      ? await hardDeleteImageAsset({ assetId, deletedBy, reason })
      : policy === "detach"
        ? await detachImageAsset({ assetId, deletedBy, reason })
        : await softDeleteImageAsset({ assetId, deletedBy, reason, policy: "soft" });

  return NextResponse.json({
    ok: true,
    data: {
      assetId,
      state: String(out?.state || ""),
      policy: String(out?.deletePolicy || ""),
      deletedAt: out?.deletedAt || null,
    },
  });
}

const validatePatch = (data: UnknownRecord) => {
  const action = toSafeString(data?.action).toLowerCase();
  if (action === "restore") return { valid: true };
  if (action === "set_visibility") {
    const v = toSafeString(data?.visibility).toLowerCase();
    if (v === "private" || v === "public") return { valid: true };
    return { valid: false, error: "invalid_visibility" };
  }
  if (action === "set_template_key") return { valid: true };
  return { valid: false, error: "invalid_action" };
};

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const assetId = decodeURIComponent(ctx?.params?.assetId || "");
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const asset = await getImageAssetByAssetId(assetId);
  if (!asset) return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });

  const allowed = await canAccessImageAsset(user, asset);
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const action = toSafeString(data?.action).toLowerCase();
  if (action === "set_visibility") {
    const visibility = toSafeString(data?.visibility).toLowerCase() === "public" ? "public" : "private";
    const updated = await setImageAssetVisibility({ assetId, visibility });

    // 공개/비공개 전환 시 스토리지 URL이 바뀌므로, 이전 URL을 저장해둔 다운스트림 레코드를 새 URL로 갱신한다.
    // 실패해도 자산 상태는 이미 갱신되었으므로 best-effort로 처리한다.
    try {
      await propagateImageAssetVisibilityChange({
        assetId,
        oldVisibility: toSafeString(asset?.visibility) || "private",
        newVisibility: visibility,
        oldStorage: toRecord(asset?.storage),
        newStorage: toRecord(updated?.storage),
      });
    } catch (error) {
      logger.warn("[studio-images] visibility url propagation failed:", error);
    }

    const display = updated
      ? await resolveImageAssetDisplayUrl(updated)
      : ({ url: "", urlKind: "none", urlExpiresAt: undefined, refreshUrl: undefined } as const);
    return NextResponse.json({
      ok: true,
      data: {
        assetId,
        visibility: String(updated?.visibility || "private"),
        url: display.url,
        urlKind: display.urlKind,
        urlExpiresAt: display.urlExpiresAt,
        refreshUrl: display.refreshUrl,
      },
    });
  }

  if (action === "set_template_key") {
    if (!isAuthenticatedAdmin(user)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN_ADMIN_ONLY" }, { status: 403 });
    }

    const templateKey = toSafeString(data?.templateKey);
    const updated = await setImageAssetTemplateKey({ assetId, templateKey });
    return NextResponse.json({
      ok: true,
      data: { assetId, templateKey: String(updated?.templateKey || "") },
    });
  }

  if (asset?.hardDeletedAt) {
    return NextResponse.json({ ok: false, error: "hard_deleted_asset_cannot_restore" }, { status: 409 });
  }

  const restored = await restoreImageAsset(assetId);
  return NextResponse.json({
    ok: true,
    data: {
      assetId,
      state: String(restored?.state || ""),
    },
  });
}

export const DELETE = withAuth(deleteHandler, validateDelete, "lab/studio-images:delete");
export const PATCH = withAuth(patchHandler, validatePatch, "lab/studio-images:patch");
