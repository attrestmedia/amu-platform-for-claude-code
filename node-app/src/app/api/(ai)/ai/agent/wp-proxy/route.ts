/**
 * @docHint
 * @purpose 에이전트(MCP) 쓰기 요청을 서버에서 인증 주입해 WordPress REST로 포워딩(자격증명 비노출)
 * @process agent key 검증 → method/path allowlist 및 리소스 scope 검증 → cleanup write rate limit 선택 적용 → DB 자격증명 주입 → WP 포워딩 → envelope 반환
 * @domain integration
 * @scope agent-api
 */
import { NextRequest, NextResponse } from "next/server";
import { wpApiUri } from "consts/env/runtime";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import {
  AGENT_WP_PROXY_POLICY,
  enforceAgentRequestRateLimit,
} from "libs/server-utils/auth/agentRateLimit";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { buildWordPressRequestHeaders } from "libs/server-utils/wordpressRequestHeaders";
import { logger } from "utils/log";

import { extractCodedError } from "utils/common";
export const runtime = "nodejs";

const AGENT_WP_PROXY_ENDPOINT = "ai/agent/wp-proxy";

// WordPress REST 중 에이전트 쓰기 오케스트레이션에 필요한 리소스만 허용한다.
const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE"]);
const ALLOWED_RESOURCES = new Set(["posts", "tags", "categories", "users", "media", "pages"]);
const WP_PATH_PREFIX = "/wp-json/wp/v2/";

// SEO·콘텐츠 재고 조회(mu-plugin amu-seo-insights)는 읽기 전용이라 별도 네임스페이스로 통제한다.
const SEO_INSIGHTS_PREFIX = "/wp-json/amu/v1/seo-insights";
const SEO_INSIGHTS_RESOURCE = "seo-insights";
const CONTENT_REDIRECTS_PREFIX = "/wp-json/amu/v1/content-redirects";
const CONTENT_REDIRECTS_RESOURCE = "content-redirects";

// 고지 문서는 기사와 위험도가 다르므로 WordPress 페이지 권한을 별도로 통제한다.
const RESOURCE_SCOPES: Record<string, string> = {
  pages: "wp:pages:write",
  [SEO_INSIGHTS_RESOURCE]: "wp:seo:read",
};
const DEFAULT_WP_SCOPE = "wp:posts:write";

// 읽기 전용 리소스는 쓰기 메서드를 허용하지 않는다.
const READ_ONLY_RESOURCES = new Set([SEO_INSIGHTS_RESOURCE]);
const CLEANUP_WRITE_RESOURCES = new Set(["posts", "categories", CONTENT_REDIRECTS_RESOURCE]);

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function resolveWpOrigin(): string {
  return new URL(wpApiUri()).origin;
}

