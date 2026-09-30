import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { countImageAssets, getPromptSnapshotMetaMapByJobIds, listImageAssets } from "libs/database/lab";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import type { UserExtendedScopeType } from "types/ai";
import type {
  LibraryImageKindType,
  PromptGenType,
  PromptVisibilityExtendedType,
  StudioGenerationSourceServiceType,
  StudioImageSearchFieldType,
} from "types/app";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { IImageAssetDocument } from "models/lab/ImageAssetSchema";

type ImageAssetLean = Pick<
  IImageAssetDocument,
  | "assetId"
  | "jobId"
  | "scope"
  | "uid"
  | "universeId"
  | "sourceService"
  | "sourceSurface"
  | "templateKey"
  | "visibility"
  | "provider"
  | "modelName"
  | "generationMode"
  | "extraPrompt"
  | "state"
  | "outputIndex"
  | "storage"
  | "createdAt"
>;

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 인증 사용자·공개 범위의 Studio 이미지 목록과 메타 조회
 * @process 쿼리 검증  사용자/유니버스 권한 확인  이미지 조건·생성일 범위 조회  표시 URL·메타 응답
 * @domain ai-image
 * @scope mixed-api
 */

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

type StudioImageReadScopeType = UserExtendedScopeType | "mine";

function toScope(raw?: string): StudioImageReadScopeType {
  const s = toSafeString(raw).toLowerCase();
  if (s === "all" || s === "universe" || s === "mine") return s;
  return "user";
}

