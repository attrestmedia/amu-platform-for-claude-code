import type { Metadata } from "next";
import MagazineEmbedSurface from "components/module/magazine/MagazineEmbedSurface";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Article Experience | All My Universe",
  robots: { index: false, follow: false },
};

/**
 * @docHint
 * @purpose Magazine Article Experience 전용 iframe surface
 * @process fragment token은 client bootstrap에서 즉시 제거하고, 서버 context만 렌더
 * @domain magazine-content-experience
 * @scope embed-page
 */

export default async function MagazineEmbedPage({ params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  return <MagazineEmbedSurface integrationId={integrationId} />;
}
