import { NextResponse } from "next/server";
import type { NextRouteContext } from "libs/server-utils/api/_helpers";
import { getPublishedPersonalUniversePublicSnapshot } from "libs/database/game";
import { getPersonalUniversePublicGate } from "libs/server-utils/narrative/personalUniversePublicPolicy";
import { toPublicUniverseSnapshotResponse } from "libs/server-utils/narrative/personalUniversePublicSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 공개 응답은 flag·moderation-approved·published snapshot만 통과한다. */
export async function GET(_request: Request, context: NextRouteContext) {
  const gate = getPersonalUniversePublicGate();
  if (!gate.ready) return NextResponse.json({ ok: false, error: "PUBLIC_UNIVERSE_UNAVAILABLE" }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
  const params = await Promise.resolve(context?.params);
  const snapshot = await getPublishedPersonalUniversePublicSnapshot(params?.snapshotId || "");
  if (!snapshot) return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_NOT_FOUND" }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
  if (snapshot.visibility !== "public" && snapshot.visibility !== "link") return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_NOT_FOUND" }, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
  const indexable = snapshot.visibility === "public";
  return NextResponse.json(
    { ok: true, data: toPublicUniverseSnapshotResponse({ snapshotId: snapshot.snapshotId, visibility: snapshot.visibility, publishedAt: snapshot.publishedAt, content: snapshot.content }) },
    {
      headers: {
        "Cache-Control": indexable ? "public, max-age=60, s-maxage=300, stale-while-revalidate=600" : "private, no-store",
        "X-Robots-Tag": indexable ? "index, follow" : "noindex, nofollow",
      },
    },
  );
}
