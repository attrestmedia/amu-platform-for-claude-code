import type { Metadata } from "next";
import { PersonalUniverseExplorer } from "components/module/game/forge/universe/PersonalUniverseExplorer";

export const metadata: Metadata = {
  title: "전체 관계도 | Assets Studio | All My Universe",
  description: "Personal Universe의 전체 관계를 탐색합니다.",
  robots: { index: false, follow: false },
};

export default function PersonalUniverseGraphPage() {
  return <PersonalUniverseExplorer graphOnly />;
}
