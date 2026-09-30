import type { IExtendedNpcData, NpcSpriteType, IUniverse, ICreateCharacterName } from "types/game";
import type { IPersonaItem, NpcScopeType } from "types/ai";
import { Container, Text, TextStyle } from "pixi.js";
import { logger } from "../log";
import { GAME_CONSTANTS as GC } from "consts/game";
import { fromPersona } from "./gameImageUtils";
import { toUnknownRecord, pickArray, pickString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose characterDisplayUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-ui
 * @scope game-runtime
 */

// 캐릭터의 표시용 이름 반환
export function getDisplayName(character: IExtendedNpcData, userPersonas: IPersonaItem[] = []): string {
  if (!character) {
    logger.warn("getDisplayName: character가 undefined입니다.");
    return "이름 없음";
  }

  // 1) INpcInterface 스타일 displayName
  const explicitDisplayName = pickString(toUnknownRecord(character).displayName);
  if (explicitDisplayName.length > 0) {
    return explicitDisplayName;
  }

  // 2) 유저 보유 페르소나 스냅샷에 저장된 표시 이름
  const userPersona = userPersonas.find((p) => {
    if (p.pid === character.pid) return true;
    const personaIdField = toUnknownRecord(p).personaId;
    return typeof personaIdField === "string" && personaIdField === character.pid;
  });
  const snapshotDisplayName = pickString(toUnknownRecord(userPersona).displayName);

  if (snapshotDisplayName.length > 0) {
    return snapshotDisplayName;
  }

  // 3) 기본 이름
  return character.name || "이름 없음";
}

// 별명 설정 확인 - 표시 이름이 원래 이름과 다른지 비교
export function hasNickname(character: IExtendedNpcData, userPersonas: IPersonaItem[] = []): boolean {
  if (!character) return false;
  const originalName = character.name || "이름 없음";
  const displayName = getDisplayName(character, userPersonas);
  return displayName !== originalName;
}

// 중복 제거 + 공백 정리
const uniq = (arr: string[]) => Array.from(new Set((arr || []).filter(Boolean).map((s) => s.trim())));

// 유니버스 npcs -> pid별 profiles 맵 생성
const buildNpcProfileMap = (universe?: IUniverse): Record<string, string[]> => {
  const map: Record<string, string[]> = {};
  const list = pickArray<unknown>(universe?.npcs);

  for (const item of list) {
    const n = toUnknownRecord(item);
    if (typeof n.pid !== "string" || !n.pid) continue;

    const rawProfiles = n.profiles;
    let frames: string[] = [];

    if (Array.isArray(rawProfiles)) {
      frames = rawProfiles.filter((v): v is string => typeof v === "string");
    } else if (rawProfiles && typeof rawProfiles === "object") {
      const def = (rawProfiles as { default?: unknown }).default;
      if (Array.isArray(def)) frames = def.filter((v): v is string => typeof v === "string");
    }

    if (!frames.length) continue;
    map[n.pid] = uniq(frames);
  }

  return map;
};

// 페르소나에 유니버스 profiles를 병합
const mergeUniverseProfiles = <T extends IExtendedNpcData>(persona: T, profileMap: Record<string, string[]>): T => {
  if (!persona?.pid) return persona;

  const extra = profileMap[persona.pid] || [];
  if (!extra.length) return persona;

  const baseProfiles = persona.profiles || { default: [] };
  const defaultFrames = Array.isArray(baseProfiles.default) ? baseProfiles.default : [];
  const mergedDefault = uniq([...defaultFrames, ...extra]);

  return {
    ...persona,
    profiles: {
      ...baseProfiles,
      default: mergedDefault,
    },
  } as T;
};

// fromPersona로 경로(base) 정규화
const ensurePersonaBasePath = <T extends IExtendedNpcData>(
  persona: T,
  opts: { universeId: string; type: NpcScopeType; isCommerceUniverse: boolean },
): T => {
  if (!persona?.pid) return persona;

  const fp = fromPersona(persona, opts); // fp.base, fp.sprite, fp.portrait 등
  const currentPath = pickString(toUnknownRecord(persona).path);

  return {
    ...persona,
    path: currentPath || fp.base,
  } as T;
};

// 경로 정규화 + 프로필 맵 병합
export const enrichPersonas = (
  personas: IExtendedNpcData[] | undefined,
  universe: IUniverse | undefined,
  opts: { universeId: string; type: NpcScopeType; isCommerceUniverse: boolean },
): IExtendedNpcData[] => {
  const list = personas || [];
  const map = buildNpcProfileMap(universe);
  return list.map((p) => mergeUniverseProfiles(ensurePersonaBasePath(p, opts), map));
};

// 캐릭터 스프라이트 위에 이름 표시 Pixi Container 생성 후 stageContainer에 추가
export function createCharacterNameContainer({
  stageContainer,
  label,
  name,
  x,
  y,
  size,
  color,
  zIndex = GC.STAGE.Z_INDEX.NPC_NAME,
}: ICreateCharacterName): Container {
  const nameContainer = new Container();

  const nameTextStyle = new TextStyle({
    fontSize: GC.UI.MESSAGE_FONT_SIZE,
    fontWeight: "bold",
    fill: color,
    align: "center",
    wordWrap: true,
    wordWrapWidth: size * 2,
    dropShadow: {
      distance: 1,
      color: 0x000000,
    },
  });

  const nameText = new Text({
    text: name,
    style: nameTextStyle,
  });

  nameText.anchor.set(0.5, 1);
  nameText.x = 0;
  nameText.y = 0;

  nameContainer.addChild(nameText);
  nameContainer.x = x + size / 2;
  nameContainer.y = y + GC.INTERACTION.MESSAGE_OFFSET_Y;
  nameContainer.label = label;
  nameContainer.zIndex = zIndex;

  stageContainer.addChild(nameContainer);

  return nameContainer;
}

// NPC 스프라이트에서 캐릭터 데이터를 안전하게 뽑는 헬퍼
export function resolveCharacterData(source: NpcSpriteType | { persona?: unknown }): IExtendedNpcData | null {
  if (!source) return null;

  // NpcSpriteType 인스턴스인 경우 -> data 필드 사용
  const raw = toUnknownRecord(toUnknownRecord(source).data ?? source);

  // INpcInterface 형태: { persona: IExtendedNpcData, ... }
  const persona = toUnknownRecord(raw.persona);
  if (persona.pid) {
    return raw.persona as IExtendedNpcData;
  }

  // 직접 ExtendedNpcData로 저장된 경우
  if (raw.pid) {
    return raw as unknown as IExtendedNpcData;
  }

  return null;
}
