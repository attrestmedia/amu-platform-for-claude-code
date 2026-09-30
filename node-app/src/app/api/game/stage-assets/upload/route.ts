import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import * as path from "path";
import crypto from "crypto";
import { isR2StorageEnabled, putR2PublicObject } from "libs/server-utils/storage/r2Storage";

import { toErrorMessage } from "utils/common";
/**
 * @docHint
 * @purpose API 라우트(game / stage-assets / upload) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain game.stage.assets
 * @scope admin_api
 */

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

function sanitizeSegment(v: string) {
  const s = String(v ?? "").trim();
  // 폴더 세그먼트 안전 처리 (path traversal 방지)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(s)) return null;
  return s;
}

function sanitizeFileName(name: string) {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  // 파일명에 위험 문자는 _ 로 치환
  const cleaned = raw
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");

  // 너무 길면 컷
  return cleaned.length > 180 ? cleaned.slice(-180) : cleaned;
}

function inferExtFromMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m === "image/png") return ".png";
  if (m === "image/jpeg") return ".jpg";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  if (m === "image/svg+xml") return ".svg";
  return "";
}

export const POST = withAuth(
  async (_data, _user, request) => {
    try {
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return NextResponse.json(
          { success: false, message: "multipart/form-data 요청만 허용됩니다." },
          { status: 400 },
        );
      }

      const form = await request.formData();

      const stageIdRaw = String(form.get("stageId") ?? "");
      const stageNameRaw = String(form.get("stageName") ?? "");
      const universeIdRaw = String(form.get("universeId") ?? "");

      const stageId = sanitizeSegment(stageIdRaw);
      const stageName = sanitizeSegment(stageNameRaw);
      const universeId = sanitizeSegment(universeIdRaw);

      if (!universeId || !stageId || !stageName) {
        return NextResponse.json(
          {
            success: false,
            message: "universeId / stageId / stageName 형식이 올바르지 않습니다. (영문/숫자/_/- 만 허용)",
          },
          { status: 400 },
        );
      }
      if (!isR2StorageEnabled()) {
        return NextResponse.json(
          { success: false, code: "r2_storage_required", message: "R2 미디어 저장소 설정이 필요합니다." },
          { status: 503 },
        );
      }

      const file = form.get("file");
      if (!file || typeof file !== "object" || !("arrayBuffer" in (file as object))) {
        return NextResponse.json({ success: false, message: "file 필드가 필요합니다." }, { status: 400 });
      }

      const f = file as File;
      if (!f.type?.toLowerCase().startsWith("image/")) {
        return NextResponse.json(
          { success: false, message: `이미지 파일만 업로드 가능합니다. (현재: ${f.type})` },
          { status: 400 },
        );
      }
      if (typeof f.size === "number" && f.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { success: false, message: `파일이 너무 큽니다. (최대 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB)` },
          { status: 413 },
        );
      }

      const preferred = sanitizeFileName(String(form.get("preferredFileName") ?? "")) || null;

      // 파일명 결정
      const original = sanitizeFileName(f.name) || `upload${inferExtFromMime(f.type) || ""}`;
      let fileName = preferred || original;

      // 확장자 없으면 mime에서 추론
      const ext = path.extname(fileName);
      if (!ext) {
        fileName = `${fileName}${inferExtFromMime(f.type) || ""}`;
      }

      const buf = Buffer.from(await f.arrayBuffer());
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const fileExt = path.extname(fileName);
      const fileBase = path.basename(fileName, fileExt);
      fileName = `${fileBase}-${sha256.slice(0, 12)}${fileExt}`;
      const key = `game/stages/${universeId}/${stageId}/${stageName}/${fileName}`;
      const storage = await putR2PublicObject({
        key,
        body: buf,
        contentType: f.type,
      });

      logger.log("[StageAssetUpload] uploaded", {
        universeId,
        stageId,
        stageName,
        fileName,
        bucket: storage.bucket,
        key: storage.key,
        size: buf.length,
        sha256,
      });

      return NextResponse.json({
        success: true,
        data: {
          fileName,
          url: storage.url,
          storage: {
            ...storage,
            mimeType: f.type,
            bytes: buf.length,
            sha256,
          },
        },
      });
    } catch (e) {
      logger.error("[StageAssetUpload] error:", e);
      return NextResponse.json(
        { success: false, message: toErrorMessage(e, "업로드 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/stage_assets_upload",
  {
    requireAdmin: true,
    bodyParser: "none", // multipart 바디를 JSON 파싱하지 않도록
  },
);
