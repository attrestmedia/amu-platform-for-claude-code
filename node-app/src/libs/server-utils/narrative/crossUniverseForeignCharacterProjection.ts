import "server-only";

import { assertForeignCharacterReference } from "libs/server-utils/narrative/crossUniversePolicy";
import type { ForeignCharacterReference } from "types/game";

/** 외부 캐릭터를 복제하지 않고, scene/prompt/UI가 공통으로 쓸 읽기 전용 projection만 만든다. */
export function projectForeignCharacterReference(reference: ForeignCharacterReference) {
  const pinned = assertForeignCharacterReference(reference);
  return {
    readonly: true as const,
    sourceUniverseId: pinned.sourceUniverseId,
    characterId: pinned.characterId,
    characterRevision: pinned.characterRevision,
    promptLabel: `[Foreign character — read only; source universe: ${pinned.sourceUniverseId}; character: ${pinned.characterId}; revision: ${pinned.characterRevision}]`,
  };
}
