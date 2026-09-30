import "server-only";
import crypto from "crypto";
import {
  type BackgroundRemovalProviderType,
} from "libs/services/backgroundRemoval/removeBackground";
import { resolveSmartCutPaths, saveBase64Image } from "libs/server-utils/file/fileStorage";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { getImageAssetByAssetId } from "libs/database/lab/imageGenRepo";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

// ---------------------------------------------------------------------------
// 분할된 서비스 모듈 import (CK-200: 책임 분할, CK-201: v2 통합)
// ---------------------------------------------------------------------------
import {
  removeSolidBackgroundByChromaKey as _removeSolidBackgroundByChromaKey,
  applyV2ChromaKey,
  SPRITE_CHROMA_KEY_POLICY,
} from "libs/server-utils/game/chromaKeyEngine";

import {
  analyzeSheetAlphaQuality as _analyzeSheetAlphaQuality,
  SPRITE_ALPHA_QUALITY_POLICY,
  type SheetAlphaAnalysisType,
} from "libs/server-utils/game/chromaKeyQualityService";

import {
  removeBackgroundBilled as _removeBackgroundBilled,
} from "libs/server-utils/game/backgroundRemovalFallback";

import { resolveActiveEngine } from "utils/game/engineMode";
import { buildFallbackOperationId } from "utils/game/fallbackOperationId";
import type { ChromaKeyOptionsType, ChromaKeyQualityType } from "types/game/chroma-key";
import type { QualityVerdictType } from "utils/game/chromaKeyQuality";

/**
 * @docHint
 * @purpose 스프라이트 시트 STEP3 후처리 오케스트레이션 (CK-201: v2 통합)
 *
 * ## 처리 순서 (CK-201)
 * 1. native-alpha skip (0코인)
 * 2. v2 YCbCr chroma key (0코인, engine mode에 따라 legacy RGB로 폴백)
 * 3. AI provider fallback (유료, backgroundRemovalFallback)
 *
 * ## 엔진 모드 (CK-003)
 * - legacy: 기존 RGB 크로마키만 사용
 * - shadow: legacy 결과로 응답 + v2 결과 병렬 계산 (모니터링)
 * - canary: allowlist 대상만 v2, 나머지 legacy
 * - enabled: 모든 사용자 v2 기본 엔진
 *
 * @domain game.asset-pipeline
 * @scope admin
 */

// ---------------------------------------------------------------------------
// 하위 호환 재수출
// ---------------------------------------------------------------------------
export { SPRITE_CHROMA_KEY_POLICY };
export { SPRITE_ALPHA_QUALITY_POLICY };
export type { SheetAlphaAnalysisType };

/** @deprecated chromaKeyEngine.ts로 분리됨 */
export const removeSolidBackgroundByChromaKey = _removeSolidBackgroundByChromaKey;

/** @deprecated chromaKeyQualityService.ts로 분리됨 */
export const analyzeSheetAlphaQuality = _analyzeSheetAlphaQuality;

// ---------------------------------------------------------------------------
// 공개 타입 (STEP3 오케스트레이션 계약)
// ---------------------------------------------------------------------------

