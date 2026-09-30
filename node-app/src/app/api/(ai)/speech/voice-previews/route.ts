import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { USER_ROLES } from "consts/auth";
import {
  OPENAI_DEFAULT_TTS_MODEL,
  OPENAI_DEFAULT_TTS_SPEED,
  OPENAI_VOICE_PREVIEW_SAMPLE_TEXT,
  TTS_PREVIEW_ASSET_LIMIT,
  getOpenAiVoiceCatalogEntry,
} from "consts/ai";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import {
  buildTtsPreviewDedupeKey,
  createGeneratingTtsPreviewAsset,
  findReusableTtsPreviewAsset,
  findGeneratingTtsPreviewAsset,
  getTtsPreviewAssetByDedupeKey,
  listTtsPreviewAssets,
  markTtsPreviewAssetFailed,
  markTtsPreviewAssetReady,
  releaseExpiredTtsPreviewGeneration,
  TtsPreviewQuotaError,
  TtsPreviewQuotaUnavailableError,
} from "libs/database/lab";
import { getUniverseDetail } from "libs/database/universe";
import { buildSpeechBillingContext } from "libs/server-utils/audio/routeUtils";
import { synthesizeSpeech } from "libs/server-utils/audio";
import {
  buildVoicePreviewStorageKey,
  deleteVoiceAssetByStorage,
  resolveAudioExt,
  saveVoiceBufferToR2,
  type VoiceAssetStorageMeta,
} from "libs/server-utils/audio/voiceAssetStorage";
import type { TtsPreviewSource, TtsPreviewVisibility } from "models/lab";
import { toUnknownRecord, type UnknownRecord } from "utils/common";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(speech / voice-previews) 저장·사용자 TTS 미리듣기 조회 및 생성
 * @process 인증  입력/카탈로그/한도 검증  기존 자산 재사용  TTS 과금·합성  R2 검증 저장  DB 자산 기록
 * @domain ai-speech
 * @scope api
 */

export const runtime = "nodejs";

const MAX_PREVIEW_TEXT_LENGTH = 240;
const MAX_PREVIEW_AUDIO_BYTES = 2 * 1024 * 1024;

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function isAdmin(user: AuthenticatedUserType) {
  return getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
}

function normalizeLocale(raw: unknown) {
  const locale = String(raw || "ko").trim().toLowerCase().slice(0, 16);
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(locale) ? locale : "ko";
}

function normalizeText(raw: unknown) {
  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PREVIEW_TEXT_LENGTH);
}

function normalizeVisibility(raw: unknown): TtsPreviewVisibility {
  return String(raw || "").trim().toLowerCase() === "public" ? "public" : "private";
}

function normalizeSource(raw: unknown): TtsPreviewSource {
  return String(raw || "").trim().toLowerCase() === "default" ? "default" : "custom";
}

function clampSpeed(raw: unknown) {
  const value = Number(raw ?? OPENAI_DEFAULT_TTS_SPEED);
  return Number.isFinite(value) ? Math.min(4, Math.max(0.25, value)) : OPENAI_DEFAULT_TTS_SPEED;
}

