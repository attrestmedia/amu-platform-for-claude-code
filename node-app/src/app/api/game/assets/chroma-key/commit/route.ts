import { NextResponse } from "next/server";
import sharp from "sharp";
import { getGameAssetById, updateGameAsset } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import {
  deleteR2Object,
  getR2ObjectBuffer,
  getR2PrivateBucket,
} from "libs/server-utils/storage/r2Storage";
import {
  putChromaKeyDerived,
  compensateDeleteDerived,
} from "libs/server-utils/game/chromaKeyStorageService";
import { validateChromaKeyOptions, normalizeChromaKeyOptions } from "utils/game/chromaKeyOptions";
import {
  validateProfileAssetCompatibility,
  validateGeometryPreservation,
} from "utils/game/chromaKeyProfileResolver";
import type {
  ChromaKeyOptionsType,
  ChromaKeyModeType,
  ChromaKeyProfileType,
  ChromaKeyQualityType,
} from "types/game/chroma-key";
import type { QualityEvaluationType } from "utils/game/chromaKeyQuality";
import { isChromaKeyTempKeyForAsset } from "utils/game/chromaKeyTempKey";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAdminKey(user: AuthenticatedUserType) {
  return (
    normalizeString(user?.userEmailLower) ||
    normalizeString(user?.userEmail) ||
    normalizeString(user?.email) ||
    (user?.ID ? String(user.ID) : "admin")
  );
}

function parseOptions(raw: Record<string, unknown>): ChromaKeyOptionsType {
  const input: Partial<ChromaKeyOptionsType> & {
    keyMode: ChromaKeyModeType;
    profile: ChromaKeyProfileType;
  } = {
    keyMode: (normalizeString(raw?.keyMode) || "auto") as ChromaKeyModeType,
    profile: (normalizeString(raw?.profile) || "sprite-sheet") as ChromaKeyProfileType,
  };

  for (const f of ["similarity", "softness", "feather", "choke", "despill"] as const) {
    if (raw?.[f] !== undefined && raw?.[f] !== null) {
      const n = Number(raw[f]);
      if (Number.isFinite(n)) (input as Record<string, unknown>)[f] = n;
    }
  }
  if (raw?.keyColor) input.keyColor = raw.keyColor as ChromaKeyOptionsType["keyColor"];
  if (raw?.coverageMode) input.coverageMode = normalizeString(raw.coverageMode) as ChromaKeyOptionsType["coverageMode"];
  if (raw?.cropTransparent === true) input.cropTransparent = true;

  return normalizeChromaKeyOptions(input);
}

// ---------------------------------------------------------------------------
// POST: 관리자 chroma-key 결과 커밋 (R2 영구 저장 + DB 갱신)
// ---------------------------------------------------------------------------