function toSourceService(raw?: string | null): StudioGenerationSourceServiceType | undefined {
  const value = toSafeString(raw);
  if (
    value === "gen-studio" ||
    value === "tutors" ||
    value === "store" ||
    value === "play" ||
    value === "mini-app" ||
    value === "marketing" ||
    value === "admin" ||
    value === "agent" ||
    value === "upload" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function toLibraryImageKind(raw?: string | null): LibraryImageKindType | undefined {
  const value = toSafeString(raw).toLowerCase();
  return value === "generated" || value === "uploaded" ? value : undefined;
}

function toLimit(raw?: string | null) {
  return Math.max(1, Math.min(200, Number(raw || 50)));
}

function toSkip(raw?: string | null) {
  return Math.max(0, Number(raw || 0));
}

function toOptionalDate(raw?: string | null): Date | null | undefined {
  const value = toSafeString(raw);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toBool(raw?: string | null) {
  const s = toSafeString(raw).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function toGenerationMode(raw?: string | null): PromptGenType | undefined {
  const mode = toSafeString(raw).toLowerCase();
  return mode === "template" || mode === "custom" ? mode : undefined;
}

function toImageSearchField(raw?: string | null): StudioImageSearchFieldType {
  const field = toSafeString(raw);
  if (field === "assetId" || field === "templateKey" || field === "prompt") return field;
  return "all";
}

function getUid(user: AuthenticatedUserType) {
  return toSafeString(user?.uid || user?.ID);
}

function isAdmin(user: AuthenticatedUserType) {
  const roles = getUserRole(user);
  return roles.includes(USER_ROLES.ADMINISTRATOR);
}

async function canReadUniverseImages(user: AuthenticatedUserType, universeId: string) {
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
  const folder = toSafeString(searchParams?.get("folder"));
  const templateKey = toSafeString(searchParams?.get("templateKey"));
  const generationMode = toGenerationMode(searchParams?.get("generationMode"));
  const sourceService = toSourceService(searchParams?.get("sourceService"));
  const libraryKind = toLibraryImageKind(searchParams?.get("libraryKind"));
  const sourceSurface = toSafeString(searchParams?.get("sourceSurface")).slice(0, 80);
  const createdFrom = toOptionalDate(searchParams?.get("createdFrom"));
  const createdBefore = toOptionalDate(searchParams?.get("createdBefore"));
  const q = toSafeString(searchParams?.get("q")).slice(0, 120);
  const searchField = toImageSearchField(searchParams?.get("searchField"));
  const limit = toLimit(searchParams?.get("limit"));
  const skip = toSkip(searchParams?.get("skip"));
  const includeDeleted = toBool(searchParams?.get("includeDeleted"));
  const includeMeta = toBool(searchParams?.get("includeMeta"));
  const visibilityRaw = toSafeString(searchParams?.get("visibility")).toLowerCase();
  const visibility: PromptVisibilityExtendedType =
    visibilityRaw === "private" || visibilityRaw === "public" ? visibilityRaw : "all";
  const sharedPublicRead = scope === "all" && visibility === "public";
  const uid = getUid(user);

  if (
    createdFrom === null ||
    createdBefore === null ||
    (createdFrom && createdBefore && createdFrom.getTime() >= createdBefore.getTime())
  ) {
    return NextResponse.json({ ok: false, error: "date_range_invalid" }, { status: 400 });
  }

  if (scope === "all" && !isAdmin(user) && !sharedPublicRead) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  if ((scope === "user" || scope === "mine") && !uid) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (scope === "universe") {
    if (!universeId) return NextResponse.json({ ok: false, error: "universeId_required" }, { status: 400 });
    const allowed = await canReadUniverseImages(user, universeId);
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const state: "all" | "active" = includeDeleted && isAdmin(user) ? "all" : "active";
  const listParams: Parameters<typeof listImageAssets>[0] = {
    scope,
    uid: sharedPublicRead ? undefined : uid,
    universeId,
    templateKey,
    generationMode,
    sourceService: libraryKind === "uploaded" ? "upload" : sourceService,
    excludeSourceService: libraryKind === "generated" ? "upload" : undefined,
    sourceSurface,
    createdFrom,
    createdBefore,
    folder,
    state,
    visibility,
    q,
    searchField,
  };
  const [rows, total] = await Promise.all([
    listImageAssets({
      ...listParams,
      limit,
      skip,
    }),
    countImageAssets(listParams),
  ]);
  const pageInfo = {
    limit,
    skip,
    nextSkip: skip + rows.length < total ? skip + limit : null,
    hasMore: skip + rows.length < total,
    total,
  };

  if (includeMeta) {
    const editableUniverseIds = new Set<string>();
    const blockedUniverseIds = new Set<string>();
    const admin = isAdmin(user);
    const snapshotMetaByJobId = await getPromptSnapshotMetaMapByJobIds(
      ((rows || []) as ImageAssetLean[]).map((r) => String(r?.jobId || "")),
    );

    const metaRows = await Promise.all(((rows || []) as ImageAssetLean[]).map(async (r) => {
      const ownerUid = toSafeString(r?.uid || "");
      const assetScope = toSafeString(r?.scope || "");
      const assetUniverseId = toSafeString(r?.universeId || "");
      const isOwner = Boolean(uid && ownerUid && ownerUid === uid);

      let canEdit = admin || isOwner;

      if (!canEdit && assetScope === "universe" && assetUniverseId) {
        if (editableUniverseIds.has(assetUniverseId)) {
          canEdit = true;
        } else if (!blockedUniverseIds.has(assetUniverseId)) {
          const allowed = await canReadUniverseImages(user, assetUniverseId);
          if (allowed) {
            editableUniverseIds.add(assetUniverseId);
            canEdit = true;
          } else {
            blockedUniverseIds.add(assetUniverseId);
          }
        }
      }

      const snapshotMeta = snapshotMetaByJobId[String(r?.jobId || "")];
      const display = await resolveImageAssetDisplayUrl(r);

      return {
        canEdit,
        assetId: String(r?.assetId || ""),
        jobId: String(r?.jobId || ""),
        url: String(display.url || ""),
        urlKind: display.urlKind,
        urlExpiresAt: display.urlExpiresAt,
        refreshUrl: display.refreshUrl,
        width: Number(r?.storage?.width || 0) || undefined,
        height: Number(r?.storage?.height || 0) || undefined,
        templateKey: String(r?.templateKey || snapshotMeta?.templateKey || ""),
        templateTitle: String(snapshotMeta?.templateTitle || ""),
        visibility: String(r?.visibility || "private"),
        isOwner,
        scope: assetScope || "user",
        uid: ownerUid,
        universeId: assetUniverseId,
        sourceService: String(r?.sourceService || "unknown"),
        sourceSurface: String(r?.sourceSurface || "unknown"),
        createdAt: r?.createdAt || null,
        provider: String(r?.provider || ""),
        modelName: String(r?.modelName || ""),
        generationMode: String(r?.generationMode || ""),
        outputIndex: Number(r?.outputIndex || 0),
        extraPrompt: String(r?.extraPrompt || "") || snapshotMeta?.extraPrompt || "",
        state: String(r?.state || ""),
        storage: {
          driver: String(r?.storage?.driver || ""),
          access: String(r?.storage?.access || ""),
          mimeType: String(r?.storage?.mimeType || ""),
          ext: String(r?.storage?.ext || ""),
          bytes: Number(r?.storage?.bytes || 0),
          width: Number(r?.storage?.width || 0) || undefined,
          height: Number(r?.storage?.height || 0) || undefined,
        },
      };
    }));
    return NextResponse.json({ ok: true, data: metaRows, pageInfo });
  }

  const displayUrls = await Promise.all(((rows || []) as ImageAssetLean[]).map((r) => resolveImageAssetDisplayUrl(r)));
  const urls = Array.from(
    new Set(
      displayUrls
        .map((item) => String(item.url || ""))
        .map((u) => u.trim())
        .filter(Boolean),
    ),
  );

  return NextResponse.json({ ok: true, data: urls, pageInfo });
}

export const GET = withAuth(handler, undefined, "lab/studio-images");