function buildBaseKey(args: {
  provider: string;
  modelName: string;
  voiceId: string;
  locale: string;
  text: string;
  speed: number;
}) {
  return crypto.createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

function toDto(asset: UnknownRecord, user: AuthenticatedUserType) {
  const assetId = String(asset.assetId || "");
  const ownerUid = String(asset.ownerUid || "");
  const owner = ownerUid === uidOf(user);
  return {
    assetId,
    provider: String(asset.provider || "openai"),
    modelName: String(asset.modelName || ""),
    voiceId: String(asset.voiceId || ""),
    locale: String(asset.locale || ""),
    text: String(asset.text || ""),
    speed: Number(asset.speed || OPENAI_DEFAULT_TTS_SPEED),
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

async function getHandler(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const voiceId = String(params.get("voiceId") || "").trim().toLowerCase();
  const entry = getOpenAiVoiceCatalogEntry(voiceId);
  if (!entry) return NextResponse.json({ ok: false, error: "UNSUPPORTED_VOICE_ID" }, { status: 400 });

  const rows = await listTtsPreviewAssets({
    uid: uidOf(user),
    voiceId: entry.voiceId,
    modelName: String(params.get("modelName") || "").trim() || undefined,
    locale: String(params.get("locale") || "").trim() || undefined,
    limit: Number(params.get("limit") || 20),
  });

  return NextResponse.json({ ok: true, data: rows.map((row) => toDto(row as UnknownRecord, user)) });
}

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType) {
  const uid = uidOf(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const voiceId = String(data.voiceId || "").trim().toLowerCase();
  const entry = getOpenAiVoiceCatalogEntry(voiceId);
  if (!entry) return NextResponse.json({ ok: false, error: "UNSUPPORTED_VOICE_ID" }, { status: 400 });

  const source = normalizeSource(data.source);
  const text = source === "default" ? OPENAI_VOICE_PREVIEW_SAMPLE_TEXT : normalizeText(data.text);
  if (!text) return NextResponse.json({ ok: false, error: "PREVIEW_TEXT_REQUIRED" }, { status: 400 });

  const modelName = String(data.modelName || OPENAI_DEFAULT_TTS_MODEL).trim().slice(0, 120);
  const locale = normalizeLocale(data.locale);
  const visibility = normalizeVisibility(data.visibility);
  const universeId = String(data.universeId || "").trim().slice(0, 128);
  if (!universeId) return NextResponse.json({ ok: false, error: "UNIVERSE_ID_REQUIRED" }, { status: 400 });
  const universeDetail = source === "custom" ? await getUniverseDetail(universeId).catch(() => null) : null;
  const speed =
    source === "default"
      ? OPENAI_DEFAULT_TTS_SPEED
      : clampSpeed(universeDetail?.metadata?.voiceConfig?.defaultTtsSpeed);

  const baseKey = buildBaseKey({ provider: "openai", modelName, voiceId: entry.voiceId, locale, text, speed });
  const dedupeKey = buildTtsPreviewDedupeKey({ uid, baseKey, visibility });
  const reusable = await findReusableTtsPreviewAsset({ uid, baseKey, visibility });
  if (reusable) {
    return NextResponse.json({ ok: true, data: toDto(reusable as UnknownRecord, user), reused: true });
  }

  await releaseExpiredTtsPreviewGeneration(dedupeKey);
  const generating = await findGeneratingTtsPreviewAsset(dedupeKey);
  if (generating) {
    return NextResponse.json(
      { ok: false, error: "VOICE_PREVIEW_GENERATION_IN_PROGRESS", assetId: generating.assetId },
      { status: 409 },
    );
  }

  const assetId = `tts_prev_${crypto.randomUUID().replace(/-/g, "")}`;
  try {
    await createGeneratingTtsPreviewAsset({
      assetId,
      ownerUid: uid,
      modelName,
      voiceId: entry.voiceId,
      locale,
      text,
      baseKey,
      speed,
      visibility,
      source,
      dedupeKey,
      limit: TTS_PREVIEW_ASSET_LIMIT[visibility],
    });
  } catch (error) {
    if (error instanceof TtsPreviewQuotaError) {
      return NextResponse.json({ ok: false, error: error.code, limit: error.limit }, { status: 409 });
    }
    if (error instanceof TtsPreviewQuotaUnavailableError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 503 });
    }
    if (Number((error as { code?: number })?.code) === 11000) {
      const active = await getTtsPreviewAssetByDedupeKey(dedupeKey);
      return NextResponse.json(
        {
          ok: false,
          error:
            active?.state === "ready"
              ? active.moderationStatus === "rejected"
                ? "VOICE_PREVIEW_MODERATION_REJECTED"
                : "VOICE_PREVIEW_MODERATION_PENDING"
              : "VOICE_PREVIEW_GENERATION_IN_PROGRESS",
          assetId: active?.assetId || "",
        },
        { status: 409 },
      );
    }
    throw error;
  }

  let uploadedStorage: VoiceAssetStorageMeta | null = null;
  try {
    const result = await synthesizeSpeech({
      provider: "openai",
      modelName,
      text,
      speed,
      locale,
      routeHint: "tutors",
      voiceProfile: {
        provider: "openai",
        voiceId: entry.voiceId,
        modelName,
        locale,
        instructions: entry.instructions,
        source: "request-override",
        score: 1000,
        matchedTags: [...entry.tags],
        matchedReasons: ["voice preview request"],
      },
      billing: buildSpeechBillingContext({
        user,
        routeHint: "tutors",
        universeId,
        sessionId: "voice-preview",
        npcId: `voice-preview:${entry.voiceId}`,
        clientId: assetId,
        operation: "speech_synthesize",
      }),
    });

    if (result.audioBuffer.length > MAX_PREVIEW_AUDIO_BYTES) {
      logger.error("[voice-previews] 합성 결과가 미리듣기 저장 한도를 초과했습니다.", {
        assetId,
        uid,
        bytes: result.audioBuffer.length,
        maxBytes: MAX_PREVIEW_AUDIO_BYTES,
        billingCharged: result.meta?.billingCharged === true,
      });
      throw new Error("VOICE_PREVIEW_AUDIO_TOO_LARGE");
    }

    const storageAccess = visibility === "public" && source === "default" ? "public" : "private";
    uploadedStorage = await saveVoiceBufferToR2({
      key: buildVoicePreviewStorageKey({
        visibility: storageAccess,
        voiceId: entry.voiceId,
        assetId,
        ext: resolveAudioExt(result.contentType || "audio/mpeg"),
      }),
      body: result.audioBuffer,
      contentType: result.contentType || "audio/mpeg",
      access: storageAccess,
      cacheControl:
        storageAccess === "public"
          ? "public, max-age=300, stale-while-revalidate=3600"
          : "private, max-age=0, no-store",
    });
    const ready = await markTtsPreviewAssetReady({
      assetId,
      storage: uploadedStorage,
      contentType: result.contentType || "audio/mpeg",
      bytes: result.audioBuffer.length,
      sha256: crypto.createHash("sha256").update(result.audioBuffer).digest("hex"),
    });
    if (!ready) throw new Error("VOICE_PREVIEW_DB_UPDATE_FAILED");
    return NextResponse.json({
      ok: true,
      data: toDto(toUnknownRecord(ready?.toObject?.() || ready), user),
      reused: false,
      billing: result.billing,
      billingCharged: result.meta?.billingCharged === true,
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "VOICE_PREVIEW_GENERATION_FAILED";
    if (uploadedStorage) {
      await deleteVoiceAssetByStorage(uploadedStorage).catch(() => false);
    }
    await markTtsPreviewAssetFailed(assetId, errorCode).catch(() => null);
    throw error;
  }
}

export const GET = withAuth(getHandler, undefined, "speech/voice-previews:get");
export const POST = withAuth(postHandler, undefined, "speech/voice-previews:post");
