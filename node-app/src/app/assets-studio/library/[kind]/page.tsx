import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForgeLibraryView } from "components/module/game/forge/library/ForgeLibraryView";
import { FORGE_LIBRARY_KINDS, type ForgeLibraryKind } from "components/module/game/forge/library/forgeLibraryModel";

export const metadata: Metadata = {
  title: "내 라이브러리 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 만든 캐릭터·에셋·맵을 모아봅니다.",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ kind: string }>;
};

export default async function ForgeLibraryPage({ params }: PageProps) {
  const { kind } = await params;
  if (!FORGE_LIBRARY_KINDS.includes(kind as ForgeLibraryKind)) notFound();
  return <ForgeLibraryView kind={kind as ForgeLibraryKind} />;
}
