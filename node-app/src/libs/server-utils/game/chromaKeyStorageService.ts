import "server-only";
import crypto from "crypto";
import { putR2PublicObject, headR2Object, deleteR2Object, getR2PublicBucket } from "libs/server-utils/storage/r2Storage";
import { isR2StorageEnabled } from "libs/server-utils/storage/r2Storage";
import { logger } from "utils/log";
import type { ChromaKeyOptionsType, ChromaKeyQualityType } from "types/game/chroma-key";
import type { QualityEvaluationType } from "utils/game/chromaKeyQuality";

/**
 * @docHint
 * @purpose 크로마키 결과 R2 영구 저장 + HEAD 검증 + GameAsset DB 원자 갱신 (CK-301)
 *
 * 저장 순서:
 *   1. R2 PUT (content-addressed key, SHA-256 checksum)
 *   2. R2 HEAD 검증 (bytes/MIME/SHA 일치)
 *   3. GameAsset DB 업데이트
 *   4. DB 실패 시 보상 삭제 (생성한 R2 객체 제거)
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope server-only
 */

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type ChromaKeyCommitInputType = {
  outputBuffer: Buffer;
  sourceSha256: string;
  outputSha256: string;
  options: ChromaKeyOptionsType;
  quality: ChromaKeyQualityType;
  evaluation: QualityEvaluationType;
  method: string;
  engineVersion: string;
};

export type ChromaKeyCommitOutputType = {
  storage: {
    driver: "r2";
    access: "public";
    bucket: string;
    key: string;
    url: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    ext: string;
    verified: boolean;
  };
  meta: {
    postProduction: {
      chromaKey: {
        method: string;
        engineVersion: string;
        sourceSha256: string;
        outputSha256: string;
        optionsFingerprint: string;
        quality: ChromaKeyQualityType;
        evaluation: QualityEvaluationType;
        completedAt: string;
      };
    };
  };
};

// ---------------------------------------------------------------------------
// Key 빌더
// ---------------------------------------------------------------------------

/**
 * content-addressed R2 key.
 *
 * 패턴: game/chroma-key/v2/{sourceSha256}/{outputSha256}.png
 * 동일 source+output은 동일 key → 멱등 PUT (덮어쓰기 무해).
 */
export function buildChromaKeyDerivedKey(params: {
  sourceSha256: string;
  outputSha256: string;
  engineVersion?: string;
}): string {
  const { sourceSha256, outputSha256, engineVersion = "v2" } = params;
  if (!/^[a-f0-9]{64}$/i.test(sourceSha256) || !/^[a-f0-9]{64}$/i.test(outputSha256)) {
    throw new Error("invalid_sha256_for_derived_key");
  }
  return `game/chroma-key/${engineVersion}/${sourceSha256}/${outputSha256}.png`;
}

// ---------------------------------------------------------------------------
// 메인: 원자적 R2 PUT → HEAD → DB 계약
// ---------------------------------------------------------------------------

/**
 * 크로마키 처리 결과를 content-addressed R2 키에 저장하고 HEAD 검증한다.
 *
 * DB 업데이트는 호출자가 책임진다. 본 함수는 PUT+HEAD까지만 수행한다.
 * DB 실패 시 호출자는 이 함수가 반환한 storage.bucket/key로 deleteR2Object를 호출해야 한다.
 */
