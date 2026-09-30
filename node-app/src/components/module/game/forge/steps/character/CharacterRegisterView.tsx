"use client";

import { UserCharacterStudio } from "components/module/game/character-studio/UserCharacterStudio";

/** STEP1의 사용자용 3방법 셸. 데이터·파이프라인 상태는 기존 스튜디오가 소유한다. */
export function CharacterRegisterView({ universeId }: { universeId: string }) {
  return <UserCharacterStudio universeId={universeId} embedded />;
}
