import "server-only";
import type { NextRouteContext } from "./middlewareTypes";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process resolveNextContext 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain api-middleware
 * @scope global
 */

function isThenable<T = unknown>(v: unknown): v is PromiseLike<T> {
  return !!v && (typeof v === "object" || typeof v === "function") && typeof (v as { then?: unknown }).then === "function";
}

export async function resolveNextContext(context: NextRouteContext): Promise<NextRouteContext> {
  const rawParams = context?.params;
  const resolvedParams = isThenable(rawParams) ? await rawParams : (rawParams ?? {});
  return { ...context, params: resolvedParams };
}
