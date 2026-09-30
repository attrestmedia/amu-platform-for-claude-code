import { NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { getGameAssetById } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import {
  deleteR2Object,
  getR2ObjectBuffer,
  headR2Object,
  putR2PrivateObject,
} from "libs/server-utils/storage/r2Storage";
import { applyV2ChromaKey } from "libs/server-utils/game/chromaKeyEngine";
import { removeBackgroundBilled } from "libs/server-utils/game/backgroundRemovalFallback";
import { validateChromaKeyOptions, normalizeChromaKeyOptions } from "utils/game/chromaKeyOptions";
import { buildChromaKeyTempPrefix } from "utils/game/chromaKeyTempKey";
import { evaluateChromaKeyQuality } from "utils/game/chromaKeyQuality";
import {
  validateProfileAssetCompatibility,
  validateGeometryPreservation,
} from "utils/game/chromaKeyProfileResolver";
import type {
  ChromaKeyOptionsType,
  ChromaKeyModeType,
  ChromaKeyProfileType,
  ChromaKeyCoverageModeType,
  ChromaKeyQualityType,
} from "types/game/chroma-key";
import type { QualityEvaluationType } from "utils/game/chromaKeyQuality";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";

export const runtime = "nodejs";

const VALID_ACTIONS = ["local-only", "ai-fallback"] as const;
type ChromaKeyApplyActionType = (typeof VALID_ACTIONS)[number];

function buildOptionsInput(raw: Record<string, unknown>): Partial<ChromaKeyOptionsType> & {
  keyMode: ChromaKeyModeType;
  profile: ChromaKeyProfileType;
} {
  const keyMode = (normalizeString(raw?.keyMode) || "auto") as ChromaKeyModeType;
  const profile = (normalizeString(raw?.profile) || "sprite-sheet") as ChromaKeyProfileType;

  const opts: Record<string, unknown> = {
    keyMode,
    profile,
    keyColor: raw?.keyColor as ChromaKeyOptionsType["keyColor"] | undefined,
    coverageMode: (normalizeString(raw?.coverageMode) || undefined) as ChromaKeyCoverageModeType | undefined,
    cropTransparent: raw?.cropTransparent === true,
  };

  for (const f of ["similarity", "softness", "feather", "choke", "despill"] as const) {
    if (raw?.[f] !== undefined && raw?.[f] !== null) {
      const n = Number(raw[f]);
      if (Number.isFinite(n)) opts[f] = n;
    }
  }

  return opts as typeof opts & { keyMode: ChromaKeyModeType; profile: ChromaKeyProfileType };
}

async function saveTempResultPng(args: {
  buffer: Buffer;
  gameAssetId: string;
  sha256: string;
}): Promise<{ url: string; storageKey: string; storageBucket: string; bytes: number }> {
  const key = `${buildChromaKeyTempPrefix(args.gameAssetId)}/${crypto.randomUUID()}.png`;
  const saved = await putR2PrivateObject({
    key,
    body: args.buffer,
    contentType: "image/png",
    sha256: args.sha256,
  });

  const head = await headR2Object({ bucket: saved.bucket, key: saved.key });
  if (
    !head ||
    head.bytes !== args.buffer.length ||
    head.contentType !== "image/png" ||
    head.sha256 !== args.sha256
  ) {
    await deleteR2Object({ bucket: saved.bucket, key: saved.key }).catch(() => false);
    throw new Error("r2_object_verification_failed");
  }

  return {
    url: "",
    storageKey: saved.key,
    storageBucket: saved.bucket,
    bytes: args.buffer.length,
  };
}

export const POST = withAuth(
  async (body, user) => {
    const startTime = Date.now();

    try {
      const gameAssetId = normalizeString(body?.gameAssetId);
      if (!gameAssetId) {
        return NextResponse.json({ ok: false, error: "gameAssetId_required" }, { status: 400 });
      }

      const expectedSourceSha = normalizeString(body?.expectedSourceSha);

      const action = normalizeString(body?.action) as ChromaKeyApplyActionType;
      if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
        return NextResponse.json(
          { ok: false, error: "invalid_action", errorCode: "INVALID_ACTION" },
          { status: 400 },
        );
      }

      if (!body?.options || typeof body.options !== "object") {
        return NextResponse.json({ ok: false, error: "options_required" }, { status: 400 });
      }
      const optionsInput = buildOptionsInput(body.options as Record<string, unknown>);

      const asset = await getGameAssetById(gameAssetId);
      if (!asset) {
        return NextResponse.json({ ok: false, error: "game_asset_not_found" }, { status: 404 });
      }

      if (asset.status === "published") {
        return NextResponse.json(
          { ok: false, error: "published_asset_locked", errorCode: "PUBLISHED_ASSET_LOCKED" },
          { status: 409 },
        );
      }

      if (expectedSourceSha && asset.storage?.sha256 !== expectedSourceSha) {
        return NextResponse.json(
          { ok: false, error: "source_sha_mismatch", errorCode: "SOURCE_SHA_MISMATCH" },
          { status: 409 },
        );
      }

      const storage = asset.storage;
      if (!storage || storage.driver !== "r2" || !storage.bucket || !storage.key) {
        return NextResponse.json(
          { ok: false, error: "r2_storage_required", errorCode: "R2_STORAGE_REQUIRED" },
          { status: 400 },
        );
      }

      const sourceBuffer = await getR2ObjectBuffer({
        bucket: storage.bucket,
        key: storage.key,
      });
      if (!sourceBuffer) {
        return NextResponse.json(
          { ok: false, error: "source_r2_object_not_found", errorCode: "SOURCE_R2_OBJECT_NOT_FOUND" },
          { status: 502 },
        );
      }

      const computedSourceSha = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
      if (storage.sha256 && storage.sha256 !== computedSourceSha) {
        return NextResponse.json(
          { ok: false, error: "source_integrity_mismatch", errorCode: "SOURCE_INTEGRITY_MISMATCH" },
          { status: 502 },
        );
      }

      const fullOptions = normalizeChromaKeyOptions(optionsInput);
      const validationErrors = validateChromaKeyOptions(fullOptions);
      if (validationErrors.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_chroma_key_options",
            errorCode: "INVALID_CHROMA_KEY_OPTIONS",
            details: validationErrors,
          },
          { status: 400 },
        );
      }

      // CK-302: profile-asset compatibility check
      const compatError = validateProfileAssetCompatibility(fullOptions.profile, asset.assetType);
      if (compatError) {
        return NextResponse.json(
          { ok: false, error: compatError, errorCode: "PROFILE_ASSET_INCOMPATIBLE" },
          { status: 400 },
        );
      }

      const v2Result = await applyV2ChromaKey({
        pngBuffer: sourceBuffer,
        options: optionsInput,
      });

      const processingTimeMs = Date.now() - startTime;

      const quality: ChromaKeyQualityType = v2Result.quality;
      let evaluation: QualityEvaluationType =
        v2Result.evaluation ||
        evaluateChromaKeyQuality(quality, v2Result.pipeline.detection.confidence, fullOptions.profile);

      let method: string = "chroma-key-v2";
      let coins = 0;
      let fallbackReason: string | undefined;
      let resultBuffer = v2Result.pngBuffer;

      if (action === "ai-fallback" && (evaluation.verdict === "fallback" || evaluation.verdict === "fail")) {
        const uid = getAuthenticatedUid(user);
        if (!uid) {
          return NextResponse.json({ ok: false, error: "uid_required_for_fallback" }, { status: 400 });
        }

        try {
          const fallbackRes = await removeBackgroundBilled({
            uid,
            buffer: sourceBuffer,
            mimeType: storage.mimeType || "image/png",
            sourceSha256: computedSourceSha,
          });

          resultBuffer = fallbackRes.buffer;
          method = fallbackRes.provider;
          coins = fallbackRes.coins;
          fallbackReason = evaluation.reason || "quality_gate_failed";
          evaluation = { verdict: "pass", warnings: [`fallback:${method}`] };
        } catch (fallbackError) {
          logger.error("[ChromaKeyApply] AI fallback failed:", fallbackError);
          return NextResponse.json(
            {
              ok: false,
              error: "ai_fallback_failed",
              errorCode: "AI_FALLBACK_FAILED",
              details: toErrorMessage(fallbackError, "unknown"),
            },
            { status: 502 },
          );
        }
      }

      const outputMetadata = await sharp(resultBuffer).metadata();
      if (outputMetadata.format !== "png") {
        resultBuffer = await sharp(resultBuffer).png().toBuffer();
      }
      const finalOutputMetadata = await sharp(resultBuffer).metadata();
      const outputWidth = Number(finalOutputMetadata.width || 0);
      const outputHeight = Number(finalOutputMetadata.height || 0);
      if (!outputWidth || !outputHeight) {
        throw new Error("result_dimensions_unavailable");
      }
      const outputSha256 = crypto.createHash("sha256").update(resultBuffer).digest("hex");

      // CK-302: geometry validation
      const geometryValidation = validateGeometryPreservation({
        profile: fullOptions.profile,
        inputWidth: v2Result.source.width,
        inputHeight: v2Result.source.height,
        outputWidth,
        outputHeight,
        cropTransparent: fullOptions.cropTransparent,
        assetType: asset.assetType,
        spriteSheet: asset.spriteSheet
          ? {
              frameWidth: asset.spriteSheet.frameWidth,
              frameHeight: asset.spriteSheet.frameHeight,
              columns: asset.spriteSheet.columns,
              rows: asset.spriteSheet.rows,
            }
          : undefined,
        runtime: asset.runtime,
      });

      let tempResult: { url: string; storageKey: string; storageBucket: string; bytes: number };

      try {
        tempResult = await saveTempResultPng({
          buffer: resultBuffer,
          gameAssetId,
          sha256: outputSha256,
        });
      } catch (saveError) {
        logger.error("[ChromaKeyApply] temp save failed:", saveError);
        return NextResponse.json(
          { ok: false, error: "temp_save_failed", errorCode: "TEMP_SAVE_FAILED" },
          { status: 502 },
        );
      }

      return NextResponse.json({
        ok: true,
        data: {
          gameAssetId,
          sourceSha256: computedSourceSha,
          outputSha256,
          method,
          quality,
          evaluation,
          processingTimeMs,
          coins,
          fallbackReason: fallbackReason || undefined,
          engineVersion: "v2.0.0",
          geometry: geometryValidation,
          sourceWidth: v2Result.source.width,
          sourceHeight: v2Result.source.height,
          tempResult: {
            storageKey: tempResult.storageKey,
            url: tempResult.url,
            width: outputWidth,
            height: outputHeight,
            bytes: tempResult.bytes,
          },
        },
      });
    } catch (error) {
      logger.error("[ChromaKeyApply] unexpected error:", error);
      return NextResponse.json(
        {
          ok: false,
          error: "chroma_key_apply_failed",
          errorCode: "CHROMA_KEY_APPLY_FAILED",
          details: toErrorMessage(error, "unknown"),
        },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/assets/chroma-key:apply",
  { requireAdmin: true },
);
