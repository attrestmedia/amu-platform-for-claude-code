import { NextRequest, NextResponse } from "next/server";
import { listLatestPublicImageAssetsByTemplateKeys } from "libs/database/lab";
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

type TemplatePreviewGroup = { templateKey: string; rows: ImageAssetLean[] };

type TemplatePreviewItem = {
  canEdit: false;
  isOwner: false;
  assetId: string;
  jobId: string;
  url: string;
  width: number | undefined;
  height: number | undefined;
  templateKey: string;
  visibility: "public";
  scope: string;
  uid: string;
  universeId: string;
  createdAt: ImageAssetLean["createdAt"] | null;
  provider: string;
  modelName: string;
  generationMode: string;
  outputIndex: number;
  extraPrompt: string;
  state: string;
  storage: {
    mimeType: string;
    ext: string;
    bytes: number;
    width: number | undefined;
    height: number | undefined;
  };
};

export const runtime = "nodejs";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toTemplateKeys(raw: string | null) {
  return Array.from(new Set(toSafeString(raw).split(",").map((key) => key.trim()).filter(Boolean))).slice(0, 100);
}

function toPerTemplate(raw: string | null) {
  return Math.max(1, Math.min(12, Number(raw || 2)));
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const templateKeys = toTemplateKeys(searchParams.get("templateKeys"));
  const perTemplate = toPerTemplate(searchParams.get("perTemplate"));

  if (!templateKeys.length) {
    return NextResponse.json({ ok: true, data: {} }, { headers: { "Cache-Control": "public, max-age=30" } });
  }

  const rows = (await listLatestPublicImageAssetsByTemplateKeys({ templateKeys, perTemplate })) as TemplatePreviewGroup[];
  const data = templateKeys.reduce<Record<string, TemplatePreviewItem[]>>((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});

  (rows || []).forEach((group) => {
    const templateKey = toSafeString(group?.templateKey);
    if (!templateKey) return;
    data[templateKey] = Array.isArray(group?.rows)
      ? group.rows.map((r) => ({
          canEdit: false,
          isOwner: false,
          assetId: String(r?.assetId || ""),
          jobId: String(r?.jobId || ""),
          url: String(r?.storage?.url || ""),
          width: Number(r?.storage?.width || 0) || undefined,
          height: Number(r?.storage?.height || 0) || undefined,
          templateKey: String(r?.templateKey || ""),
          visibility: "public",
          scope: String(r?.scope || "user"),
          uid: String(r?.uid || ""),
          universeId: String(r?.universeId || ""),
          createdAt: r?.createdAt || null,
          provider: String(r?.provider || ""),
          modelName: String(r?.modelName || ""),
          generationMode: String(r?.generationMode || ""),
          outputIndex: Number(r?.outputIndex || 0),
          extraPrompt: String(r?.extraPrompt || ""),
          state: String(r?.state || ""),
          storage: {
            mimeType: String(r?.storage?.mimeType || ""),
            ext: String(r?.storage?.ext || ""),
            bytes: Number(r?.storage?.bytes || 0),
            width: Number(r?.storage?.width || 0) || undefined,
            height: Number(r?.storage?.height || 0) || undefined,
          },
        }))
      : [];
  });

  return NextResponse.json(
    { ok: true, data },
    {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
