import { useMemo } from "react";
import { GAME_CONSTANTS as GC } from "consts/game";

/**
 * @docHint
 * @purpose useAnimationCalculation 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-animation
 * @scope global
 */

// 애니메이션 오프셋 타입 정의
export interface AnimationOffsets {
  walkingOffsets: number[];
  breathingOffsets: number[];
}

// 훅 반환 타입 정의
export interface AnimationCalculationResult {
  preCalculatedAnimationOffsets: AnimationOffsets;
  ANIMATION_FRAMES: number;
}

/**
 * 애니메이션 오프셋을 미리 계산하여 성능을 최적화하는 훅
 * 걷기와 숨쉬기 애니메이션을 위한 Y축 오프셋 값을 계산합니다.
 * @returns 계산된 애니메이션 오프셋 테이블과 프레임 수
 */
export function useAnimationCalculation(): AnimationCalculationResult {
  // 애니메이션 프레임 수 정의
  const ANIMATION_FRAMES = 60;

  // 미리 계산된 애니메이션 오프셋 테이블 (성능 최적화)
  const preCalculatedAnimationOffsets = useMemo<AnimationOffsets>(() => {
    // 걷기 애니메이션 오프셋 미리 계산
    const walkingOffsets = new Array(ANIMATION_FRAMES);
    for (let i = 0; i < ANIMATION_FRAMES; i++) {
      const walkCycle = (i % GC.ANIMATION.WALKING.STEP_FREQUENCY) / GC.ANIMATION.WALKING.STEP_FREQUENCY;
      const offsetValue = Math.abs(Math.sin(walkCycle * Math.PI));
      walkingOffsets[i] = -offsetValue * GC.ANIMATION.WALKING.HEIGHT_OFFSET;
    }

    // 숨쉬기 애니메이션 오프셋 미리 계산
    const breathingOffsets = new Array(ANIMATION_FRAMES);
    for (let i = 0; i < ANIMATION_FRAMES; i++) {
      const breathCycle = (i % GC.ANIMATION.BREATHING.CYCLE_DURATION) / GC.ANIMATION.BREATHING.CYCLE_DURATION;
      const offsetValue = Math.sin(breathCycle * Math.PI * 2);
      breathingOffsets[i] = -offsetValue * GC.ANIMATION.BREATHING.HEIGHT_OFFSET;
    }

    return { walkingOffsets, breathingOffsets };
  }, []); // 의존성 배열이 비어있음 - 상수만 사용하므로 처음 한 번만 계산

  return { preCalculatedAnimationOffsets, ANIMATION_FRAMES };
}
