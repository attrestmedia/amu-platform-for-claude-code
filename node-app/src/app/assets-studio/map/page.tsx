import type { Metadata } from "next";
import { MapStudioView } from "components/module/game/forge/steps/map/MapStudioView";

export const metadata: Metadata = {
  title: "맵 스튜디오 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 게임 맵을 제작합니다.",
  robots: { index: false, follow: false },
};

export default function MapStudioPage() {
  return <MapStudioView />;
}
