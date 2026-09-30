import type { Metadata } from "next";
import { CharacterRegisterView } from "components/module/game/forge/steps/character/CharacterRegisterView";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { Lang } from "components/module/i18n";
import { OperatorCharacterStage } from "components/module/game/forge/operator/OperatorForgeStages";
import { OperatorForgeRoute } from "components/module/game/forge/operator/OperatorForgeRoute";

export const metadata: Metadata = {
  title: "캐릭터 등록 | Assets Studio | All My Universe",
  description: "에셋 스튜디오에서 캐릭터를 등록합니다.",
  robots: { index: false, follow: false },
};

export default function CharacterRegisterPage() {
  return (
    <OperatorForgeRoute
      operator={<OperatorCharacterStage />}
      playUser={
        <div className="space-y-4">
          <header className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h1 className="text-xl font-bold text-primary-text sm:text-2xl">
              <Lang text={{ ko: "캐릭터 등록", en: "Register a character" }} />
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text">
              <Lang
                text={{
                  ko: "이미지를 고르고 종족과 주요 속성을 정하면, 서버가 캐릭터 성향을 한 번만 확정합니다.",
                  en: "Choose an image, species, and primary attribute. The server fixes the character traits once.",
                }}
              />
            </p>
          </header>
          <CharacterRegisterView universeId={DEFAULT_PLAY_UNIVERSE} />
        </div>
      }
    />
  );
}
