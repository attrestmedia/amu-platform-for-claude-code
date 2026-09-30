import type { Metadata } from "next";
import { OperatorForgeRoute, OperatorOnlyFallback } from "components/module/game/forge/operator/OperatorForgeRoute";
import { OperatorReviewStage } from "components/module/game/forge/operator/OperatorForgeStages";

export const metadata: Metadata = {
  title: "검수·적용 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 게임 에셋을 검수하고 스테이지에 적용합니다.",
  robots: { index: false, follow: false },
};

export default function ForgeReviewPage() {
  return <OperatorForgeRoute operator={<OperatorReviewStage />} fallback={<OperatorOnlyFallback />} />;
}
