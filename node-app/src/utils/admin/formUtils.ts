import type { PersonaFormBaseType, PersonaFormValuesType } from "types/ai";
import type { PersonaType } from "types/ai";

/**
 * @docHint
 * @purpose formUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain persona
 * @scope shared
 */

export function switchPersonaType(prev: PersonaFormValuesType, nextType: PersonaType): PersonaFormValuesType {
  const base: PersonaFormBaseType = {
    personaType: nextType,
    pid: prev.pid,
    universeId: prev.universeId,
    systemPersonaKey: prev.systemPersonaKey,
    name: prev.name,
    age: prev.age,
    gender: prev.gender,
    appearance: prev.appearance,
    background: prev.background,
    personality: prev.personality,
    summary: prev.summary,
    profiles: prev.profiles,
    sprite: prev.sprite,
  };

  if (nextType === "human") {
    const next: PersonaFormValuesType = {
      ...base,
      personaType: "human",
    };
    return next;
  }

  const next: PersonaFormValuesType = {
    ...base,
    personaType: "monster",
  };
  return next;
}
