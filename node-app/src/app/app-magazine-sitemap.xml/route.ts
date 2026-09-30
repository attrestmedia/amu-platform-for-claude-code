import {
  APP_MAGAZINE_CANONICAL_ORIGIN,
  APP_MAGAZINE_CONTENT_PATH,
} from "libs/server-utils/magazine/appContentContract";
import { listIndexableAppMagazineContents } from "libs/server-utils/magazine/appContentRepo";

/**
 * @docHint
 * @purpose App 고도화 콘텐츠(/magazine/{slug}) 전용 자식 sitemap — WP sitemap과 분리(QA-7)
 * @process indexable=true만 수록하고, noindex(upgrade+같은 태스크) 콘텐츠는 넣지 않는다(AIR-400 §9 수록 규칙).
 * @domain magazine-content-experience
 * @scope sitemap-route
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await listIndexableAppMagazineContents(200);
  const entries = result.ok ? result.data : [];
  const urls = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${APP_MAGAZINE_CANONICAL_ORIGIN}${APP_MAGAZINE_CONTENT_PATH}/${entry.content.slug}</loc>\n    <lastmod>${entry.updatedAt}</lastmod>\n  </url>`,
    )
    .join("\n");
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