export type SheetPostProcessOutputType = {
  sourceAssetId: string;
  stepKey: string;
  skipped: boolean;
  method?: "native-alpha" | "chroma-key" | "chroma-key-v2" | BackgroundRemovalProviderType;
  url: string;
  storage?: UnknownRecord;
  sha256: string;
  alpha: SheetAlphaAnalysisType;
  /** CK-201: v2 엔진 메타 (v2 사용 시에만 존재) */
  v2?: {
    engineVersion: string;
    optionsFingerprint?: string;
    quality?: ChromaKeyQualityType;
    verdict?: QualityVerdictType;
    fallbackReason?: string;
  };
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function codedError(message: string, errorCode: string, status = 400) {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

// ---------------------------------------------------------------------------
// Storage helpers (원본 spriteSheetPostProcess.ts에서 그대로 유지)
// ---------------------------------------------------------------------------

export async function fetchStoredImageAssetBuffer(assetId: string): Promise<{ buffer: Buffer; mimeType: string; url: string }> {
  const asset = await getImageAssetByAssetId(String(assetId || "").trim());
  if (!asset) throw codedError("pipeline_source_asset_not_found", "PIPELINE_SOURCE_ASSET_NOT_FOUND", 404);

  const display = await resolveImageAssetDisplayUrl(asset);
  if (!display?.url) throw codedError("pipeline_source_url_not_found", "PIPELINE_SOURCE_URL_NOT_FOUND", 404);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPRITE_ALPHA_QUALITY_POLICY.fetchTimeoutMs);
  try {
    const res = await fetch(display.url, { signal: controller.signal });
    if (!res.ok) throw codedError(`pipeline_source_fetch_failed:${res.status}`, "PIPELINE_SOURCE_FETCH_FAILED", 502);
    const mimeType = String(res.headers.get("content-type") || "image/webp").split(";")[0].trim();
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > SPRITE_ALPHA_QUALITY_POLICY.maxBytes) {
      throw codedError("pipeline_source_size_invalid", "PIPELINE_SOURCE_SIZE_INVALID", 422);
    }
    return { buffer, mimeType, url: display.url };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPostProcessedSheetBuffer(output: SheetPostProcessOutputType): Promise<Buffer> {
  if (output.skipped) {
    const source = await fetchStoredImageAssetBuffer(output.sourceAssetId);
    return source.buffer;
  }

  const storage = toUnknownRecord(output.storage);
  const display = Object.keys(storage).length
    ? await resolveImageAssetDisplayUrl(
        { assetId: "", visibility: "private", storage },
        { delivery: "signed" },
      )
    : null;
  const url = String(display?.url || output.url || "");
  if (!/^https?:\/\//.test(url)) {
    throw codedError("step_output_unreadable", "STEP_OUTPUT_UNREADABLE", 422);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPRITE_ALPHA_QUALITY_POLICY.fetchTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw codedError(`step_output_fetch_failed:${response.status}`, "STEP_OUTPUT_FETCH_FAILED", 502);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > SPRITE_ALPHA_QUALITY_POLICY.maxBytes) {
      throw codedError("step_output_size_invalid", "STEP_OUTPUT_SIZE_INVALID", 422);
    }
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// STEP3 오케스트레이션 (CK-201: v2 통합)
// ---------------------------------------------------------------------------

/**
 * step2 산출 시트 1장 후처리 — v2 통합 오케스트레이션 (CK-201):
 *   1. 알파 품질 분석 → native-alpha skip (0코인)
 *   2. v2 YCbCr chroma key (0코인, engine mode에 따라 분기)
 *   3. AI provider fallback (유료)
 *   4. 저장 및 반환
 */
export async function postProcessSheetAsset(args: {
  uid: string;
  sourceAssetId: string;
  stepKey: string;
}): Promise<{ output: SheetPostProcessOutputType; coins: number }> {
  const { uid, sourceAssetId, stepKey } = args;

  // --- engine mode 결정 ---
  const engine = resolveActiveEngine(uid);

  // 1) 소스 로드 + 알파 품질 분석
  const source = await fetchStoredImageAssetBuffer(sourceAssetId);
  const sourceSha256 = crypto.createHash("sha256").update(source.buffer).digest("hex");
  const beforeAnalysis = await _analyzeSheetAlphaQuality(source.buffer);

  // 2) native-alpha skip (0코인)
  if (beforeAnalysis.transparentBackground) {
    return {
      coins: 0,
      output: {
        sourceAssetId, stepKey, skipped: true,
        method: "native-alpha", url: source.url,
        sha256: sourceSha256,
        alpha: beforeAnalysis,
      },
    };
  }

  // CK-204: 결정적 fallback operation ID (source SHA + uid → 동일 과금 방지)
  const fallbackOperationId = buildFallbackOperationId({ uid, sourceSha256 });

  // 3) chroma key — engine mode에 따라 v2 또는 legacy 선택
  if (engine.primaryEngine === "v2") {
    // CK-201: v2 YCbCr 소프트 알파 크로마키 (0코인)
    const v2Result = await attemptV2ChromaKey(source.buffer, uid, sourceAssetId, stepKey);
    if (v2Result.success && v2Result.output) {
      return v2Result.output;
    }
    // v2 실패 → fallback reason 기록 후 AI fallback으로 진행
  } else {
    // legacy 모드: 기존 RGB 거리 기반 크로마키 (0코인)
    const legacyResult = await attemptLegacyChromaKey(source, sourceAssetId, stepKey, uid, beforeAnalysis);
    if (legacyResult) return legacyResult;
  }

  // 4) AI provider fallback (유료, CK-204: 결정적 operation ID로 멱등)
  return await executeAIFallback(source, sourceAssetId, stepKey, uid, fallbackOperationId, sourceSha256);
}

// ---------------------------------------------------------------------------
// v2 chroma key 시도 (CK-201)
// ---------------------------------------------------------------------------

const V2_OPTIONS: Partial<ChromaKeyOptionsType> & {
  keyMode: ChromaKeyOptionsType["keyMode"];
  profile: ChromaKeyOptionsType["profile"];
} = {
  keyMode: "magenta",
  profile: "sprite-sheet",
};

/**
 * v2 YCbCr chroma key 시도 + 저장 (CK-201).
 * 성공 시 이미 저장된 output을 반환하고, 실패 시 success=false.
 */
async function attemptV2ChromaKey(
  sourceBuffer: Buffer,
  uid: string,
  sourceAssetId: string,
  stepKey: string,
): Promise<{
  success: boolean;
  output?: { output: SheetPostProcessOutputType; coins: number };
}> {
  try {
    const v2 = await applyV2ChromaKey({
      pngBuffer: sourceBuffer,
      options: V2_OPTIONS,
    });

    const v2Analysis = await _analyzeSheetAlphaQuality(v2.pngBuffer);

    // v2 결과 저장
    const saved = await savePostProcessedSheet({ uid, buffer: v2.pngBuffer, modelName: "sprite-chromakey-v2" });

    return {
      success: true,
      output: {
        coins: 0,
        output: {
          sourceAssetId,
          stepKey,
          skipped: false,
          method: "chroma-key-v2",
          url: saved.url,
          storage: saved.storage,
          sha256: crypto.createHash("sha256").update(v2.pngBuffer).digest("hex"),
          alpha: v2Analysis,
          v2: {
            engineVersion: "v2.0.0",
            quality: v2.quality,
            verdict: v2.evaluation.verdict,
            fallbackReason: v2.evaluation.verdict !== "pass" ? v2.evaluation.reason : undefined,
          },
        },
      },
    };
  } catch {
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// legacy chroma key 시도 (기존 RGB 거리 방식, CK-200 보존)
// ---------------------------------------------------------------------------

async function attemptLegacyChromaKey(
  source: { buffer: Buffer; url: string; mimeType: string },
  sourceAssetId: string,
  stepKey: string,
  uid: string,
  _beforeAnalysis: SheetAlphaAnalysisType,
): Promise<{ output: SheetPostProcessOutputType; coins: number } | null> {
  const chroma = await _removeSolidBackgroundByChromaKey(source.buffer);
  if (!chroma.keyed) return null;

  const chromaAnalysis = await _analyzeSheetAlphaQuality(chroma.buffer);
  if (!chromaAnalysis.transparentBackground) return null;

  const saved = await savePostProcessedSheet({ uid, buffer: chroma.buffer, modelName: "sprite-chromakey" });
  return {
    coins: 0,
    output: {
      sourceAssetId, stepKey, skipped: false,
      method: "chroma-key",
      url: saved.url, storage: saved.storage,
      sha256: crypto.createHash("sha256").update(chroma.buffer).digest("hex"),
      alpha: chromaAnalysis,
    },
  };
}

// ---------------------------------------------------------------------------
// AI provider fallback (유료)
// ---------------------------------------------------------------------------

/**
 * AI provider fallback (유료, CK-204: 결정적 operation ID로 멱등 보장).
 * 동일 sourceSha256+uid → 동일 operationId → billAIUsageOrThrow가 중복 차단.
 */
async function executeAIFallback(
  source: { buffer: Buffer; url: string; mimeType: string },
  sourceAssetId: string,
  stepKey: string,
  uid: string,
  operationId: string,
  sourceSha256: string,
): Promise<{ output: SheetPostProcessOutputType; coins: number }> {
  const processed = await _removeBackgroundBilled({
    uid,
    buffer: source.buffer,
    mimeType: source.mimeType,
    operationId,
    sourceSha256,
  });

  const afterAnalysis = await _analyzeSheetAlphaQuality(processed.buffer);
  if (!afterAnalysis.transparentBackground) {
    throw Object.assign(new Error("remove_bg_output_not_transparent"), {
      errorCode: "REMOVE_BG_OUTPUT_NOT_TRANSPARENT",
      status: 422,
    });
  }

  const saved = await savePostProcessedSheet({ uid, buffer: processed.buffer, modelName: "sprite-removebg" });
  return {
    coins: processed.coins,
    output: {
      sourceAssetId, stepKey, skipped: false,
      method: processed.provider,
      url: saved.url, storage: saved.storage,
      sha256: crypto.createHash("sha256").update(processed.buffer).digest("hex"),
      alpha: afterAnalysis,
    },
  };
}

// ---------------------------------------------------------------------------
// 중간 산출물 저장
// ---------------------------------------------------------------------------

async function savePostProcessedSheet(args: { uid: string; buffer: Buffer; modelName: string }) {
  const paths = resolveSmartCutPaths({ scope: "user", uid: args.uid });
  const saved = await saveBase64Image({
    base64: args.buffer.toString("base64"),
    dir: paths.dir,
    storagePrefix: paths.storagePrefix,
    visibility: "private",
    mimeType: "image/png",
    outputFormat: "png",
    modelName: args.modelName,
  });
  const savedRec = toUnknownRecord(saved);
  const storage = toUnknownRecord(savedRec.storage);
  return {
    url: String(savedRec.url || storage.url || ""),
    storage: savedRec.storage ? (storage as UnknownRecord) : undefined,
  };
}

export function toStepErrorLike(error: unknown) {
  return toErrorLike(error);
}
