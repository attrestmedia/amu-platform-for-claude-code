import "server-only";
import { NextRequest } from "next/server";
import { toUnknownRecord, type UnknownRecord } from "utils/common";
import type { BodyParserMode } from "./middlewareTypes";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process parseRequestData 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain api-middleware
 * @scope global
 */

// content-type이 json 계열인지 판별
function isJsonContentType(contentType: string): boolean {
  const ct = (contentType || "").toLowerCase();
  return ct.includes("application/json") || ct.includes("+json");
}

// request body를 JSON으로 파싱
export type ParsedRequestData = UnknownRecord | unknown[];

export async function parseRequestData(request: NextRequest, mode: BodyParserMode): Promise<ParsedRequestData> {
  const method = (request.method || "GET").toUpperCase();
  const isBodyMethod = method !== "GET" && method !== "HEAD";
  if (!isBodyMethod) return {};

  const contentType = request.headers.get("content-type") || "";
  const ctLower = contentType.toLowerCase();
  const isMultipart = ctLower.includes("multipart/form-data");

  if (mode === "none" || isMultipart) return {};

  if (mode === "auto" && contentType && !isJsonContentType(contentType)) return {};

  const parsed = await request.json().catch(() => ({}));
  return Array.isArray(parsed) ? parsed : toUnknownRecord(parsed);
}