function wpAuthHeader(username: string, applicationPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString("base64")}`;
}

function hasResourceId(path: string) {
  return /\/\d+\/?(?:\?.*)?$/.test(path);
}

function isCleanupRequest(method: string, resource: string, path: string, rawBody: unknown) {
  if (!CLEANUP_WRITE_RESOURCES.has(resource)) return false;
  if (resource === CONTENT_REDIRECTS_RESOURCE) return true;
  if (resource === "categories") return hasResourceId(path);
  if (resource !== "posts" || !hasResourceId(path)) return false;
  if (method === "GET") return true;
  if (method === "DELETE") return true;
  if (typeof rawBody !== "string") return false;

  try {
    const body = JSON.parse(rawBody) as { categories?: unknown; status?: unknown };
    return Array.isArray(body.categories) || body.status === "trash";
  } catch {
    return false;
  }
}

// path는 반드시 /wp-json/wp/v2/{allowed-resource} 형태여야 하며, 절대경로/상위탐색을 금지한다.
function validateWpPath(
  rawPath: string,
): { ok: true; path: string; resource: string } | { ok: false; error: string } {
  const path = toSafeString(rawPath);
  if (path.includes("..") || path.includes("://")) return { ok: false, error: "path_traversal_blocked" };

  // SEO 조회 네임스페이스는 고정 경로 + 쿼리스트링만 허용한다(하위 경로 확장 금지).
  if (path === SEO_INSIGHTS_PREFIX || path.startsWith(`${SEO_INSIGHTS_PREFIX}?`)) {
    return { ok: true, path, resource: SEO_INSIGHTS_RESOURCE };
  }

  if (path === CONTENT_REDIRECTS_PREFIX || path.startsWith(`${CONTENT_REDIRECTS_PREFIX}?`)) {
    return { ok: true, path, resource: CONTENT_REDIRECTS_RESOURCE };
  }

  if (!path.startsWith(WP_PATH_PREFIX)) return { ok: false, error: "path_not_allowed_prefix" };

  const afterPrefix = path.slice(WP_PATH_PREFIX.length);
  const resource = afterPrefix.split(/[/?]/)[0];
  if (!ALLOWED_RESOURCES.has(resource)) return { ok: false, error: "resource_not_allowed" };

  return { ok: true, path, resource };
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const payload = (await request.json().catch(() => null)) as
      | { method?: unknown; path?: unknown; body?: unknown }
      | null;
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "invalid_json_body", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const method = toSafeString(payload.method).toUpperCase() || "GET";
    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { ok: false, error: "method_not_allowed", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const pathCheck = validateWpPath(payload.path as string);
    if (!pathCheck.ok) {
      return NextResponse.json(
        { ok: false, error: pathCheck.error, errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    if (READ_ONLY_RESOURCES.has(pathCheck.resource) && method !== "GET") {
      return NextResponse.json(
        { ok: false, error: "read_only_resource", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const scopeAuth = validateAgentKey(request, {
      scope: RESOURCE_SCOPES[pathCheck.resource] || DEFAULT_WP_SCOPE,
    });
    if (!scopeAuth.valid) {
      return NextResponse.json(
        { ok: false, error: scopeAuth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const bypassCleanupRateLimit =
      AGENT_WP_PROXY_POLICY.cleanupWriteRateLimitDisabled &&
      isCleanupRequest(method, pathCheck.resource, pathCheck.path, payload.body);
    if (!bypassCleanupRateLimit) {
      await enforceAgentRequestRateLimit({
        uid: auth.uid,
        endpoint: AGENT_WP_PROXY_ENDPOINT,
        limitPerMinute: AGENT_WP_PROXY_POLICY.maxRequestsPerMinute,
        keyHash: auth.keyHash,
      });
    }

    const { payload: cred } = await resolvePlatformCredential("integration.wordpress.rest");
    const username = toSafeString(cred.username);
    const applicationPassword = toSafeString(cred.applicationPassword);
    if (!username || !applicationPassword) {
      return NextResponse.json(
        { ok: false, error: "wp_credential_incomplete", errorCode: "PLATFORM_CREDENTIAL_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const forwardBody = typeof payload.body === "string" ? payload.body : undefined;
    const url = `${resolveWpOrigin()}${pathCheck.path}`;
    const wpRes = await fetch(url, {
      method,
      headers: buildWordPressRequestHeaders(url, {
        authorization: wpAuthHeader(username, applicationPassword),
        accept: "application/json",
        ...(forwardBody ? { "content-type": "application/json" } : {}),
      }),
      body: method === "GET" ? undefined : forwardBody,
      signal: AbortSignal.timeout(45_000),
    });

    const text = await wpRes.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }

    return NextResponse.json({ ok: wpRes.ok, status: wpRes.status, data });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, {
      message: "internal_server_error",
    });
    logger.error("[agent-wp-proxy] failed", {
      endpoint: AGENT_WP_PROXY_ENDPOINT,
      error: message,
      errorCode,
      status,
    });

    return NextResponse.json(
      { ok: false, error: message, errorCode },
      { status },
    );
  }
}
