import { create } from "zustand";
import type { IExtendedNpcData, IGlobalNpcData, INpcInterface, IStageData, LogicalWorldPoint } from "types/game";
import useGameStore from "./gameStore";
import { generateBehaviorParams } from "utils/game/npcBehaviorUtils";
import { gridToLogicalWorld, getSpriteIdleDirection, resolveIsometricMovementRuntime, screenToGrid } from "utils/game";
import { logger } from "utils/log";

function findSafeLogicalSpawn(
  stageData: IStageData,
  protagonistScreen: { x: number; baseY: number },
  npcs: IGlobalNpcData[],
): LogicalWorldPoint | null {
  const runtime = resolveIsometricMovementRuntime(stageData);
  if (!runtime) return null;
  const origin = gridToLogicalWorld(
    screenToGrid({ screenX: protagonistScreen.x, screenY: protagonistScreen.baseY }, runtime.projection),
    { unitsPerTile: runtime.logicalUnitsPerTile },
  );
  const units = runtime.logicalUnitsPerTile;
  const half = units * 0.25;
  const collides = (position: LogicalWorldPoint) => {
    const left = position.worldX - half;
    const top = position.worldY - half;
    const size = half * 2;
    if (left < 0 || top < 0 || left + size > runtime.gridWidth * units || top + size > runtime.gridHeight * units) {
      return true;
    }
    if (
      npcs.some((npc) =>
        Math.hypot(npc.logicalPosition.worldX - position.worldX, npc.logicalPosition.worldY - position.worldY) < units,
      )
    ) {
      return true;
    }
    return stageData.obstacles.some((obstacle) => {
      if (obstacle.isoRender?.layer === "ground") return false;
      const width = obstacle.width ?? units;
      const height = obstacle.height ?? units;
      return left < obstacle.x + width && left + size > obstacle.x && top < obstacle.y + height && top + size > obstacle.y;
    });
  };

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const angle = attempt * 2.399963229728653;
    const radius = units * (1.5 + Math.sqrt(attempt));
    const candidate = {
      worldX: origin.worldX + Math.cos(angle) * radius,
      worldY: origin.worldY + Math.sin(angle) * radius,
    };
    if (!collides(candidate)) return candidate;
  }
  return null;
}

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game
 * @scope client
 */

interface ChatWarningStatus {
  warningCount: number;
  lastRestrictionTime: number | null;
  isRestricted: boolean;
}

interface GameCharacterState {
  // 현재 선택된 캐릭터
  selectedCharacter: IExtendedNpcData | null;

  // 선택된 캐릭터 ID (캐릭터 객체가 없을 때도 사용 가능)
  selectedCharacterId: string | null;

  // 마지막 업데이트 타임스탬프 (변경 감지용)
  lastUpdated: number;

  // 캐릭터별 대화 경고 상태
  chatWarningStatus: Record<string, ChatWarningStatus>;

  // 캐릭터 선택 업데이트 함수
  setSelectedCharacter: (character: IExtendedNpcData | null) => void;

  // 캐릭터 ID만 업데이트 함수 (캐릭터 객체가 없을 때 사용)
  setSelectedCharacterId: (characterId: string | null) => void;

  // 상태 초기화 함수
  clearSelectedCharacter: () => void;

  // 캐릭터 스테이지 소환 함수
  summonCharacterToCurrentStage: (character: IExtendedNpcData) => Promise<boolean>;

  // 캐릭터별 대화 경고 상태 관리용 함수들
  incrementWarningCount: (characterId: string) => void;
  getWarningStatus: (characterId: string) => ChatWarningStatus;
  isCharacterRestricted: (characterId: string) => boolean;
  clearWarningCount: (characterId: string) => void;
  updateRestrictionStatus: (characterId: string) => void;
}

