import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgeDashboard } from "components/module/game/forge/dashboard/ForgeDashboard";

export const metadata: Metadata = {
  title: "Assets Studio | All My Universe",
  description: "게임 세계를 만드는 5단계 여정",
  robots: {
    index: false,
    follow: false,
  },
};

type PageProps = {
  searchParams: Promise<{ tab?: string; characterId?: string }>;
};

function redirectLegacyTab(tab: string, characterId?: string) {
  if (tab === "character") return "/assets-studio/character";
  if (tab === "assets" && characterId) return `/assets-studio/sprite?characterId=${encodeURIComponent(characterId)}`;
  if (tab === "assets") return "/assets-studio/world";
  if (tab === "stages") return "/assets-studio/map";
  return "";
}

export default async function ForgeDashboardPage({ searchParams }: PageProps) {
  const { tab, characterId } = await searchParams;
  const legacyTarget = tab ? redirectLegacyTab(tab, characterId) : "";
  if (legacyTarget) redirect(legacyTarget);
  return <ForgeDashboard />;
}
