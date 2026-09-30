import type { Metadata } from "next";
import { SpriteStudioRoute } from "components/module/game/forge/steps/sprite/SpriteStudioRoute";
import { OperatorSpriteStage } from "components/module/game/forge/operator/OperatorForgeStages";
import { OperatorForgeRoute } from "components/module/game/forge/operator/OperatorForgeRoute";

export const metadata: Metadata = {
  title: "스프라이트 스튜디오 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 캐릭터 스프라이트를 생성합니다.",
  robots: { index: false, follow: false },
};

export default function SpriteStudioPage() {
  return <OperatorForgeRoute operator={<OperatorSpriteStage />} playUser={<SpriteStudioRoute />} />;
}
