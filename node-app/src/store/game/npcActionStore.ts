import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { NpcActionType } from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import { logger } from "utils/log";
import { resolveNpcIdentity } from "utils/game/npcDataHelper";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game
 * @scope client
 */

export interface NpcActionState {
  // 액션 상태
  isActionOpen: boolean;
  actionNpc: NpcActionType | null;
  protagonistPos: { x: number; y: number } | null;
  lastInteractionTimes: Record<string, number>;
  // 중복 트리거 방지를 위한 플래그
  isInteractionProcessing: boolean;

  // 디버깅 정보
  debugInfo: {
    totalInteractions: number;
    rejectedInteractions: number;
    lastRejectedNpc: string | null;
  };

  // 액션
  openNpcAction: (npc: NpcActionType, protagonistPos?: { x: number; y: number }) => boolean;
  closeNpcAction: () => void;
  resetNpcActions: () => void;
}

const useNpcActionStore = create<NpcActionState>()(
  immer((set, get) => ({
    // 상태 초기화
    isActionOpen: false,
    actionNpc: null,
    protagonistPos: null,
    lastInteractionTimes: {},
    isInteractionProcessing: false,

    debugInfo: {
      totalInteractions: 0,
      rejectedInteractions: 0,
      lastRejectedNpc: null,
    },

    // NPC 액션 열기 (쿨다운 체크 포함)
    openNpcAction: (npc, protagonistPos) => {
      if (!npc) return false;

      const currentState = get();

      if (currentState.isInteractionProcessing || currentState.isActionOpen) {
        logger.log("NPC 액션 거부됨: 이미 처리 중이거나 다른 대화 진행 중");
        return false;
      }

      set((state) => {
        state.isInteractionProcessing = true;
        state.debugInfo.totalInteractions++;

        const { pid, displayName } = resolveNpcIdentity(npc); // ✅ 공통 헬퍼 사용
        const npcKey = pid || displayName || "unknown-npc";
        const now = Date.now();

        // 쿨다운 체크
        if (
          state.lastInteractionTimes[npcKey] &&
          now - state.lastInteractionTimes[npcKey] < GC.INTERACTION.COOLDOWN_MS
        ) {
          logger.log(
            `NPC 액션 거부됨: ${npcKey} - 쿨다운 중 (남은 시간: ${
              (GC.INTERACTION.COOLDOWN_MS - (now - state.lastInteractionTimes[npcKey])) / 1000
            }초)`,
          );
          state.debugInfo.rejectedInteractions++;
          state.debugInfo.lastRejectedNpc = npcKey;
          state.isInteractionProcessing = false;
          return state;
        }

        state.lastInteractionTimes[npcKey] = now;

        state.isActionOpen = true;
        state.actionNpc = npc;
        state.protagonistPos = protagonistPos || null;

        logger.log(`NPC 액션 트리거됨: ${npcKey}, 이름: ${displayName}, 프로타고니스트 위치:`, protagonistPos);
      });

      return true;
    },

    // NPC 액션 닫기
    closeNpcAction: () => {
      set((state) => {
        state.isActionOpen = false;
        state.actionNpc = null;
        state.protagonistPos = null;
        state.isInteractionProcessing = false; // 처리 중 플래그 초기화
      });
    },

    // 모든 NPC 액션 상태 초기화
    resetNpcActions: () => {
      set((state) => {
        state.isActionOpen = false;
        state.actionNpc = null;
        state.protagonistPos = null;
        state.lastInteractionTimes = {};
        state.isInteractionProcessing = false; // 처리 중 플래그 초기화
        state.debugInfo = {
          totalInteractions: 0,
          rejectedInteractions: 0,
          lastRejectedNpc: null,
        };
      });
    },
  })),
);

export default useNpcActionStore;
