import type { Metadata } from "next";
import { CrossUniverseGraphView } from "components/module/game/forge/universe/CrossUniverseGraphView";

export const metadata: Metadata = {
  title: "세계관 연결 | Assets Studio | All My Universe",
  description: "승인된 Cross-Universe Bridge와 공개 세계관 연결을 탐색합니다.",
  robots: { index: false, follow: false },
};

export default function CrossUniverseBridgePage() {
  return <CrossUniverseGraphView />;
}
