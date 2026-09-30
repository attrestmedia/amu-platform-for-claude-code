import "server-only";
import { NextRequest } from "next/server";
import { toUnknownRecord } from "utils/common";
import type { NextRouteContext } from "./middlewareTypes";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process resolvePermissionId 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain auth
 * @scope global
 */

// id를 string으로 정규화
function normalizeId(v: unknown): string | undefined {
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

// 권한 체크용 ID를 단일 값으로 해석
export function resolvePermissionId(
  request: NextRequest,
  ctx: NextRouteContext,
  key: string,
  data: unknown,
): { id?: string; mismatch?: boolean } {
  const url = new URL(request.url);

  // resolveNextContext 이후의 params는 동기 객체로 정규화되어 있음
  const params = toUnknownRecord(ctx.params);
  const fromParams = normalizeId(params[key]);
  const fromQuery = normalizeId(url.searchParams.get(key));
  const fromBody = normalizeId(toUnknownRecord(data)[key]);
  const fromHeader = key === "universeId" ? normalizeId(request.headers.get("x-universe-id")) : undefined;

  const vals = [fromParams, fromQuery, fromBody, fromHeader].filter(Boolean) as string[];
  const uniq = new Set(vals);

  if (uniq.size > 1) return { mismatch: true };
  return { id: vals[0] };
}
