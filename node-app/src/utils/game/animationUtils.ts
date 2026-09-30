import type { DirectionFacingType } from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";

/**
 * @docHint
 * @purpose animationUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-animation
 * @scope game-runtime
 */

// 캐릭터 움직임에 따른 애니메이션의 Y 좌표 오프셋을 계산
export function calculateAnimationYOffset(frameCount: number, isMoving: boolean): number {
  if (isMoving) {
    // 걷기 애니메이션 - 통통 튀는 느낌으로 높이 조절
    // sin 함수의 절대값을 사용하여 0~1 사이의 값을 얻은 후, 오프셋 높이를 곱합니다
    // sin 함수의 값이 0일 때는 애니메이션 오프셋도 0이 됩니다
    const walkCycle = (frameCount % GC.ANIMATION.WALKING.STEP_FREQUENCY) / GC.ANIMATION.WALKING.STEP_FREQUENCY;
    const offsetValue = Math.abs(Math.sin(walkCycle * Math.PI));
    return -offsetValue * GC.ANIMATION.WALKING.HEIGHT_OFFSET; // 음수값이 위로 올립니다
  } else {
    // 숨쉬기 애니메이션 - 천천히 높이 조절
    // -1~1 범위의 sin 값을 얻은 후 오프셋 높이를 곱합니다
    const breathCycle = (frameCount % GC.ANIMATION.BREATHING.CYCLE_DURATION) / GC.ANIMATION.BREATHING.CYCLE_DURATION;
    const offsetValue = Math.sin(breathCycle * Math.PI * 2);
    return -offsetValue * GC.ANIMATION.BREATHING.HEIGHT_OFFSET; // 음수값이 위로 올립니다
  }
}

export function getOppositeDirection(direction: DirectionFacingType): DirectionFacingType {
  switch (direction) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "up":
      return "down";
    case "down-left":
      return "up-right";
    case "up-left":
      return "down-right";
    case "up-right":
      return "down-left";
    case "down-right":
      return "up-left";
    default:
      return "up";
  }
}

// 화면 좌표계 벡터를 아이소 8방향으로 변환 (P1-2, 에셋 계약 v2 §1.2/§1.3)
// - 사분면(양축) 입력 → 아이소 4방향 별칭 (v1과 동일: left=NW, up=NE, right=SE, down=SW)
// - 순수 축 입력 → 아이소 cardinal = v2 대각 행 (down-left=W, up-left=N, up-right=E, down-right=S)
export function calculateDirection8(dx: number, dy: number, isMoving: boolean): DirectionFacingType {
  if (!isMoving) {
    return "down"; // 정지 상태 기본값은 south-west(SW)
  }

  if (dx < 0 && dy < 0) return "left";
  if (dx > 0 && dy < 0) return "up";
  if (dx > 0 && dy > 0) return "right";
  if (dx < 0 && dy > 0) return "down";

  if (dx < 0) return "down-left";
  if (dx > 0) return "up-right";
  if (dy < 0) return "up-left";
  if (dy > 0) return "down-right";

  return "down";
}

export function calculateDirection(dx: number, dy: number, isMoving: boolean): DirectionFacingType {
  return calculateDirection8(dx, dy, isMoving);
}

export function calculateDirectionToTarget(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fallback: DirectionFacingType = "down",
): DirectionFacingType {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const isMoving = Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001;

  return isMoving ? calculateDirection(dx, dy, true) : fallback;
}
