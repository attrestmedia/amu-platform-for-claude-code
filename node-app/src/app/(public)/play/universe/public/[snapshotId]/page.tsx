import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPersonalUniversePublicSnapshot } from "libs/database/game";
import { getPersonalUniversePublicGate } from "libs/server-utils/narrative/personalUniversePublicPolicy";
import { PublicUniverseSnapshotView } from "components/module/game/forge/universe/PublicUniverseSnapshotView";

const DEFAULT_OG_IMAGE = "https://app.allmyuniverse.com/social/app-default-1200x630.jpg";

type PageProps = { params: Promise<{ snapshotId: string }> };

async function loadSnapshot(snapshotId: string) {
  if (!getPersonalUniversePublicGate().ready) return null;
  return getPublishedPersonalUniversePublicSnapshot(snapshotId);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { snapshotId } = await params;
  const snapshot = await loadSnapshot(snapshotId);
  if (!snapshot) return { title: "Universe Snapshot | All My Universe", robots: { index: false, follow: false } };
  const description = snapshot.content.premise || `${snapshot.content.worldName}의 공개 Universe Snapshot`;
  const indexable = snapshot.visibility === "public";
  const origin = String(process.env.NEXT_PUBLIC_APP_URL || "https://app.allmyuniverse.com").replace(/\/$/, "");
  return {
    title: `${snapshot.content.worldName} | All My Universe`,
    description,
    robots: { index: indexable, follow: indexable },
    alternates: { canonical: `${origin}/play/universe/public/${encodeURIComponent(snapshot.snapshotId)}` },
    openGraph: { title: snapshot.content.worldName, description, type: "website", images: [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary_large_image", title: snapshot.content.worldName, description, images: [DEFAULT_OG_IMAGE] },
  };
}

export default async function PublicUniverseSnapshotPage({ params }: PageProps) {
  const { snapshotId } = await params;
  const snapshot = await loadSnapshot(snapshotId);
  if (!snapshot) notFound();
  return <PublicUniverseSnapshotView snapshotId={snapshot.snapshotId} visibility={snapshot.visibility as "link" | "public"} content={snapshot.content} />;
}
