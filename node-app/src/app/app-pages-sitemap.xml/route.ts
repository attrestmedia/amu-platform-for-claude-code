import { APP_MAGAZINE_CANONICAL_ORIGIN } from "libs/server-utils/magazine/appContentContract";
import { NODE_PUBLIC_INDEXABLE_PAGES } from "consts/seo/nodeSitemap";

/**
 * @docHint
 * @purpose node 공개 서비스 진입점 전용 자식 sitemap — WP 콘텐츠·인증/내부 제외
 * @process Build in Public 공개 긴입점(/.gen-studio/.tutors/.play/.store/.apps/.newsletter)만 수록.
 *          목록 단일 원천은 `consts/seo/nodeSitemap` — 공개 페이지 추가 시 그 상수만 고치면 자동 반영.
 *          동적 서비스 하위(템플릿·페르소나·스토어 상품 등)는 검색 가치·공개가 확정되면 별도 자식으로 확장.
 * @domain magazine-content-experience
 * @scope sitemap-route
 */

export const dynamic = "force-static";

const PUBLIC_PAGES = NODE_PUBLIC_INDEXABLE_PAGES;

export async function GET() {
  const urls = PUBLIC_PAGES.map((path) => `  <url>\n    <loc>${APP_MAGAZINE_CANONICAL_ORIGIN}${path}</loc>\n  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "all",
    },
  });
}
