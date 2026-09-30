import type { BehaviorType } from "types/game";
import { GAME_CONSTANTS as GC, GAME_ENTITIES as GE } from "consts/game";

/**
 * @docHint
 * @purpose npcBehaviorUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-npc
 * @scope game-runtime
 */

// NPC의 행동 패턴 및 파라미터 생성 함수 (무작위 값 기반으로 다양한 행동 패턴 생성)
export const generateBehaviorParams = (index: number, stageWidth: number, stageHeight: number) => {
  // 인덱스를 사용하여 행동 타입 결정 (순차적으로 할당)
  const behaviorType = GE.BEHAVIOR_TYPES[index % GE.BEHAVIOR_TYPES.length] as BehaviorType;

  // 스테이지 내부 영역 계산 (경로 포인트용)
  const innerWidth = stageWidth * GC.NPC_PLACEMENT.INNER_AREA_RATIO;
  const innerHeight = stageHeight * GC.NPC_PLACEMENT.INNER_AREA_RATIO;
  const innerStartX = (stageWidth - innerWidth) / 2;
  const innerStartY = (stageHeight - innerHeight) / 2;

  // 경로 포인트 생성 (최소 3개, 최대 5개)
  const pathPointCount =
    Math.floor(Math.random() * (GC.NPC_BEHAVIOR.PATROL_POINTS.MAX - GC.NPC_BEHAVIOR.PATROL_POINTS.MIN + 1)) +
    GC.NPC_BEHAVIOR.PATROL_POINTS.MIN;

  const pathPoints = Array.from({ length: pathPointCount }, () => ({
    x: innerStartX + Math.random() * innerWidth,
    y: innerStartY + Math.random() * innerHeight,
  }));

  return {
    type: behaviorType,
    params: {
      // 움직임 반경
      wanderRadius:
        GC.NPC_BEHAVIOR.WANDER_RADIUS.MIN +
        Math.random() * (GC.NPC_BEHAVIOR.WANDER_RADIUS.MAX - GC.NPC_BEHAVIOR.WANDER_RADIUS.MIN),

      // 타겟과의 거리
      targetDistance:
        GC.NPC_BEHAVIOR.TARGET_DISTANCE.MIN +
        Math.random() * (GC.NPC_BEHAVIOR.TARGET_DISTANCE.MAX - GC.NPC_BEHAVIOR.TARGET_DISTANCE.MIN),

      // 경로 포인트
      pathPoints,

      // 속도 배율
      speed: GC.NPC_BEHAVIOR.SPEED.MIN + Math.random() * (GC.NPC_BEHAVIOR.SPEED.MAX - GC.NPC_BEHAVIOR.SPEED.MIN),

      // 정지 및 이동 지속 시간
      pauseDuration:
        GC.NPC_BEHAVIOR.PAUSE_DURATION.MIN +
        Math.floor(Math.random() * (GC.NPC_BEHAVIOR.PAUSE_DURATION.MAX - GC.NPC_BEHAVIOR.PAUSE_DURATION.MIN)),

      moveDuration:
        GC.NPC_BEHAVIOR.MOVE_DURATION.MIN +
        Math.floor(Math.random() * (GC.NPC_BEHAVIOR.MOVE_DURATION.MAX - GC.NPC_BEHAVIOR.MOVE_DURATION.MIN)),

      // 방향 전환 확률
      changeDirectionProbability:
        GC.NPC_BEHAVIOR.DIRECTION_CHANGE_PROBABILITY.MIN +
        Math.random() *
          (GC.NPC_BEHAVIOR.DIRECTION_CHANGE_PROBABILITY.MAX - GC.NPC_BEHAVIOR.DIRECTION_CHANGE_PROBABILITY.MIN),
    },
  };
};
