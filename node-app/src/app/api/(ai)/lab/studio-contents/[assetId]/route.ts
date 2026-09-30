import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  detachContentAsset,
  getContentAssetByAssetId,
  hardDeleteContentAsset,
  restoreContentAsset,
  setContentAssetVisibility,
  softDeleteContentAsset,
} from "libs/database/lab";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import type { IContentAssetDocument } from "models/lab/ContentAssetSchema";
import { truncateContentAssetPreview } from "utils/lab/contentAssetPreview";

type ContentAssetLike = Pick<IContentAssetDocument, "scope" | "uid" | "universeId">;

export const runtime = "nodejs";

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function isAdmin(user: AuthenticatedUserType) {
  const roles = getUserRole(user);
  return roles.includes(USER_ROLES.ADMINISTRATOR);
}

function uidOf(user: AuthenticatedUserType) {
  return toSafeString(user?.uid || user?.ID);
}

async function canAccessAsset(user: AuthenticatedUserType, asset: ContentAssetLike | null | undefined) {
  if (isAdmin(user)) return true;

  const scope = toSafeString(asset?.scope);
  const ownerUid = toSafeString(asset?.uid);
  const isOwner = Boolean(ownerUid && ownerUid === uidOf(user));

  if (scope === "user") {
    return isOwner;
  }

  if (scope === "universe") {
    if (isOwner) return true;

    const universeId = toSafeString(asset?.universeId);
    if (!universeId) return false;
    const universe = await getUniverseById(universeId);
    if (!universe) return false;
    return canEditUniverse(user, universe);
  }

  return isOwner;
}

async function getHandler(_data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const assetId = decodeURIComponent(ctx?.params?.assetId || "");
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const asset = await getContentAssetByAssetId(assetId);
  if (!asset || asset.state !== "active") {
    return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });
  }

  const allowed = await canAccessAsset(user, asset);
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const uid = uidOf(user);
  const text = String(asset?.content?.text || "");
  return NextResponse.json({
    ok: true,
    data: {
      canEdit: true,
      isOwner: Boolean(uid && toSafeString(asset.uid) === uid),
      assetId: toSafeString(asset.assetId),
      text,
      textPreview: truncateContentAssetPreview(text),
      templateKey: toSafeString(asset.templateKey),
      visibility: asset.visibility === "public" ? "public" : "private",
      createdAt: asset.createdAt || null,
      provider: toSafeString(asset.provider),
      modelName: toSafeString(asset.modelName),
      generationMode: toSafeString(asset.generationMode),
      state: toSafeString(asset.state),
      outputIndex: Number(asset.outputIndex || 0),
      content: {
        chars: Number(asset?.content?.chars || 0),
        bytes: Number(asset?.content?.bytes || 0),
      },
    },
  });
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

  const asset = await getContentAssetByAssetId(assetId);
  if (!asset) return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });

  const allowed = await canAccessAsset(user, asset);
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const policy = toSafeString(data?.policy || "soft").toLowerCase();
  const reason = toSafeString(data?.reason || "user_delete");
  const deletedBy = uidOf(user);

  const out =
    policy === "hard"
      ? await hardDeleteContentAsset({ assetId, deletedBy, reason })
      : policy === "detach"
        ? await detachContentAsset({ assetId, deletedBy, reason })
        : await softDeleteContentAsset({ assetId, deletedBy, reason, policy: "soft" });

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
  return { valid: false, error: "invalid_action" };
};

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const assetId = decodeURIComponent(ctx?.params?.assetId || "");
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const asset = await getContentAssetByAssetId(assetId);
  if (!asset) return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });

  const allowed = await canAccessAsset(user, asset);
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const action = toSafeString(data?.action).toLowerCase();
  if (action === "set_visibility") {
    const visibility = toSafeString(data?.visibility).toLowerCase() === "public" ? "public" : "private";
    const updated = await setContentAssetVisibility({ assetId, visibility });
    return NextResponse.json({
      ok: true,
      data: { assetId, visibility: String(updated?.visibility || "private") },
    });
  }

  if (asset?.hardDeletedAt) {
    return NextResponse.json({ ok: false, error: "hard_deleted_asset_cannot_restore" }, { status: 409 });
  }

  const restored = await restoreContentAsset(assetId);
  return NextResponse.json({
    ok: true,
    data: {
      assetId,
      state: String(restored?.state || ""),
    },
  });
}

export const DELETE = withAuth(deleteHandler, validateDelete, "lab/studio-contents:delete");
export const PATCH = withAuth(patchHandler, validatePatch, "lab/studio-contents:patch");
export const GET = withAuth(getHandler, undefined, "lab/studio-contents:get");
