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

export class WanderState extends NpcState {
  type: BehaviorType = "wander";

  enter(context: NpcStateContext): void {
    // 방황 상태 진입 시 초기화 로직
    const speed = this.calculateSpeed(context);
    const angle = this.getRandomAngle();

    context.currentState.dx = Math.cos(angle) * speed;
    context.currentState.dy = Math.sin(angle) * speed;
    context.currentState.remainingSteps =
      context.behaviorParams.moveDuration ||
      Math.floor(Math.random() * GC.MOVEMENT_STEPS.RANGE) + GC.MOVEMENT_STEPS.MIN;
  }

  update(context: NpcStateContext): MovementStateResult {
    const { currentState, behaviorParams } = context;

    // 이동 단계가 남아있지 않거나 방향 변경 확률에 따라 새 방향 설정
    if (
      currentState.remainingSteps <= 0 ||
      Math.random() < (behaviorParams.changeDirectionProbability || GC.NPC_BEHAVIOR.DIRECTION_CHANGE_PROBABILITY.MIN)
    ) {
      const speed = this.calculateSpeed(context);
      const angle = this.getRandomAngle();
      const moveDuration =
        behaviorParams.moveDuration || Math.floor(Math.random() * GC.MOVEMENT_STEPS.RANGE) + GC.MOVEMENT_STEPS.MIN;
      const pauseDuration = behaviorParams.pauseDuration || GC.NPC_BEHAVIOR.PAUSE_DURATION.MIN;

      return {
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        remainingSteps: moveDuration,
        pauseSteps:
          currentState.pauseSteps > 0 ? currentState.pauseSteps : currentState.remainingSteps <= 0 ? pauseDuration : 0,
      };
    }

    // 현재 상태 유지
    return { ...currentState };
  }

  shouldTransition(context: NpcStateContext): boolean {
    // 예: 주인공이 가까워지면 Follow 상태로 전환 가능
    if (!context.protagonist) return false;

    const npcCenterX = context.npc.x + context.npcSize / 2;
    const npcCenterY = context.npc.y + context.npcSize / 2;
    const protCenterX = context.protagonist.x + context.userSize / 2;
    const protCenterY = context.protagonist.y + context.userSize / 2;

    const dx = protCenterX - npcCenterX;
    const dy = protCenterY - npcCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 감지 거리 범위 내에 들어오면 확률적으로 상태 전환
    const detectionRange = 200; // 감지 범위
    return distance < detectionRange && Math.random() < 0.1; // 10% 확률로 전환
  }

  getNextState(_context: NpcStateContext): INpcState {
    const FollowCtor = StateRegistry.Follow;
    return FollowCtor ? new FollowCtor() : this;
  }
}
StateRegistry.Wander = WanderState;