export const useGameCharacterStore = create<GameCharacterState>((set, get) => ({
  selectedCharacter: null,
  selectedCharacterId: null,
  lastUpdated: Date.now(),
  chatWarningStatus: {},

  setSelectedCharacter: (character) =>
    set({
      selectedCharacter: character,
      selectedCharacterId: character?.pid || null,
      lastUpdated: Date.now(),
    }),

  setSelectedCharacterId: (characterId) =>
    set({
      selectedCharacterId: characterId,
      // 캐릭터 객체는 유지 (ID만 변경)
      lastUpdated: Date.now(),
    }),

  clearSelectedCharacter: () =>
    set({
      selectedCharacter: null,
      selectedCharacterId: null,
      lastUpdated: Date.now(),
    }),

  // 캐릭터를 현재 스테이지에 소환하는 함수
  summonCharacterToCurrentStage: async (character: IExtendedNpcData): Promise<boolean> => {
    try {
      const gameStore = useGameStore.getState();
      const { npcs, protagonist, setNpcs, stageRuntime } = gameStore;

      if (!stageRuntime || !protagonist) {
        logger.error("게임 상태가 초기화되지 않았습니다.");
        return false;
      }

      const alreadySummoned = npcs.some((npc) => npc.info?.persona?.pid === character.pid);

      if (alreadySummoned) {
        logger.warn("해당 캐릭터는 이미 현재 스테이지에 소환되어 있습니다:", character.name);
        return false;
      }

      const npcId = `summoned-${character.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const logicalPosition = findSafeLogicalSpawn(stageRuntime.data, protagonist, npcs);
      if (!logicalPosition) {
        logger.error("안전한 소환 위치를 찾을 수 없습니다.");
        return false;
      }

      const runtime = resolveIsometricMovementRuntime(stageRuntime.data);
      if (!runtime) return false;
      const behavior = generateBehaviorParams(
        Math.floor(Math.random() * 100),
        runtime.gridWidth * runtime.logicalUnitsPerTile,
        runtime.gridHeight * runtime.logicalUnitsPerTile,
      );

      const info: INpcInterface = {
        id: npcId,
        persona: character,
        behavior,
        direction: getSpriteIdleDirection(character.sprite),
        logicalPosition,
      };

      const newNpcData: IGlobalNpcData = {
        id: npcId,
        logicalPosition,
        info,
      };

      setNpcs([...npcs, newNpcData]);

      window.dispatchEvent(
        new CustomEvent("summonNpc", {
          detail: { npcData: newNpcData },
        }),
      );

      logger.log("캐릭터 소환 완료:", {
        name: character.name,
        id: npcId,
        logicalPosition,
      });

      return true;
    } catch (error) {
      logger.error("캐릭터 소환 실패:", error);
      return false;
    }
  },

  // 경고 카운트 증가 함수
  incrementWarningCount: (characterId: string) => {
    const currentTime = Date.now();

    set((state) => {
      const currentStatus = state.chatWarningStatus[characterId] || {
        warningCount: 0,
        lastRestrictionTime: null,
        isRestricted: false,
      };

      const newWarningCount = currentStatus.warningCount + 1;
      const shouldRestrict = newWarningCount >= 3;

      const updatedStatus: ChatWarningStatus = {
        warningCount: newWarningCount,
        lastRestrictionTime: shouldRestrict ? currentTime : currentStatus.lastRestrictionTime,
        isRestricted: shouldRestrict,
      };

      logger.log(`[CharacterStore] 경고 카운트 증가: ${characterId}`, {
        이전카운트: currentStatus.warningCount,
        새카운트: newWarningCount,
        제한여부: shouldRestrict,
        제한시간: shouldRestrict ? new Date(currentTime) : null,
      });

      return {
        chatWarningStatus: {
          ...state.chatWarningStatus,
          [characterId]: updatedStatus,
        },
      };
    });
  },

  // 특정 캐릭터의 경고 상태 조회
  getWarningStatus: (characterId: string): ChatWarningStatus => {
    const state = get();
    return (
      state.chatWarningStatus[characterId] || {
        warningCount: 0,
        lastRestrictionTime: null,
        isRestricted: false,
      }
    );
  },

  // 캐릭터 제한 여부 확인 (30분 경과 시 자동 해제)
  isCharacterRestricted: (characterId: string): boolean => {
    const state = get();
    const status = state.chatWarningStatus[characterId];

    if (!status || !status.isRestricted) {
      return false;
    }

    const CHAT_BLOCK_DURATION = 30 * 60 * 1000; // 30분
    const currentTime = Date.now();
    const timeSinceRestriction = currentTime - (status.lastRestrictionTime || 0);

    // 30분이 지났으면 제한 해제
    if (timeSinceRestriction >= CHAT_BLOCK_DURATION) {
      // 제한 상태 업데이트
      get().updateRestrictionStatus(characterId);
      return false;
    }

    return true;
  },

  // 제한 상태 업데이트 (30분 경과 시 카운트 초기화)
  updateRestrictionStatus: (characterId: string) => {
    set((state) => {
      const currentStatus = state.chatWarningStatus[characterId];

      if (!currentStatus) return state;

      const CHAT_BLOCK_DURATION = 30 * 60 * 1000; // 30분
      const currentTime = Date.now();
      const timeSinceRestriction = currentTime - (currentStatus.lastRestrictionTime || 0);

      // 30분이 지났으면 카운트 초기화
      if (timeSinceRestriction >= CHAT_BLOCK_DURATION && currentStatus.isRestricted) {
        logger.log(`[CharacterStore] 제한 해제: ${characterId}`, {
          제한시간: new Date(currentStatus.lastRestrictionTime || 0),
          현재시간: new Date(currentTime),
          경과시간분: Math.floor(timeSinceRestriction / (60 * 1000)),
        });

        return {
          chatWarningStatus: {
            ...state.chatWarningStatus,
            [characterId]: {
              warningCount: 0,
              lastRestrictionTime: null,
              isRestricted: false,
            },
          },
        };
      }

      return state;
    });
  },

  // 경고 카운트 수동 초기화
  clearWarningCount: (characterId: string) => {
    set((state) => ({
      chatWarningStatus: {
        ...state.chatWarningStatus,
        [characterId]: {
          warningCount: 0,
          lastRestrictionTime: null,
          isRestricted: false,
        },
      },
    }));

    logger.log(`[CharacterStore] 경고 카운트 초기화: ${characterId}`);
  },
}));
