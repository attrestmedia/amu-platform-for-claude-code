import "server-only";
import { wpAuthUri, wpMeUri } from "consts/env/runtime";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Simple JWT Login WP auth endpoint URL 구성 및 응답 JWT 추출
 * @process 기존 env URL 분석  refresh/validate endpoint 파생  JWT query parameter 부여  응답 token 후보 추출
 * @domain auth
 * @scope server
 */

type WpJwtEndpointType = "refresh" | "validate";

function withJwtParam(rawUrl: string, token: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("JWT", token);
  return url.toString();
}

function endpointFromRestRoute(rawUrl: string, endpoint: WpJwtEndpointType) {
  const url = new URL(rawUrl);
  const restRoute = url.searchParams.get("rest_route");
  if (!restRoute) return "";

  url.searchParams.set("rest_route", restRoute.replace(/\/auth(?:\/(?:refresh|validate))?\/?$/, `/auth/${endpoint}`));
  return url.toString();
}

function endpointFromPath(rawUrl: string, endpoint: WpJwtEndpointType) {
  const url = new URL(rawUrl);
  url.pathname = url.pathname.replace(/\/auth(?:\/(?:refresh|validate))?\/?$/, `/auth/${endpoint}`);
  return url.toString();
}

export function getWpJwtEndpoint(endpoint: WpJwtEndpointType) {
  const source = endpoint === "validate" ? wpMeUri() : wpAuthUri();
  const restRouteUrl = endpointFromRestRoute(source, endpoint);
  return restRouteUrl || endpointFromPath(source, endpoint);
}

export function getWpJwtEndpointWithToken(endpoint: WpJwtEndpointType, token: string) {
  return withJwtParam(getWpJwtEndpoint(endpoint), token);
}

export function extractWpJwtToken(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const root = toUnknownRecord(payload);
  const data = toUnknownRecord(root.data);
  const candidates = [data.jwt, data.token, data.JWT, root.jwt, root.token, root.JWT];

  return (candidates.find((item) => typeof item === "string" && item.trim()) as string | undefined)?.trim() || "";
}
