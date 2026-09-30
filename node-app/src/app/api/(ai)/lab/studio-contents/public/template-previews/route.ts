import { NextRequest, NextResponse } from "next/server";
import { listContentAssetPreviewsByTemplateKeys } from "libs/database/lab";
import { truncateContentAssetPreview } from "utils/lab/contentAssetPreview";

type TemplatePreviewRow = {
  assetId?: string;
  templateKey?: string;
  visibility?: string;
  createdAt?: Date | string | null;
  textPreview?: string;
  chars?: number;
};

type TemplatePreviewGroup = { templateKey?: string; rows?: TemplatePreviewRow[] };

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

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const templateKeys = toTemplateKeys(searchParams.get("templateKeys"));
  const perTemplate = toPerTemplate(searchParams.get("perTemplate"));

  if (!templateKeys.length) {
    return NextResponse.json({ ok: true, data: {} }, { headers: { "Cache-Control": "public, max-age=30" } });
  }

  const groups = (await listContentAssetPreviewsByTemplateKeys({
    templateKeys,
    perTemplate,
    scope: "all",
    visibility: "public",
  })) as TemplatePreviewGroup[];
  const data = templateKeys.reduce<Record<string, unknown[]>>((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});

  groups.forEach((group) => {
    const templateKey = toSafeString(group?.templateKey);
    if (!templateKey || !Object.hasOwn(data, templateKey)) return;
    data[templateKey] = (group?.rows || []).map((row) => ({
      canEdit: false,
      isOwner: false,
      assetId: toSafeString(row?.assetId),
      textPreview: truncateContentAssetPreview(row?.textPreview),
      templateKey: toSafeString(row?.templateKey),
      visibility: "public",
      createdAt: row?.createdAt || null,
      content: { chars: Number(row?.chars || 0) },
    }));
  });

  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
  );
}
