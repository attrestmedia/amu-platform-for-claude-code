import type { IExtendedNpcData, INpcInterface, NpcActionType } from "types/game";
import type { IPersonaProfileMap, PersonaType } from "types/ai";
import type { INpcIdentity } from "types/game";
import { toUnknownRecord } from "utils/common/typeUtils";

// 페르소나 모드(human/monster)를 안전하게 추출
export const getPersonaMode = (character?: { personaType?: PersonaType } | null): PersonaType => {
  return character?.personaType ?? "human";
};

/**
 * @docHint
 * @purpose npcDataHelper 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-npc
 * @scope game-runtime
 */

// NpcInterface와 IExtendedNpcData 병합
export const mergeNpcSlotWithPersona = (slot: INpcInterface, dbPersona?: IExtendedNpcData | null): IExtendedNpcData => {
  const slotPersona = slot.persona as IExtendedNpcData | undefined;

  // 1) 베이스: DB > 슬롯 > 최소 fallback
  const base: IExtendedNpcData =
    dbPersona ??
    slotPersona ??
    ({
      pid: slot.persona?.pid ?? slot.id,
      personaType: slot.persona?.personaType ?? "human",
      name: slot.displayName ?? slot.persona?.name ?? "???",
      profiles: slot.persona?.profiles ?? { default: [] },
      sprite: slot.persona?.sprite ?? null,
      systemPersonaKey: slot.persona?.systemPersonaKey,
      universeId: slot.persona?.universeId,
    } as IExtendedNpcData);

  // 2) 오버라이드 소스: 슬롯 persona 쪽을 우선 사용
  const overrides = slotPersona ?? dbPersona ?? base;

  const merged: IExtendedNpcData = {
    ...base,
    ...overrides,
    pid: base.pid, // pid는 불변
    // 이름/스프라이트/프로필은 오버라이드 우선
    name: overrides.name ?? base.name,
    profiles: overrides.profiles ?? base.profiles,
    sprite: overrides.sprite ?? base.sprite,
    ability: overrides.ability ?? base.ability,
    extra: {
      ...(base.extra || {}),
      ...(overrides.extra || {}),
    },
  };

  return merged;
};

// 캐릭터의 표시용 이름 가져오기
export const getNpcDisplayName = (npc: INpcInterface): string => {
  if (npc.displayName && npc.displayName.trim().length > 0) return npc.displayName;
  if (npc.persona?.name && npc.persona.name.trim().length > 0) return npc.persona.name;
  return "???";
};

// 캐릭터 프로필 이미지 프레임 가져오기
export function getProfileFrames(profiles: IPersonaProfileMap, variant = "default"): string[] {
  const raw = profiles[variant] ?? profiles.default;
  return raw;
}

// 캐릭터 프로필 이미지 프레임 애니메이션 체크
export function isProfileAnimated(profiles: IPersonaProfileMap, variant = "default"): boolean {
  return getProfileFrames(profiles, variant).length > 1;
}

// NpcActionType(IExtendedNpcData | INpcInterface | IGlobalNpcData)을 일관된 구조로 풀어주는 헬퍼
export const resolveNpcIdentity = (target: NpcActionType): INpcIdentity => {
  const targetRecord = toUnknownRecord(target);

  // IGlobalNpcData 인 경우 info로 재귀
  if (targetRecord.info) {
    return resolveNpcIdentity(targetRecord.info as NpcActionType);
  }

  // INpcInterface 인 경우
  if (targetRecord.persona) {
    const npc = target as INpcInterface;
    const persona = npc.persona as IExtendedNpcData;
    const displayName = getNpcDisplayName(npc);
    const pid = persona?.pid || npc.id || displayName || "unknown-npc";
    const id = npc.id || pid;
    return { id, pid, displayName, persona };
  }

  // IExtendedNpcData 직접
  const persona = target as IExtendedNpcData;
  const displayName = persona.name || "???";
  const pid = persona.pid || displayName || "unknown-npc";
  return { id: pid, pid, displayName, persona };
};
