import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listContentAssetPreviewsByTemplateKeys } from "libs/database/lab";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { truncateContentAssetPreview } from "utils/lab/contentAssetPreview";

type PreviewRow = {
  assetId?: string;
  templateKey?: string;
  visibility?: string;
  uid?: string;
  createdAt?: Date | string | null;
  textPreview?: string;
  chars?: number;
};

type PreviewGroup = { templateKey?: string; rows?: PreviewRow[] };

export const runtime = "nodejs";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toTemplateKeys(raw: string | null) {
  return Array.from(new Set(toSafeString(raw).split(",").map((key) => key.trim()).filter(Boolean))).slice(0, 100);
}

function toPerTemplate(raw: string | null) {
  return Math.max(1, Math.min(6, Number(raw || 2)));
}

function getUid(user: AuthenticatedUserType) {
  return toSafeString(user?.uid || user?.ID);
}

function isAdmin(user: AuthenticatedUserType) {
  return getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
}

async function handler(_data: unknown, user: AuthenticatedUserType, request?: NextRequest) {
  const searchParams = request ? new URL(request.url).searchParams : null;
  const templateKeys = toTemplateKeys(searchParams?.get("templateKeys") || null);
  const perTemplate = toPerTemplate(searchParams?.get("perTemplate") || null);
  const requestedScope = toSafeString(searchParams?.get("scope"));
  const scope = requestedScope === "universe" ? "universe" : "user";
  const universeId = toSafeString(searchParams?.get("universeId"));
  const uid = getUid(user);

  if (!templateKeys.length) return NextResponse.json({ ok: true, data: {} });
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  if (scope === "universe") {
    if (!universeId) return NextResponse.json({ ok: false, error: "universeId_required" }, { status: 400 });
    if (!isAdmin(user)) {
      const universe = await getUniverseById(universeId);
      if (!universe || !canEditUniverse(user, universe)) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
      }
    }
  }

  const groups = (await listContentAssetPreviewsByTemplateKeys({
    templateKeys,
    perTemplate,
    scope,
    uid,
    universeId,
    visibility: "all",
  })) as PreviewGroup[];
  const data = templateKeys.reduce<Record<string, unknown[]>>((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});

  groups.forEach((group) => {
    const templateKey = toSafeString(group?.templateKey);
    if (!templateKey || !Object.hasOwn(data, templateKey)) return;
    data[templateKey] = (group?.rows || []).map((row) => ({
      canEdit: true,
      isOwner: Boolean(toSafeString(row?.uid) && toSafeString(row?.uid) === uid),
      assetId: toSafeString(row?.assetId),
      textPreview: truncateContentAssetPreview(row?.textPreview),
      templateKey: toSafeString(row?.templateKey),
      visibility: row?.visibility === "public" ? "public" : "private",
      createdAt: row?.createdAt || null,
      content: { chars: Number(row?.chars || 0) },
    }));
  });

  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withAuth(handler, undefined, "lab/studio-contents:template-previews");
