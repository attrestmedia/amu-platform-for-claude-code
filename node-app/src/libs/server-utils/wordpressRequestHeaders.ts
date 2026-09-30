import "server-only";

const WORDPRESS_INTEGRATION_USER_AGENT = "AMU-Node-WordPress-Integration/1.0";

function isInternalWordPressUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && url.hostname === "wordpress" && (!url.port || url.port === "80");
  } catch {
    return false;
  }
}

/**
 * node-app이 Docker 네트워크에서 WordPress Apache로 직접 요청할 때도
 * 외부 사용자가 접근한 HTTPS 사이트와 같은 보안 컨텍스트를 전달한다.
 *
 * WordPress Application Password는 기본적으로 SSL 또는 local 환경에서만
 * 활성화된다. 운영의 http://wordpress 내부 호출에는 nginx가 없으므로 이
 * 헤더가 없으면 is_ssl()이 false가 되어 정상 자격증명도 인증되지 않는다.
 */
export function buildWordPressRequestHeaders(
  rawUrl: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  const resolved = new Headers(headers);
  resolved.set("User-Agent", WORDPRESS_INTEGRATION_USER_AGENT);

  if (isInternalWordPressUrl(rawUrl)) {
    // 호출자가 실수로 다른 값을 넘겨도 내부 운영 경로의 HTTPS 컨텍스트를 보장한다.
    resolved.set("X-Forwarded-Proto", "https");
  }

  return Object.fromEntries(resolved.entries());
}

export function isCloudflareChallengeResponse(
  response: Pick<Response, "status" | "headers">,
): boolean {
  const mitigation = String(response.headers.get("cf-mitigated") || "").toLowerCase();
  if (mitigation === "challenge") return true;

  const server = String(response.headers.get("server") || "").toLowerCase();
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  return response.status === 403 && server.includes("cloudflare") && contentType.includes("text/html");
}
