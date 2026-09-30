import { NextRequest, NextResponse } from "next/server";
import { countImageAssets, getPromptSnapshotMetaMapByJobIds, listImageAssets } from "libs/database/lab";
import type { PromptGenType, StudioImageSearchFieldType } from "types/app";
import type { IImageAssetDocument } from "models/lab/ImageAssetSchema";

type ImageAssetLean = Pick<
  IImageAssetDocument,
  | "assetId"
  | "jobId"
  | "scope"
  | "uid"
  | "universeId"
  | "templateKey"
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

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function toLimit(raw?: string | null) {
  return Math.max(1, Math.min(200, Number(raw || 50)));
}

function toSkip(raw?: string | null) {
  return Math.max(0, Number(raw || 0));
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

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const templateKey = toSafeString(searchParams.get("templateKey"));
  const generationMode = toGenerationMode(searchParams.get("generationMode"));
  const folder = toSafeString(searchParams.get("folder"));
  const q = toSafeString(searchParams.get("q")).slice(0, 120);
  const searchField = toImageSearchField(searchParams.get("searchField"));
  const limit = toLimit(searchParams.get("limit"));
  const skip = toSkip(searchParams.get("skip"));
  const includeMeta = toBool(searchParams.get("includeMeta"));

  const listParams: Parameters<typeof listImageAssets>[0] = {
    scope: "all",
    templateKey,
    generationMode,
    folder,
    state: "active",
    visibility: "public",
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
    const snapshotMetaByJobId = await getPromptSnapshotMetaMapByJobIds(
      ((rows || []) as ImageAssetLean[]).map((r) => String(r?.jobId || "")),
    );
    const data = ((rows || []) as ImageAssetLean[]).map((r) => {
      const snapshotMeta = snapshotMetaByJobId[String(r?.jobId || "")];

      return {
        canEdit: false,
        isOwner: false,
        assetId: String(r?.assetId || ""),
        jobId: String(r?.jobId || ""),
        url: String(r?.storage?.url || ""),
        width: Number(r?.storage?.width || 0) || undefined,
        height: Number(r?.storage?.height || 0) || undefined,
        templateKey: String(r?.templateKey || snapshotMeta?.templateKey || ""),
        templateTitle: String(snapshotMeta?.templateTitle || ""),
        visibility: "public",
        scope: String(r?.scope || "user"),
        uid: String(r?.uid || ""),
        universeId: String(r?.universeId || ""),
        createdAt: r?.createdAt || null,
        provider: String(r?.provider || ""),
        modelName: String(r?.modelName || ""),
        generationMode: String(r?.generationMode || ""),
        outputIndex: Number(r?.outputIndex || 0),
        extraPrompt: String(r?.extraPrompt || "") || snapshotMeta?.extraPrompt || "",
        state: String(r?.state || ""),
        storage: {
          mimeType: String(r?.storage?.mimeType || ""),
          ext: String(r?.storage?.ext || ""),
          bytes: Number(r?.storage?.bytes || 0),
          width: Number(r?.storage?.width || 0) || undefined,
          height: Number(r?.storage?.height || 0) || undefined,
        },
      };
    });
    return NextResponse.json({ ok: true, data, pageInfo });
  }

  const urls = Array.from(
    new Set(
      ((rows || []) as ImageAssetLean[])
        .map((r) => String(r?.storage?.url || ""))
        .map((u) => u.trim())
        .filter(Boolean),
    ),
  );

  return NextResponse.json({ ok: true, data: urls, pageInfo });
}