export async function putChromaKeyDerived(args: ChromaKeyCommitInputType): Promise<{
  storage: ChromaKeyCommitOutputType["storage"];
  meta: ChromaKeyCommitOutputType["meta"];
}> {
  // ── R2 미설정 fail-closed ──
  if (!isR2StorageEnabled()) {
    throw Object.assign(new Error("r2_storage_not_enabled"), {
      errorCode: "R2_STORAGE_NOT_ENABLED",
      status: 503,
    });
  }

  const { outputBuffer, sourceSha256, outputSha256, options, quality, evaluation, method, engineVersion } = args;

  // 1) content-addressed key 빌드
  const derivedKey = buildChromaKeyDerivedKey({ sourceSha256, outputSha256, engineVersion });
  const computedSha = crypto.createHash("sha256").update(outputBuffer).digest("hex");

  if (computedSha !== outputSha256) {
    throw Object.assign(new Error("output_sha256_mismatch"), {
      errorCode: "OUTPUT_SHA256_MISMATCH",
      status: 400,
    });
  }

  const bucket = getR2PublicBucket();
  const contentType = "image/png";

  // 2) R2 PUT (SHA-256 checksum 포함)
  let r2Object: { driver: "r2"; access: "public"; bucket: string; key: string; url: string };
  try {
    r2Object = await putR2PublicObject({
      key: derivedKey,
      body: outputBuffer,
      contentType,
      sha256: outputSha256,
    });
  } catch (putError) {
    logger.error("[ChromaKeyStorage] R2 PUT failed:", putError);
    throw Object.assign(new Error("r2_put_failed"), {
      errorCode: "R2_PUT_FAILED",
      status: 502,
    });
  }

  // 3) R2 HEAD 검증 (bytes/MIME/SHA 대조)
  let headResult: Awaited<ReturnType<typeof headR2Object>>;
  try {
    headResult = await headR2Object({ bucket, key: derivedKey });
  } catch (headError) {
    logger.error("[ChromaKeyStorage] R2 HEAD failed:", headError);
    // HEAD 실패 → 생성 객체 삭제 시도 후 fail
    await deleteR2Object({ bucket, key: derivedKey }).catch(() => {});
    throw Object.assign(new Error("r2_head_failed"), {
      errorCode: "R2_HEAD_FAILED",
      status: 502,
    });
  }

  if (!headResult) {
    await deleteR2Object({ bucket, key: derivedKey }).catch(() => {});
    throw Object.assign(new Error("r2_head_object_not_found"), {
      errorCode: "R2_HEAD_OBJECT_NOT_FOUND",
      status: 502,
    });
  }

  if (headResult.bytes !== outputBuffer.length) {
    await deleteR2Object({ bucket, key: derivedKey }).catch(() => {});
    throw Object.assign(
      new Error(`r2_head_bytes_mismatch: expected=${outputBuffer.length} actual=${headResult.bytes}`),
      { errorCode: "R2_HEAD_BYTES_MISMATCH", status: 502 },
    );
  }

  if (!headResult.contentType.startsWith("image/")) {
    await deleteR2Object({ bucket, key: derivedKey }).catch(() => {});
    throw Object.assign(
      new Error(`r2_head_mime_mismatch: expected=image/* actual=${headResult.contentType}`),
      { errorCode: "R2_HEAD_MIME_MISMATCH", status: 502 },
    );
  }

  if (headResult.sha256 && headResult.sha256 !== outputSha256) {
    await deleteR2Object({ bucket, key: derivedKey }).catch(() => {});
    throw Object.assign(
      new Error(`r2_head_sha_mismatch: expected=${outputSha256} actual=${headResult.sha256}`),
      { errorCode: "R2_HEAD_SHA_MISMATCH", status: 502 },
    );
  }

  // 4) 결과 조립
  const storage: ChromaKeyCommitOutputType["storage"] = {
    driver: "r2",
    access: "public",
    bucket: r2Object.bucket,
    key: r2Object.key,
    url: r2Object.url,
    mimeType: contentType,
    bytes: outputBuffer.length,
    sha256: outputSha256,
    ext: "png",
    verified: true,
  };

  const optionsFingerprint = crypto
    .createHash("sha256")
    .update(`${sourceSha256}|${engineVersion}|${JSON.stringify(options)}`)
    .digest("hex");

  const meta: ChromaKeyCommitOutputType["meta"] = {
    postProduction: {
      chromaKey: {
        method,
        engineVersion,
        sourceSha256,
        outputSha256,
        optionsFingerprint,
        quality,
        evaluation,
        completedAt: new Date().toISOString(),
      },
    },
  };

  return { storage, meta };
}

// ---------------------------------------------------------------------------
// 보상 삭제 헬퍼
// ---------------------------------------------------------------------------

/**
 * R2 객체 보상 삭제 (DB 실패 등에서 호출).
 * 실패해도 에러는 삼키고 false 반환.
 */
export async function compensateDeleteDerived(storage: {
  bucket: string;
  key: string;
}): Promise<boolean> {
  try {
    return await deleteR2Object({ bucket: storage.bucket, key: storage.key });
  } catch (err) {
    logger.error("[ChromaKeyStorage] compensate delete failed:", err);
    return false;
  }
}
