"use client";

import { SpriteStudioView } from "components/module/game/forge/steps/sprite/SpriteStudioView";

/** 기존 탭·캐릭터 생성 화면과 STEP3 라우트가 같은 사용자 파이프라인을 사용하도록 유지하는 어댑터. */
export function UserCharacterAnimationStudio({
  universeId,
  characterId,
  onChooseCharacter,
  onCharacterChanged,
}: {
  universeId: string;
  characterId?: string;
  onChooseCharacter?: (characterId?: string) => void;
  onCharacterChanged?: () => void | Promise<void>;
}) {
  return (
    <SpriteStudioView
      universeId={universeId}
      characterId={characterId}
      onChooseCharacter={onChooseCharacter}
      onCharacterChanged={onCharacterChanged}
    />
  );
}
