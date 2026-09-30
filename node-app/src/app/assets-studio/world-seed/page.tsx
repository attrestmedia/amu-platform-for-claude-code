import type { Metadata } from "next";
import { WorldSeedEditor } from "components/module/game/character-studio/WorldSeedEditor";

export const metadata: Metadata = {
  title: "World Seed | Assets Studio | All My Universe",
  description: "첫 캐릭터의 Personal Universe 시작 설정을 검토합니다.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ characterId?: string; universeId?: string }>;
};

export default async function WorldSeedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <WorldSeedEditor characterId={String(params.characterId || "")} universeId={String(params.universeId || "")} />;
}
