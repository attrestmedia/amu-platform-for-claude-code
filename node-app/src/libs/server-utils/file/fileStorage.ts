import "server-only";
import path from "path";
import crypto from "crypto";
import type { UserScopeType } from "types/ai";
import type { PromptVisibilityType } from "types/app";
import { IMAGE_STUDIO_DATA_ROOT, MAX_BASE_FILE_BYTES } from "consts/app";
import {
  coerceImageBridgeFormat,
  transformImageBufferByBridge,
  type ImageBridgeFormatType,
} from "./imageTransformBridge";
import {
  deleteR2Object,
  deleteR2PublicObjectByUrl,
  headR2Object,
  isR2StorageEnabled,
  putR2PrivateObject,
  putR2PublicObject,
} from "libs/server-utils/storage/r2Storage";
import {
  deleteLegacyGenStudioImage,
  resolveLegacyGenStudioImagePath,
} from "./genStudioLegacyStorage";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process resolveSmartCutPaths 중심 처리  입력 검증  핵심 로직  결과 포맷팅  이미지 파이프라인 호출 포함
 * @domain files
 * @scope server
 */

// Windows 불가 문자를 치환 + 너무 긴 문자열 컷 + 충돌 방지 해시 추가
function sanitizeSegment(raw: string, fallback = "unknown") {
  const s = String(raw || "").trim();
  if (!s) return fallback;
  const replaced = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "") // 결합문자 제거
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") // Windows 금지문자 치환
    .replace(/\s+/g, "-"); // 공백 → 하이픈
  const short = replaced.slice(0, 60);
  // 원본 해시 꼬리표
  const suffix = crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);
  return `${short}-${suffix}`;
}

// 스마트컷 저장 경로 계산
export function resolveSmartCutPaths(args: { scope: UserScopeType; uid?: string; universeId?: string }) {
  const sub =
    args.scope === "user"
      ? `users/${sanitizeSegment(String(args.uid || ""), "anon")}`
      : `universes/${sanitizeSegment(String(args.universeId || ""), "unknown")}`;

  // 실제 디스크 경로
  const dir = path.join(process.cwd(), "public", "apps", "gen-studio", sub);
  // 브라우저에서 접근할 퍼블릭 경로
  const publicBase = `${IMAGE_STUDIO_DATA_ROOT}/${sub}`;
  const storagePrefix = `gen-studio/${sub}`;
  return { dir, publicBase, storagePrefix };
}

// base64 PNG/JPEG/WEBP 저장
export async function saveBase64Image(params: {
  base64: string;
  dir: string;
  storagePrefix?: string;
  visibility?: PromptVisibilityType;
  filename?: string;
  mimeType?: string;
  modelName?: string;
  outputFormat?: ImageBridgeFormatType;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const { base64, mimeType } = params;
  const sourceExt =
    mimeType?.includes("jpeg") || mimeType?.includes("jpg") ? "jpg" : mimeType?.includes("webp") ? "webp" : "png";
  const outputFormat = coerceImageBridgeFormat(params.outputFormat || sourceExt, "png");

  const modelTag = params.modelName ? sanitizeSegment(params.modelName, "model") : "";
  const name =
    params.filename ||
    `${Date.now()}-${modelTag ? `${modelTag}-` : ""}${Math.random().toString(36).slice(2, 8)}.${outputFormat}`;
  const payload = base64.includes(",") ? base64.split(",").pop()! : base64;

  const b = Buffer.from(payload, "base64");
  if (b.length > MAX_BASE_FILE_BYTES) throw new Error("image_too_large");

  const allowed = new Set(["png", "jpg", "jpeg", "webp"]);
  if (!allowed.has(outputFormat)) throw new Error("unsupported_format");

  const transformed = await transformImageBufferByBridge({
    input: b,
    format: outputFormat,
    quality: params.quality,
    maxWidth: params.maxWidth,
    maxHeight: params.maxHeight,
  });

  const mimeByFormat: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  const storageMeta = {
    mimeType: mimeByFormat[outputFormat] || "application/octet-stream",
    ext: outputFormat,
    bytes: transformed.buffer.length,
    sha256: crypto.createHash("sha256").update(transformed.buffer).digest("hex"),
  };

  if (!isR2StorageEnabled()) {
    throw new Error("r2_storage_required");
  }

  const key = `${String(params.storagePrefix || "gen-studio").replace(/^\/+|\/+$/g, "")}/${name}`;
  const storage =
    params.visibility === "private"
      ? await putR2PrivateObject({
          key,
          body: transformed.buffer,
          contentType: storageMeta.mimeType,
          sha256: storageMeta.sha256,
        })
      : await putR2PublicObject({
          key,
          body: transformed.buffer,
          contentType: storageMeta.mimeType,
          sha256: storageMeta.sha256,
        });
  const head = await headR2Object({ bucket: storage.bucket, key: storage.key });
  if (
    !head ||
    head.bytes !== storageMeta.bytes ||
    head.contentType !== storageMeta.mimeType ||
    head.sha256 !== storageMeta.sha256
  ) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw new Error("r2_object_verification_failed");
  }
  return {
    name,
    filePath: "",
    url: "url" in storage ? storage.url : "",
    storage: {
      ...storage,
      ...storageMeta,
      migrationState: "r2",
    },
  };
}

export function toLocalGenStudioImagePath(url: string) {
  return resolveLegacyGenStudioImagePath(url);
}

export async function deleteStoredGenStudioImageByUrl(url: string) {
  const removedR2 = await deleteR2PublicObjectByUrl(url).catch(() => false);
  if (removedR2) return true;

  return deleteLegacyGenStudioImage(url);
}

export async function deleteStoredGenStudioImageByStorage(storage: unknown) {
  const record = storage && typeof storage === "object" ? (storage as Record<string, unknown>) : {};
  const bucket = String(record.bucket || "").trim();
  const key = String(record.key || "").replace(/^\/+|\/+$/g, "");
  if (bucket && key) {
    const removed = await deleteR2Object({ bucket, key }).catch(() => false);
    if (removed) return true;
  }

  const url = String(record.url || "").trim();
  if (!url) return false;
  return await deleteStoredGenStudioImageByUrl(url);
}

// Base64 인코딩된 이미지 데이터의 유효성 검증
export function validateBase64Image(params: {
  mimeType: string;
  data: string;
  maxBytes?: number;
  allowedMimeTypes?: Set<string>;
}): { valid: true } | { valid: false; error: string } {
  const {
    mimeType,
    data,
    maxBytes = 10 * 1024 * 1024, // 기본 10MB
    allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]),
  } = params;

  // MIME 타입 검증
  if (!allowedMimeTypes.has(mimeType)) {
    return { valid: false, error: "unsupported_mime" };
  }

  // 용량 검증
  const bytes = Buffer.byteLength(data, "base64");
  if (bytes > maxBytes) {
    return { valid: false, error: "image_too_large" };
  }

  return { valid: true };
}
