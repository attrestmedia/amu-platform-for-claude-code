import type { BehaviorType } from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import { NpcState } from "./NpcState";
import type { NpcStateContext, MovementStateResult, INpcState } from "./NpcState";
import { StateRegistry } from "./registry";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game.npc.behavior
 * @scope runtime
 */

export class FollowState extends NpcState {
  type: BehaviorType = "follow";

  update(context: NpcStateContext): MovementStateResult {
    const { npc, protagonist, npcSize, userSize, behaviorParams } = context;

    if (!protagonist) {
      return {
        dx: 0,
        dy: 0,
        remainingSteps: 0,
        pauseSteps: 0,
      };
    }

    const targetDistance = behaviorParams.targetDistance || GC.NPC_BEHAVIOR.TARGET_DISTANCE.MIN;
    const npcCenterX = npc.x + npcSize / 2;
    const npcCenterY = npc.y + npcSize / 2;
    const protCenterX = protagonist.x + userSize / 2;
    const protCenterY = protagonist.y + userSize / 2;

    const dx = protCenterX - npcCenterX;
    const dy = protCenterY - npcCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= targetDistance) {
      return { dx: 0, dy: 0, remainingSteps: 0, pauseSteps: 5 };
    } else {
      const speed = this.calculateSpeed(context);
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;

      return {
        dx: normalizedDx * speed,
        dy: normalizedDy * speed,
        remainingSteps: 10,
        pauseSteps: 0,
      };
    }
  }

  shouldTransition(context: NpcStateContext): boolean {
    const { npc, protagonist, npcSize, userSize } = context;

    if (!protagonist) return true;

    const npcCenterX = npc.x + npcSize / 2;
    const npcCenterY = npc.y + npcSize / 2;
    const protCenterX = protagonist.x + userSize / 2;
    const protCenterY = protagonist.y + userSize / 2;

    const dx = protCenterX - npcCenterX;
    const dy = protCenterY - npcCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const maxFollowRange = 300;
    return distance > maxFollowRange;
  }

  getNextState(_context: NpcStateContext): INpcState {
    const WanderCtor = StateRegistry.Wander;
    return WanderCtor ? new WanderCtor() : this;
  }
}
StateRegistry.Follow = FollowState;
