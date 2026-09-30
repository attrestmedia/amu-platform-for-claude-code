import "server-only";
import crypto from "crypto";
import type { ChromaKeyQualityType } from "types/game/chroma-key";
import { CHARACTER_BIBLE_DIRECTIONS, type CharacterBibleCandidateType } from "types/game/asset-pipeline";
import {
  analyzeSheetAlphaQuality,
  fetchStoredImageAssetBuffer,
  removeSolidBackgroundByChromaKey,
} from "libs/server-utils/game/spriteSheetPostProcess";
import {
  applyV2ChromaKey,
  type V2ChromaKeyOutputType,
} from "libs/server-utils/game/chromaKeyEngine";
import { verifySheetSlices } from "libs/server-utils/game/spriteSheetVerifier";

/**
 * @docHint
 * @purpose 캐릭터 바이블 5셀 검증 — v2 크로마키 + 품질 계약 (CK-203)
 * @process 생성 asset 로드 → v2 chroma key(character-bible 프로필) → 5열 셀 검증 → 후보 메타 반환
 * @domain game.asset-pipeline
 * @scope server
 */

// character-bible 용 v2 옵션
const BIBLE_V2_OPTIONS = {
  keyMode: "magenta" as const,
  profile: "character-bible" as const,
};

function codedError(message: string, errorCode: string, status = 422) {
  const error = new Error(message) as Error & { errorCode: string; status: number };
  error.errorCode = errorCode;
  error.status = status;
  return error;
}

export async function verifyCharacterBibleAsset(assetId: string): Promise<CharacterBibleCandidateType> {
  const source = await fetchStoredImageAssetBuffer(assetId);
  const alpha = await analyzeSheetAlphaQuality(source.buffer);
  let verificationBuffer = source.buffer;
  let method: string | undefined;
  let keyColor: { r: number; g: number; b: number } | undefined;
  let qualityMeta: CharacterBibleCandidateType["quality"] | undefined;

  if (!alpha.transparentBackground) {
    // CK-203: v2 YCbCr 크로마키 우선 시도 (character-bible 프로필)
    let v2Success = false;
    try {
      const v2 = await applyV2ChromaKey({
        pngBuffer: source.buffer,
        options: BIBLE_V2_OPTIONS,
      });
      verificationBuffer = v2.pngBuffer;
      method = "chroma-key-v2";
      keyColor = v2.pipeline?.detection?.resolvedColor;
      qualityMeta = buildQualityMeta(v2);
      v2Success = true;
    } catch {
      // v2 실패 → legacy RGB 크로마키 fallback
    }

    if (!v2Success) {
      const chroma = await removeSolidBackgroundByChromaKey(source.buffer);
      if (!chroma.keyed) {
        throw codedError("character_bible_background_invalid", "CHARACTER_BIBLE_BACKGROUND_INVALID");
      }
      verificationBuffer = chroma.buffer;
      method = "chroma-key";
      keyColor = chroma.keyColor;
    }
  } else {
    method = "native-alpha";
  }

  const result = await verifySheetSlices({
    buffer: verificationBuffer,
    columns: CHARACTER_BIBLE_DIRECTIONS.length,
    rows: 1,
    directions: CHARACTER_BIBLE_DIRECTIONS,
    directionAxis: "columns",
  });
  const verify = Object.fromEntries(result.directions.map((item) => [item.direction, item.verify]));

  return {
    assetId,
    sha256: crypto.createHash("sha256").update(source.buffer).digest("hex"),
    columns: 5,
    width: result.width,
    height: result.height,
    cellWidth: result.cellWidth,
    cellHeight: result.cellHeight,
    directions: [...CHARACTER_BIBLE_DIRECTIONS],
    passedDirections: result.directions
      .filter((item) => item.passed)
      .map((item) => item.direction as (typeof CHARACTER_BIBLE_DIRECTIONS)[number]),
    verify,
    allPassed: result.allPassed,
    // CK-203: v2 품질 메타
    method,
    keyColor,
    quality: qualityMeta,
  };
}

// ---------------------------------------------------------------------------
// Helper: v2 품질 지표 추출
// ---------------------------------------------------------------------------

function buildQualityMeta(v2: V2ChromaKeyOutputType): CharacterBibleCandidateType["quality"] {
  const q = v2.quality as ChromaKeyQualityType | undefined;
  if (!q) return undefined;
  return {
    transparentRatio: q.transparentRatio,
    edgeSpillRatio: q.edgeSpillRatio,
    opaquePixelRatio: q.opaquePixelRatio,
    keyConfidence: q.keyConfidence,
    verdict: v2.evaluation.verdict,
  };
}
