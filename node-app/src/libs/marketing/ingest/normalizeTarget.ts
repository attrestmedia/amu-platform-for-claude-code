import "server-only";

import { APP_MAGAZINE_CONTENT_PATH } from "libs/server-utils/magazine/appContentContract";
import { isAppContentSlug } from "libs/server-utils/magazine/appContentValidate";

export type MarketingNormalizedTarget = {
  slug: string;
  url?: string;
  raw: string;
  sourceKind: "wp_post" | "web_page" | "app_content";
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function getAllowedHosts() {
  const rawHosts = [
    process.env.SITE_DOMAIN,
    process.env.WP_HOME_URL,
    process.env.NEXT_PUBLIC_WP_HOME_URL,
    process.env.WP_BRIDGE_ALLOWED_SITES,
  ];

  const hosts = rawHosts
    .flatMap((value) => toSafeString(value).split(","))
    .map((value) =>
      value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, ""),
    )
    .filter(Boolean);

  return new Set(hosts.length > 0 ? hosts : ["allmyuniverse.com", "app.allmyuniverse.com"]);
}

function toSlug(raw: string) {
  return toSafeString(raw)
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "";
}

/**
 * AIR-404 — `/magazine/{slug}` 경로를 App 콘텐츠로 판정한다.
 *
 * 루트 전환(AIR-101) 이후 App 콘텐츠와 WordPress 기사가 같은 호스트(allmyuniverse.com·
 * app.allmyuniverse.com)에서 서빙되므로 호스트만으로는 구분할 수 없다. 기존 `toSlug()`는
 * pathname의 마지막 세그먼트만 취해 `/magazine/{slug}`와 `/{slug}/`를 구분하지 못했다 —
 * 이게 `relationship=upgrade` 콘텐츠가 같은 slug 문자열의 WP 원문을 조용히 소스로
 * 잡던 근본 원인이다. 경로 접두사를 먼저 확인해 두 표면을 갈라야 한다.
 */
function getAppContentSlugFromPath(pathname: string): string | null {
  const path = String(pathname || "").trim();
  const prefix = `${APP_MAGAZINE_CONTENT_PATH}/`;
  if (path.indexOf(prefix) !== 0) return null;
  const remainder = path.slice(prefix.length).replace(/^\/+|\/+$/g, "");
  // `/magazine/{slug}`는 단일 세그먼트다. `/magazine/page/2/`처럼 세그먼트가 더 있으면
  // WordPress가 유지하는 아카이브·페이지네이션이지 App 콘텐츠가 아니다(G-AIR-11).
  if (!remainder || remainder.indexOf("/") !== -1) return null;
  const slug = toSlug(remainder);
  return isAppContentSlug(slug) ? slug : null;
}

function extractSlugFromUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isAllowedHost = getAllowedHosts().has(host);

    if (isAllowedHost) {
      const appContentSlug = getAppContentSlugFromPath(parsed.pathname);
      if (appContentSlug) {
        return {
          slug: appContentSlug,
          url: parsed.toString(),
          raw: rawUrl,
          sourceKind: "app_content",
        } satisfies MarketingNormalizedTarget;
      }

      const wpSlug = toSlug(parsed.pathname);
      if (wpSlug) {
        return {
          slug: wpSlug,
          url: parsed.toString(),
          raw: rawUrl,
          sourceKind: "wp_post",
        } satisfies MarketingNormalizedTarget;
      }
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    return {
      slug: toSlug(parsed.pathname) || toSlug(host) || "web-page",
      url: parsed.toString(),
      raw: rawUrl,
      sourceKind: "web_page",
    } satisfies MarketingNormalizedTarget;
  } catch {
    return null;
  }
}

function normalizeDirectSlug(raw: string) {
  const slug = toSlug(raw);
  if (!slug) return null;
  const normalized: MarketingNormalizedTarget = {
    slug,
    raw,
    sourceKind: "wp_post",
  };
  return normalized;
}

export function normalizeMarketingContentTargets(input: {
  slug?: string;
  url?: string;
  slugs?: string[];
  urls?: string[];
}) {
  const rawValues = [
    toSafeString(input.slug),
    ...((input.slugs || []).map((value) => toSafeString(value)).filter(Boolean) as string[]),
    toSafeString(input.url),
    ...((input.urls || []).map((value) => toSafeString(value)).filter(Boolean) as string[]),
  ].filter(Boolean);

  const byTarget = new Map<string, MarketingNormalizedTarget>();
  const invalid: string[] = [];

  rawValues.forEach((raw) => {
    const fromUrl = /^https?:\/\//i.test(raw) ? extractSlugFromUrl(raw) : null;
    const normalized = fromUrl || normalizeDirectSlug(raw);

    if (!normalized) {
      invalid.push(raw);
      return;
    }

    // sourceKind별로 namespace를 분리한다 — 같은 slug 문자열이라도 wp_post와 app_content는
    // 서로 다른 콘텐츠이므로(AIR-404) 한쪽이 다른 쪽을 조용히 덮어써서는 안 된다.
    const key =
      normalized.sourceKind === "web_page"
        ? `url:${normalized.url}`
        : `slug:${normalized.sourceKind}:${normalized.slug}`;
    const existing = byTarget.get(key);
    if (existing?.url && !normalized.url) {
      return;
    }

    byTarget.set(key, normalized);
  });

  return {
    targets: Array.from(byTarget.values()),
    invalid,
  };
}
