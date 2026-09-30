import type { Metadata } from "next";
import { PersonalUniverseExplorer } from "components/module/game/forge/universe/PersonalUniverseExplorer";
import type { PersonalUniverseExplorerTab } from "components/module/game/forge/universe/personalUniverseExplorerModel";

export const metadata: Metadata = {
  title: "내 세계 | Assets Studio | All My Universe",
  description: "Personal Universe의 관계·사건·Story Thread를 탐색합니다.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ view?: string }>;
};

const TABS = new Set<PersonalUniverseExplorerTab>(["overview", "focus", "timeline", "threads"]);

export default async function PersonalUniversePage({ searchParams }: PageProps) {
  const { view } = await searchParams;
  const initialTab = TABS.has(view as PersonalUniverseExplorerTab) ? view as PersonalUniverseExplorerTab : "overview";
  return <PersonalUniverseExplorer key={initialTab} initialTab={initialTab} />;
}
