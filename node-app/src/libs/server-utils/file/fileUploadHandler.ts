import "server-only";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { UploadedMediaScope } from "models/media/UploadedMediaAssetSchema";
import { deleteUploadedMedia, storeUploadedMedia, UploadedMediaError } from "./uploadedMediaStorage";
import { logger } from "utils/log";

export function safeSeg(value: string) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

type UploadOwner = {
  scope: UploadedMediaScope;
  ownerId: string;
  universeId?: string;
  createdBy: string;
  optimizeImage?: (input: Buffer) => Promise<{
    buffer: Buffer;
    mimeType: string;
    bytes: number;
    width?: number;
    height?: number;
    force?: boolean;
  }>;
  maxOriginalGifBytes?: number;
};

export async function handleUploadPOST(req: NextRequest, owner: UploadOwner, formOverride?: FormData) {
  try {
    const form = formOverride ?? (await req.formData());
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "missing_file" }, { status: 400 });
    const kind = safeSeg(String(form.get("kind") || "misc")) || "misc";
    const pidRaw = String(form.get("pid") || "").trim();
    const pid = safeSeg(pidRaw) || `draft_${crypto.randomUUID()}`;
    const stored = await storeUploadedMedia({ ...owner, file, kind, pid });
    const isDraft = !pidRaw || pid.startsWith("draft_");
    return NextResponse.json({
      success: true,
      data: {
        url: stored.url,
        filename: stored.filename,
        fileId: stored.assetId,
        assetId: stored.assetId,
        kind,
        pid: isDraft ? null : pid,
        draftPid: isDraft ? pid : null,
        mimeType: stored.mimeType,
        bytes: stored.bytes,
        sha256: stored.sha256,
        width: stored.width,
        height: stored.height,
        optimized: stored.optimized,
        sourceBytes: stored.sourceBytes,
        storage: stored.storage,
      },
    });
  } catch (error) {
    logger.error("[upload:r2] failed", error);
    const status = error instanceof UploadedMediaError ? error.status : 500;
    const code = error instanceof UploadedMediaError ? error.message : "upload_failed";
    return NextResponse.json({ success: false, error: code }, { status });
  }
}

export async function handleUploadDELETE(req: NextRequest, owner: UploadOwner) {
  try {
    const url = new URL(req.url).searchParams.get("url") || "";
    if (!url) return NextResponse.json({ success: false, error: "invalid_url" }, { status: 400 });
    await deleteUploadedMedia({ url, scope: owner.scope, ownerId: owner.ownerId });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[upload:r2:delete] failed", error);
    const status = error instanceof UploadedMediaError ? error.status : 500;
    const code = error instanceof UploadedMediaError ? error.message : "delete_failed";
    return NextResponse.json({ success: false, error: code }, { status });
  }
}
