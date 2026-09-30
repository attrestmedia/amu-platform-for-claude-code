import type { Metadata } from "next";
import { OperatorForgeRoute, OperatorOnlyFallback } from "components/module/game/forge/operator/OperatorForgeRoute";
import { ReferenceStudioRoute } from "components/module/game/forge/steps/reference/ReferenceStudioRoute";

export const metadata: Metadata = {
  title: "레퍼런스 킷 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 캐릭터와 모델 레퍼런스 킷을 관리합니다.",
  robots: { index: false, follow: false },
};

export default function ReferenceKitPage() {
  return <OperatorForgeRoute operator={<ReferenceStudioRoute />} fallback={<OperatorOnlyFallback />} />;
}
