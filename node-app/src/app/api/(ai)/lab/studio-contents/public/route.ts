import { NextRequest, NextResponse } from "next/server";
import { listContentAssets } from "libs/database/lab";
import type { IContentAssetDocument } from "models/lab/ContentAssetSchema";
import { toPublicContentAssetMeta } from "utils/lab/contentAssetPolicy";

type ContentAssetLean = Pick<
  IContentAssetDocument,
  | "assetId"
  | "scope"
  | "templateKey"
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

function toLimit(raw?: string | null) {
  return Math.max(1, Math.min(200, Number(raw || 50)));
}

function toBool(raw?: string | null) {
  const s = toSafeString(raw).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const templateKey = toSafeString(searchParams.get("templateKey"));
  const limit = toLimit(searchParams.get("limit"));
  const includeMeta = toBool(searchParams.get("includeMeta"));

  const rows = await listContentAssets({
    scope: "all",
    templateKey,
    state: "active",
    limit,
    visibility: "public",
  });

  if (includeMeta) {
    const data = ((rows || []) as ContentAssetLean[]).map(toPublicContentAssetMeta);
    return NextResponse.json({ ok: true, data });
  }

  const texts = ((rows || []) as ContentAssetLean[]).map((r) => String(r?.content?.text || "")).filter(Boolean);
  return NextResponse.json({ ok: true, data: texts });
}
