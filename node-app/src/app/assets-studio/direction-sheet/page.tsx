import type { Metadata } from "next";
import { DirectionSheetRoute } from "components/module/game/forge/steps/direction-sheet/DirectionSheetRoute";
import { OperatorMasterSheetStage } from "components/module/game/forge/operator/OperatorForgeStages";
import { OperatorForgeRoute } from "components/module/game/forge/operator/OperatorForgeRoute";

export const metadata: Metadata = {
  title: "방향 시트 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 캐릭터 방향 시트를 생성합니다.",
  robots: { index: false, follow: false },
};

export default function DirectionSheetPage() {
  return <OperatorForgeRoute operator={<OperatorMasterSheetStage />} playUser={<DirectionSheetRoute />} />;
}
