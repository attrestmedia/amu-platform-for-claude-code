import { COMMERCE_PLACEHOLDER_IMAGE } from "consts/app";

export const IMAGE_PROXY_ROUTE = "/api/proxy/image";

export function isProxyImageUrl(u: string): boolean {
  if (!u || typeof u !== "string") return false;
  // 상대/절대 모두 대응: ".../api/proxy/image?..."
  return u.includes(`${IMAGE_PROXY_ROUTE}?`) || u.endsWith(IMAGE_PROXY_ROUTE) || u.includes(`${IMAGE_PROXY_ROUTE}&`);
}

export function buildImageProxyUrl(originalUrl: string): string {
  if (!originalUrl || typeof originalUrl !== "string") return COMMERCE_PLACEHOLDER_IMAGE;

  // 이미 프록시/로컬 에셋이면 그대로
  if (originalUrl.startsWith("/assets/") || originalUrl.includes(`${IMAGE_PROXY_ROUTE}?`)) return originalUrl;

  // 절대 URL(http/https)만 프록시로 감쌈
  if (!/^https?:\/\//i.test(originalUrl)) return originalUrl;

  return `${IMAGE_PROXY_ROUTE}?url=${encodeURIComponent(originalUrl)}`;
}
