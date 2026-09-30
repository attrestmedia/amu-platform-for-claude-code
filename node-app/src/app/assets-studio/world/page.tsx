import type { Metadata } from "next";
import { WorldAssetView } from "components/module/game/forge/steps/world/WorldAssetView";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { OperatorWorldStage } from "components/module/game/forge/operator/OperatorForgeStages";
import { OperatorForgeRoute } from "components/module/game/forge/operator/OperatorForgeRoute";

export const metadata: Metadata = {
  title: "월드 에셋 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 월드 에셋을 생성하고 관리합니다.",
  robots: { index: false, follow: false },
};

export default function WorldAssetPage() {
  return <OperatorForgeRoute operator={<OperatorWorldStage />} playUser={<WorldAssetView universeId={DEFAULT_PLAY_UNIVERSE} />} />;
}
