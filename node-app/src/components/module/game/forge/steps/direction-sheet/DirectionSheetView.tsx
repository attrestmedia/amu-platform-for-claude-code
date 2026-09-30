"use client";

import { UserCharacterBibleStudio } from "components/module/game/character-studio/UserCharacterBibleStudio";

/** STEP2의 라우트용 셸. 생성·재시도·확정 상태는 기존 파이프라인 컴포넌트가 소유한다. */
export function DirectionSheetView({
  universeId,
  characterId,
  onContinue,
  onReselect,
  onChanged,
}: {
  universeId: string;
  characterId: string;
  onContinue: (characterId: string) => void;
  onReselect: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  return (
    <UserCharacterBibleStudio
      universeId={universeId}
      characterId={characterId}
      onContinue={onContinue}
      onReselect={onReselect}
      onChanged={onChanged}
    />
  );
}
