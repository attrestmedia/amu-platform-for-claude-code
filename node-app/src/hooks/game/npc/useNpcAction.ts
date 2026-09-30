import { useCallback } from "react";
import type { NpcActionType } from "types/game";
import { useNpcActionStore } from "store/game";

/**
 * @docHint
 * @purpose useNpcAction 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-npc
 * @scope client
 */

// NPC 상호작용 관리 훅
const useNpcAction = () => {
  // NPC 액션 스토어 상태와 액션 가져오기
  const { lastInteractionTimes, openNpcAction } = useNpcActionStore();

  // NPC와 상호작용 시 호출하는 함수 - 중복 호출 방지 로직 추가
  const triggerNpcAction = useCallback(
    (data: NpcActionType, protagonistPos?: { x: number; y: number }): boolean => {
      if (!data) return false;

      // 스토어의 액션 사용하여 NPC 액션 열기
      return openNpcAction(data, protagonistPos);
    },
    [openNpcAction]
  );

  // 특정 NPC의 마지막 상호작용 시간 가져오기
  const getLastInteractionTime = useCallback(
    (npcId: string): number | undefined => {
      return lastInteractionTimes[npcId];
    },
    [lastInteractionTimes]
  );

  return {
    triggerNpcAction,
    getLastInteractionTime,
  };
};

export default useNpcAction;
