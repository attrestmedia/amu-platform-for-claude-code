import "server-only";
import sharp from "sharp";
import type { ChatImageInputType } from "types/ai";
import { toUnknownRecord } from "utils/common/typeUtils";

const MAX_IMAGE_BYTES = 2_500_000;
const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;
const MAX_EDGE = 1600;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function throwImageInputError(message: string, errorCode: string): never {
  const error = new Error(message) as Error & { errorCode: string; status: number };
  error.errorCode = errorCode;
  error.status = 400;
  throw error;
}

/**
 * @docHint
 * @purpose Tutors 챗에 첨부된 transient 이미지의 서버 권위 검증
 * @process base64 크기 검증  실제 JPEG 디코딩  픽셀 제한 확인  안전한 입력만 provider 형식으로 반환
 * @domain tutors-chat
 * @scope server
 */
export async function normalizeTutorsChatImageInput(value: unknown): Promise<ChatImageInputType | undefined> {
  if (value === undefined || value === null) return undefined;

  const input = toUnknownRecord(value);
  const data = typeof input.data === "string" ? input.data.trim() : "";
  if (!data || data.length > MAX_BASE64_CHARS || !BASE64_PATTERN.test(data)) {
    throwImageInputError("이미지 데이터 형식이 올바르지 않습니다.", "TUTORS_IMAGE_INVALID");
  }

  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throwImageInputError("이미지가 너무 큽니다.", "TUTORS_IMAGE_TOO_LARGE");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: "error" }).metadata();
  } catch {
    throwImageInputError("이미지를 읽을 수 없습니다.", "TUTORS_IMAGE_DECODE_FAILED");
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (metadata.format !== "jpeg" || !width || !height) {
    throwImageInputError("JPEG 이미지가 필요합니다.", "TUTORS_IMAGE_FORMAT_UNSUPPORTED");
  }
  if (width > MAX_EDGE || height > MAX_EDGE) {
    throwImageInputError("이미지 해상도가 너무 큽니다.", "TUTORS_IMAGE_DIMENSIONS_EXCEEDED");
  }

  const source = input.source === "camera" ? "camera" : input.source === "library" ? "library" : null;
  if (!source) {
    throwImageInputError("이미지 출처가 올바르지 않습니다.", "TUTORS_IMAGE_SOURCE_INVALID");
  }

  return {
    mimeType: "image/jpeg",
    data,
    width,
    height,
    sizeBytes: buffer.length,
    source,
  };
}