export const POST = withAuth(
  async (body, user) => {
    try {
      // ── 1) gameAssetId 검증 ──
      const gameAssetId = normalizeString(body?.gameAssetId);
      if (!gameAssetId) {
        return NextResponse.json({ ok: false, error: "gameAssetId_required" }, { status: 400 });
      }

      // ── 2) 클라이언트 이미지 바이트 입력 금지 ──
      if (Object.prototype.hasOwnProperty.call(body || {}, "outputPngBase64")) {
        return NextResponse.json({ ok: false, error: "output_base64_not_supported" }, { status: 400 });
      }

      // ── 3) SHA 검증 ──
      const sourceSha256 = normalizeString(body?.sourceSha256);
      const outputSha256 = normalizeString(body?.outputSha256);
      if (!/^[a-f0-9]{64}$/i.test(sourceSha256) || !/^[a-f0-9]{64}$/i.test(outputSha256)) {
        return NextResponse.json({ ok: false, error: "invalid_sha256_format" }, { status: 400 });
      }

      // ── 4) method 및 engineVersion ──
      const method = normalizeString(body?.method) || "chroma-key-v2";
      const engineVersion = normalizeString(body?.engineVersion) || "v2.0.0";

      // ── 5) options 검증 ──
      if (!body?.options || typeof body.options !== "object") {
        return NextResponse.json({ ok: false, error: "options_required" }, { status: 400 });
      }
      const fullOptions = parseOptions(body.options as Record<string, unknown>);
      const validationErrors = validateChromaKeyOptions(fullOptions);
      if (validationErrors.length > 0) {
        return NextResponse.json(
          { ok: false, error: "invalid_chroma_key_options", details: validationErrors },
          { status: 400 },
        );
      }

      // ── 6) quality / evaluation ──
      const quality = (body?.quality || {}) as ChromaKeyQualityType;
      const evaluation = (body?.evaluation || {}) as QualityEvaluationType;

      // ── 7) GameAsset 조회·상태 검증 ──
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

      if (asset.storage?.sha256 && asset.storage.sha256 !== sourceSha256) {
        return NextResponse.json(
          { ok: false, error: "source_sha_mismatch", errorCode: "SOURCE_SHA_MISMATCH" },
          { status: 409 },
        );
      }

      const tempStorageKey = normalizeString(body?.tempStorageKey);
      if (!isChromaKeyTempKeyForAsset(gameAssetId, tempStorageKey)) {
        return NextResponse.json(
          { ok: false, error: "invalid_temp_storage_key", errorCode: "INVALID_TEMP_STORAGE_KEY" },
          { status: 400 },
        );
      }

      const tempBucket = getR2PrivateBucket();
      const outputBuffer = await getR2ObjectBuffer({ bucket: tempBucket, key: tempStorageKey });
      if (!outputBuffer) {
        return NextResponse.json(
          { ok: false, error: "temp_result_not_found", errorCode: "TEMP_RESULT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const outputMetadata = await sharp(outputBuffer).metadata();
      const outputWidth = Number(outputMetadata.width || 0);
      const outputHeight = Number(outputMetadata.height || 0);
      if (!outputWidth || !outputHeight) {
        throw new Error("temp_result_dimensions_unavailable");
      }

      // ── 8) CK-302: geometry validation ──
      const compatError = validateProfileAssetCompatibility(fullOptions.profile, asset.assetType);
      if (compatError) {
        return NextResponse.json(
          { ok: false, error: compatError, errorCode: "PROFILE_ASSET_INCOMPATIBLE" },
          { status: 400 },
        );
      }

      const inputWidth = Number(body?.inputWidth);
      const inputHeight = Number(body?.inputHeight);

      if (Number.isFinite(inputWidth) && Number.isFinite(inputHeight) &&
          Number.isFinite(outputWidth) && Number.isFinite(outputHeight)) {
        const geomResult = validateGeometryPreservation({
          profile: fullOptions.profile,
          inputWidth,
          inputHeight,
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

        if (!geomResult.valid) {
          return NextResponse.json(
            {
              ok: false,
              error: "geometry_validation_failed",
              errorCode: "GEOMETRY_VALIDATION_FAILED",
              details: geomResult,
            },
            { status: 409 },
          );
        }
      }

      // ── 9) R2 PUT → HEAD 검증 (서비스)
      let derived: Awaited<ReturnType<typeof putChromaKeyDerived>>;
      try {
        derived = await putChromaKeyDerived({
          outputBuffer,
          sourceSha256,
          outputSha256,
          options: fullOptions,
          quality,
          evaluation,
          method,
          engineVersion,
        });
      } catch (storageError) {
        logger.error("[ChromaKeyCommit] storage failed:", storageError);
        const err = storageError as Error & { errorCode?: string; status?: number };
        return NextResponse.json(
          { ok: false, error: err.message, errorCode: err.errorCode || "STORAGE_FAILED" },
          { status: err.status || 502 },
        );
      }

      // ── 10) GameAsset DB 업데이트 ──
      try {
        const updated = await updateGameAsset(gameAssetId, {
          storage: derived.storage,
          meta: {
            ...(asset.meta || {}),
            ...derived.meta,
          },
          updatedBy: getAdminKey(user),
        });

        if (!updated) {
          // DB 업데이트 실패 → 보상 삭제
          await compensateDeleteDerived(derived.storage);
          return NextResponse.json(
            { ok: false, error: "game_asset_update_failed", errorCode: "GAME_ASSET_UPDATE_FAILED" },
            { status: 500 },
          );
        }

        await deleteR2Object({ bucket: tempBucket, key: tempStorageKey }).catch((deleteError) => {
          logger.warn("[ChromaKeyCommit] temp result delete failed:", {
            gameAssetId,
            key: tempStorageKey,
            error: deleteError,
          });
          return false;
        });

        return NextResponse.json({
          ok: true,
          data: {
            gameAssetId,
            storage: derived.storage,
            meta: derived.meta,
            asset: updated,
          },
        });
      } catch (dbError) {
        // DB 예외 → 보상 삭제
        logger.error("[ChromaKeyCommit] DB update failed:", dbError);
        await compensateDeleteDerived(derived.storage);
        return NextResponse.json(
          { ok: false, error: "db_update_failed", errorCode: "DB_UPDATE_FAILED" },
          { status: 500 },
        );
      }
    } catch (error) {
      logger.error("[ChromaKeyCommit] unexpected error:", error);
      return NextResponse.json(
        {
          ok: false,
          error: "chroma_key_commit_failed",
          errorCode: "CHROMA_KEY_COMMIT_FAILED",
          details: toErrorMessage(error, "unknown"),
        },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/assets/chroma-key:commit",
  { requireAdmin: true },
);
