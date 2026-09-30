import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listContentAssets } from "libs/database/lab";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth";
import type { UserExtendedScopeType } from "types/ai";
import type { PromptVisibilityExtendedType } from "types/app";
import type { IContentAssetDocument } from "models/lab/ContentAssetSchema";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { truncateContentAssetPreview } from "utils/lab/contentAssetPreview";

type ContentAssetLean = Pick<
  IContentAssetDocument,
  | "assetId"
  | "scope"
  | "uid"
  | "universeId"
  | "templateKey"
  | "visibility"
  | "provider"
  | "modelName"
  | "generationMode"
  | "extraPrompt"
  | "state"
  | "outputIndex"
  | "content"
  | "createdAt"
>;

export const runtime = "nodejs";

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function toScope(raw?: string): UserExtendedScopeType {
  const s = toSafeString(raw).toLowerCase();
  if (s === "all" || s === "universe") return s;
  return "user";
}

function toLimit(raw?: string | null) {
  return Math.max(1, Math.min(200, Number(raw || 50)));
}

function toBool(raw?: string | null) {
  const s = toSafeString(raw).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function getUid(user: AuthenticatedUserType) {
  return toSafeString(user?.uid || user?.ID);
}

function isAdmin(user: AuthenticatedUserType) {
  const roles = getUserRole(user);
  return roles.includes(USER_ROLES.ADMINISTRATOR);
}

async function canReadUniverseContents(user: AuthenticatedUserType, universeId: string) {
  if (isAdmin(user)) return true;
  const universe = await getUniverseById(universeId);
  if (!universe) return false;
  return canEditUniverse(user, universe);
}

async function handler(_data: unknown, user: AuthenticatedUserType, request?: NextRequest) {
  const url = request ? new URL(request.url) : null;
  const searchParams = url?.searchParams;

  const scope = toScope(searchParams?.get("scope") || "user");
  const universeId = toSafeString(searchParams?.get("universeId"));
  const templateKey = toSafeString(searchParams?.get("templateKey"));
  const limit = toLimit(searchParams?.get("limit"));
  const includeDeleted = toBool(searchParams?.get("includeDeleted"));
  const includeMeta = toBool(searchParams?.get("includeMeta"));
  const visibilityRaw = toSafeString(searchParams?.get("visibility")).toLowerCase();
  const visibility: PromptVisibilityExtendedType =
    visibilityRaw === "private" || visibilityRaw === "public" ? visibilityRaw : "all";
  const sharedPublicRead = scope === "all" && visibility === "public";
  const uid = getUid(user);

  if (scope === "all" && !isAdmin(user) && !sharedPublicRead) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  if (scope === "user" && !uid) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (scope === "universe") {
    if (!universeId) return NextResponse.json({ ok: false, error: "universeId_required" }, { status: 400 });
    const allowed = await canReadUniverseContents(user, universeId);
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const state = includeDeleted && isAdmin(user) ? "all" : "active";
  const rows = await listContentAssets({
    scope,
    uid: sharedPublicRead ? undefined : uid,
    universeId,
    templateKey,
    state,
    limit,
    visibility,
  });

  if (includeMeta) {
    const editableUniverseIds = new Set<string>();
    const blockedUniverseIds = new Set<string>();
    const admin = isAdmin(user);

    const metaRows = await Promise.all(((rows || []) as ContentAssetLean[]).map(async (r) => {
      const ownerUid = toSafeString(r?.uid || "");
      const assetScope = toSafeString(r?.scope || "");
      const assetUniverseId = toSafeString(r?.universeId || "");
      const isOwner = Boolean(uid && ownerUid && ownerUid === uid);

      let canEdit = admin || isOwner;
      if (!canEdit && assetScope === "universe" && assetUniverseId) {
        if (editableUniverseIds.has(assetUniverseId)) {
          canEdit = true;
        } else if (!blockedUniverseIds.has(assetUniverseId)) {
          const allowed = await canReadUniverseContents(user, assetUniverseId);
          if (allowed) {
            editableUniverseIds.add(assetUniverseId);
            canEdit = true;
          } else {
            blockedUniverseIds.add(assetUniverseId);
          }
        }
      }

      const text = String(r?.content?.text || "");
      return {
        canEdit,
        assetId: String(r?.assetId || ""),
        textPreview: truncateContentAssetPreview(text),
        templateKey: String(r?.templateKey || ""),
        visibility: String(r?.visibility || "private"),
        isOwner,
        scope: assetScope || "user",
        uid: ownerUid,
        universeId: assetUniverseId,
        createdAt: r?.createdAt || null,
        provider: String(r?.provider || ""),
        modelName: String(r?.modelName || ""),
        generationMode: String(r?.generationMode || ""),
        extraPrompt: String(r?.extraPrompt || ""),
        state: String(r?.state || ""),
        outputIndex: Number(r?.outputIndex || 0),
        content: {
          chars: Number(r?.content?.chars || 0),
          bytes: Number(r?.content?.bytes || 0),
        },
      };
    }));

    return NextResponse.json({ ok: true, data: metaRows });
  }

  const texts = ((rows || []) as ContentAssetLean[]).map((r) => String(r?.content?.text || "")).filter(Boolean);
  return NextResponse.json({ ok: true, data: texts });
}

export const GET = withAuth(handler, undefined, "lab/studio-contents");
