import type { BehaviorType } from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import type { NpcStateContext, MovementStateResult, INpcState } from "./NpcState";
import { NpcState } from "./NpcState";
import { WanderState } from "./WanderState";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game.npc.behavior
 * @scope runtime
 */

export class PatrolState extends NpcState {
  type: BehaviorType = "patrol";

  update(context: NpcStateContext): MovementStateResult {
    const { currentState, behaviorParams, npc } = context;
    const pathPoints = behaviorParams.pathPoints || [];

    if (pathPoints.length === 0) {
      // 경로가 없으면 방황 상태로 전환하는 신호 반환
      return {
        dx: 0,
        dy: 0,
        remainingSteps: 0,
        pauseSteps: 0,
      };
    }

    // 현재 경로 인덱스
    const currentIndex = currentState.currentPathIndex || 0;
    const targetPoint = pathPoints[currentIndex];

    // 목표 지점과의 거리 계산
    const targetDx = targetPoint.x - npc.x;
    const targetDy = targetPoint.y - npc.y;
    const targetDistance = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

    // 목표 지점에 도달했으면 다음 지점으로
    if (targetDistance < 10) {
      const nextIndex = (currentIndex + 1) % pathPoints.length;
      const pauseDuration = behaviorParams.pauseDuration || GC.NPC_BEHAVIOR.PAUSE_DURATION.MIN;

      // 새 목표 지점을 향한 방향 계산
      const nextPoint = pathPoints[nextIndex];
      const newDx = nextPoint.x - npc.x;
      const newDy = nextPoint.y - npc.y;
      const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);
      const speed = this.calculateSpeed(context);

      return {
        dx: (newDx / newDistance) * speed,
        dy: (newDy / newDistance) * speed,
        remainingSteps: behaviorParams.moveDuration || GC.NPC_BEHAVIOR.MOVE_DURATION.MIN,
        pauseSteps: pauseDuration,
        currentPathIndex: nextIndex,
      };
    }

    // 현재 목표 지점을 향해 계속 이동
    const speed = this.calculateSpeed(context);
    return {
      dx: (targetDx / targetDistance) * speed,
      dy: (targetDy / targetDistance) * speed,
      remainingSteps: currentState.remainingSteps > 0 ? currentState.remainingSteps : 10,
      pauseSteps: currentState.pauseSteps,
      currentPathIndex: currentIndex,
    };
  }

  shouldTransition(context: NpcStateContext): boolean {
    // 경로가 없으면 다른 상태로 전환
    const pathPoints = context.behaviorParams.pathPoints || [];
    return pathPoints.length === 0;
  }

  getNextState(_context: NpcStateContext): INpcState {
    return new WanderState();
  }
}
