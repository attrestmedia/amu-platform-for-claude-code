import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  getTtsPreviewAsset,
  listTtsPreviewAssetsForModeration,
} from "libs/database/lab";
import { moderateTtsPreviewAsset } from "libs/server-utils/audio/ttsPreviewAssetLifecycle";
import type { TtsPreviewModerationStatus } from "models/lab";
import { toUnknownRecord, type UnknownRecord } from "utils/common";

export const runtime = "nodejs";
const DEFAULT_PAGE_LIMIT = 24;

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function toDto(asset: UnknownRecord) {
  const assetId = String(asset.assetId || "");
  return {
    assetId,
    ownerUid: String(asset.ownerUid || ""),
    provider: String(asset.provider || "openai"),
    modelName: String(asset.modelName || ""),
    voiceId: String(asset.voiceId || ""),
    locale: String(asset.locale || ""),
    text: String(asset.text || ""),
    speed: Number(asset.speed || 1),
    moderationStatus: String(asset.moderationStatus || "pending"),
    moderationReason: String(asset.moderationReason || ""),
    audioUrl: `/api/speech/voice-previews/${encodeURIComponent(assetId)}`,
    bytes: Number(asset.bytes || 0),
    createdAt: asset.createdAt || null,
    moderatedAt: asset.moderatedAt || null,
  };
}

function decodeCursor(raw: string) {
  if (!raw) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      createdAt?: string;
      assetId?: string;
    };
    const createdAt = new Date(String(decoded.createdAt || ""));
    const assetId = String(decoded.assetId || "").trim();
    if (Number.isNaN(createdAt.getTime()) || !assetId) return null;
    return { createdAt, assetId };
  } catch {
    return null;
  }
}

function encodeCursor(asset: UnknownRecord) {
  return Buffer.from(
    JSON.stringify({ createdAt: new Date(String(asset.createdAt || "")).toISOString(), assetId: String(asset.assetId || "") }),
  ).toString("base64url");
}

async function getHandler(_data: unknown, _user: AuthenticatedUserType, request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const rawStatus = String(params.get("status") || "pending");
  const status = ["pending", "approved", "rejected"].includes(rawStatus)
    ? (rawStatus as TtsPreviewModerationStatus)
    : "pending";
  const cursor = decodeCursor(String(params.get("cursor") || ""));
  if (cursor === null) {
    return NextResponse.json({ ok: false, error: "INVALID_MODERATION_CURSOR" }, { status: 400 });
  }
  const limit = Math.max(1, Math.min(50, Number(params.get("limit") || DEFAULT_PAGE_LIMIT)));
  const rows = await listTtsPreviewAssetsForModeration({
    status,
    limit,
    cursor,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return NextResponse.json({
    ok: true,
    data: {
      items: page.map((row) => toDto(row as UnknownRecord)),
      nextCursor: hasMore && last ? encodeCursor(toUnknownRecord(last)) : null,
    },
  });
}

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType) {
  const assetId = String(data.assetId || "").trim();
  const decision = data.decision === "approved" ? "approved" : "rejected";
  const reason = String(data.reason || "").trim().slice(0, 240);
  if (decision === "rejected" && !reason) {
    return NextResponse.json({ ok: false, error: "MODERATION_REASON_REQUIRED" }, { status: 400 });
  }

  const asset = await getTtsPreviewAsset(assetId);
  if (!asset || asset.state !== "ready" || asset.visibility !== "public" || asset.source !== "custom") {
    return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_NOT_FOUND" }, { status: 404 });
  }
  const updated = await moderateTtsPreviewAsset({
    asset: toUnknownRecord(asset.toObject?.() || asset),
    decision,
    moderatedBy: uidOf(user),
    reason,
  });
  if (!updated) {
    return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_MODERATION_UPDATE_FAILED" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, data: toDto(toUnknownRecord(updated.toObject?.() || updated)) });
}

const validatePatch = (data: UnknownRecord) => {
  if (!String(data.assetId || "").trim() || !["approved", "rejected"].includes(String(data.decision || ""))) {
    return { valid: false, error: "INVALID_MODERATION_ACTION" };
  }
  return { valid: true };
};

export const GET = withAuth(getHandler, undefined, "admin/tts-preview-moderation:get", { requireAdmin: true });
export const PATCH = withAuth(patchHandler, validatePatch, "admin/tts-preview-moderation:patch", {
  requireAdmin: true,
});
