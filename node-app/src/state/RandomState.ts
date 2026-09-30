import type { BehaviorType } from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import type { NpcStateContext, MovementStateResult } from "./NpcState";
import { NpcState } from "./NpcState";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game.npc.behavior
 * @scope runtime
 */

export class RandomState extends NpcState {
  type: BehaviorType = "random";

  update(context: NpcStateContext): MovementStateResult {
    const { currentState } = context;

    // 완전 랜덤 움직임
    if (currentState.remainingSteps <= 0 || Math.random() < GC.NPC_BEHAVIOR.DIRECTION_CHANGE_PROBABILITY.MIN) {
      const speed = this.calculateSpeed(context);
      const angle = this.getRandomAngle();

      return {
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        remainingSteps: Math.floor(Math.random() * GC.MOVEMENT_STEPS.RANGE) + GC.MOVEMENT_STEPS.MIN,
        pauseSteps:
          currentState.pauseSteps > 0
            ? currentState.pauseSteps
            : currentState.remainingSteps <= 0
            ? GC.NPC_BEHAVIOR.PAUSE_DURATION.MIN
            : 0,
      };
    }

    // 현재 상태 유지
    return { ...currentState };
  }
}
