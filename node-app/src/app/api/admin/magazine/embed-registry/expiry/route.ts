import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getMagazineRegistryExpiryStatus, listMagazineEmbedRegistryEntries } from "libs/server-utils/magazine/magazineEmbedRegistry";
import type { MagazineEmbedRegistryEntry } from "libs/server-utils/magazine/magazineEmbedContract";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

function serializeEntry(entry: MagazineEmbedRegistryEntry) {
  return {
    ...entry,
    expiryStatus: getMagazineRegistryExpiryStatus(entry.expiresAt),
    reviewedAt: new Date(entry.reviewedAt).toISOString(),
    ...(entry.startsAt ? { startsAt: new Date(entry.startsAt).toISOString() } : {}),
    ...(entry.expiresAt ? { expiresAt: new Date(entry.expiresAt).toISOString() } : {}),
  };
}

async function getHandler(_body: unknown, _user: AuthenticatedUserType) {
  const result = await listMagazineEmbedRegistryEntries();
  if (!result.ok) return NextResponse.json({ ok: false, error: "registry_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const data = result.entries
    .map(serializeEntry)
    .filter((entry) => entry.expiryStatus === "expiring_soon" || entry.expiryStatus === "expired" || entry.expiryStatus === "invalid");
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAuth(getHandler, undefined, "admin/magazine-embed-registry:expiry", { requireAdmin: true, bodyParser: "none" });
