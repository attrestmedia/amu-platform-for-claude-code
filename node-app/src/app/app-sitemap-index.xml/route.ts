import { APP_MAGAZINE_CANONICAL_ORIGIN } from "libs/server-utils/magazine/appContentContract";

/**
 * @docHint
 * @purpose node 전용 사이트맵 인덱스 — WP /sitemap_index.xml(WordPress 소유)과 분리
 * @process indexable node 표면(매거진 콘텐츠·공개 서비스 페이지)을 자식 사이트맵으로 노출(QA-7 separation).
 *          WP 콘텐츠 URL은 한 건도 수록하지 않는다(AIR-400 §9 수록 규칙).
 * @domain magazine-content-experience
 * @scope sitemap-route
 */

export const dynamic = "force-dynamic";

const CHILDREN = [
  `${APP_MAGAZINE_CANONICAL_ORIGIN}/app-magazine-sitemap.xml`,
  `${APP_MAGAZINE_CANONICAL_ORIGIN}/app-pages-sitemap.xml`,
  `${APP_MAGAZINE_CANONICAL_ORIGIN}/public-universe-sitemap.xml`,
] as const;

export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${CHILDREN.map(
    (loc) => `  <sitemap>\n    <loc>${loc}</loc>\n  </sitemap>`,
  ).join("\n")}\n</sitemapindex>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "all",
    },
  });
}
