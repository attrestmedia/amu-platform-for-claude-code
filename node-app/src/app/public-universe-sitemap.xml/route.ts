import { listIndexablePersonalUniversePublicSnapshots } from "libs/database/game";
import { getPersonalUniversePublicGate } from "libs/server-utils/narrative/personalUniversePublicPolicy";

/**
 * @docHint
 * @purpose public visibility Snapshot만 검색 색인용 sitemap에 수록
 * @process public gate off면 빈 sitemap·noindex, gate ready면 published/approved/public만 수록
 * @domain narrative-canon.personal-universe.public
 * @scope sitemap-route
 */

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] || character);
}

function emptySitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
}

export async function GET() {
  const gate = getPersonalUniversePublicGate();
  if (!gate.ready) {
    return new Response(emptySitemap(), {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const entries = await listIndexablePersonalUniversePublicSnapshots();
  const urls = entries.map((entry) => {
    const loc = `${origin}/play/universe/public/${encodeURIComponent(entry.snapshotId)}`;
    const lastmod = entry.updatedAt || entry.publishedAt;
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod.toISOString()}</lastmod>` : ""}\n  </url>`;
  }).join("\n");
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
