import { NextRequest, NextResponse } from "next/server";
import { USER_ROLES } from "consts/auth";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import {
  findReusableTtsPreviewAsset,
  getTtsPreviewAsset,
  softDeleteTtsPreviewAsset,
  TtsPreviewQuotaError,
  TtsPreviewQuotaUnavailableError,
} from "libs/database/lab";
import { deleteVoiceAssetByStorage, resolveVoiceAssetPlaybackUrl } from "libs/server-utils/audio/voiceAssetStorage";
import { transitionTtsPreviewVisibility } from "libs/server-utils/audio/ttsPreviewAssetLifecycle";
import type { TtsPreviewVisibility } from "models/lab";
import { toUnknownRecord, type UnknownRecord } from "utils/common";

export const runtime = "nodejs";

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function isAdmin(user: AuthenticatedUserType) {
  return getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
}

function assetIdOf(context: NextRouteContext) {
  return decodeURIComponent(String(context?.params?.assetId || "")).trim();
}

function isOwner(user: AuthenticatedUserType, ownerUid: unknown) {
  return uidOf(user) === String(ownerUid || "");
}

function toDto(asset: UnknownRecord, user: AuthenticatedUserType) {
  const assetId = String(asset.assetId || "");
  const owner = uidOf(user) === String(asset.ownerUid || "");
  return {
    assetId,
    provider: String(asset.provider || "openai"),
    modelName: String(asset.modelName || ""),
    voiceId: String(asset.voiceId || ""),
    locale: String(asset.locale || ""),
    text: String(asset.text || ""),
    speed: Number(asset.speed || 1),
    visibility: String(asset.visibility || "private"),
    source: String(asset.source || "custom"),
    moderationStatus: String(asset.moderationStatus || "pending"),
    audioUrl: `/api/speech/voice-previews/${encodeURIComponent(assetId)}`,
    bytes: Number(asset.bytes || 0),
    createdAt: asset.createdAt || null,
    isOwner: owner,
    canEdit: owner,
    canDelete: owner || isAdmin(user),
  };
}

async function getHandler(
  _data: unknown,
  user: AuthenticatedUserType,
  _request: NextRequest,
  context: NextRouteContext,
) {
  const assetId = assetIdOf(context);
  if (!assetId) return NextResponse.json({ ok: false, error: "ASSET_ID_REQUIRED" }, { status: 400 });

  const asset = await getTtsPreviewAsset(assetId, true);
  if (!asset || asset.state !== "ready") {
    return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_NOT_FOUND" }, { status: 404 });
  }
  const owner = isOwner(user, asset.ownerUid);
  const publicApproved =
    asset.visibility === "public" && (asset.moderationStatus === "approved" || asset.source === "default");
  if (!publicApproved && !owner && !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const playback = await resolveVoiceAssetPlaybackUrl(asset.storage);
  if (playback?.url) {
    return NextResponse.redirect(playback.url, { status: 307 });
  }
  if (!asset.audioData?.length) {
    return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_AUDIO_NOT_FOUND" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.audioData), {
    status: 200,
    headers: {
      "Content-Type": asset.contentType || "audio/mpeg",
      "Content-Length": String(asset.audioData.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        asset.visibility === "public"
          ? "public, max-age=300, stale-while-revalidate=3600"
          : "private, max-age=0, no-store",
    },
  });
}

async function patchHandler(
  data: UnknownRecord,
  user: AuthenticatedUserType,
  _request: NextRequest,
  context: NextRouteContext,
) {
  const assetId = assetIdOf(context);
  const asset = await getTtsPreviewAsset(assetId);
  if (!asset || asset.state !== "ready") {
    return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_NOT_FOUND" }, { status: 404 });
  }
  if (!isOwner(user, asset.ownerUid)) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const visibility: TtsPreviewVisibility = data.visibility === "public" ? "public" : "private";
  const ownerUid = String(asset.ownerUid || "");
  const existing = await findReusableTtsPreviewAsset({ uid: ownerUid, baseKey: asset.baseKey, visibility });
  if (existing && existing.assetId !== assetId) {
    return NextResponse.json(
      { ok: false, error: "VOICE_PREVIEW_ALREADY_EXISTS", assetId: existing.assetId },
      { status: 409 },
    );
  }
  let updated;
  try {
    updated = await transitionTtsPreviewVisibility({
      asset: toUnknownRecord(asset.toObject?.() || asset),
      visibility,
    });
  } catch (error) {
    if (error instanceof TtsPreviewQuotaError) {
      return NextResponse.json({ ok: false, error: error.code, limit: error.limit }, { status: 409 });
    }
    if (error instanceof TtsPreviewQuotaUnavailableError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 503 });
    }
    if (Number((error as { code?: number })?.code) === 11000) {
      return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_ALREADY_EXISTS" }, { status: 409 });
    }
    throw error;
  }
  const record = (updated?.toObject?.() || updated || {}) as UnknownRecord;
  return NextResponse.json({ ok: true, data: toDto(record, user) });
}

async function deleteHandler(
  data: UnknownRecord,
  user: AuthenticatedUserType,
  _request: NextRequest,
  context: NextRouteContext,
) {
  const assetId = assetIdOf(context);
  const asset = await getTtsPreviewAsset(assetId);
  if (!asset || asset.state === "deleted") {
    return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_NOT_FOUND" }, { status: 404 });
  }
  if (!isOwner(user, asset.ownerUid) && !(isAdmin(user) && asset.visibility === "public")) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const reason = String(data.reason || (isAdmin(user) ? "admin_moderation" : "user_delete")).slice(0, 240);
  if (asset.storage) {
    const deleted = await deleteVoiceAssetByStorage(asset.storage);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "VOICE_PREVIEW_STORAGE_DELETE_FAILED" }, { status: 503 });
    }
  }
  await softDeleteTtsPreviewAsset({ assetId, deletedBy: uidOf(user), reason });
  return NextResponse.json({ ok: true, data: { assetId, state: "deleted" } });
}

const validatePatch = (data: UnknownRecord) => {
  if (data.action !== "set_visibility" || !["private", "public"].includes(String(data.visibility || ""))) {
    return { valid: false, error: "INVALID_VISIBILITY_ACTION" };
  }
  return { valid: true };
};

export const GET = withAuth(getHandler, undefined, "speech/voice-previews:asset-get");
export const PATCH = withAuth(patchHandler, validatePatch, "speech/voice-previews:asset-patch");
export const DELETE = withAuth(deleteHandler, undefined, "speech/voice-previews:asset-delete");
