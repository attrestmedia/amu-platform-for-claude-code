import type { BehaviorType } from "types/game";
import type { MovementStateResult } from "./NpcState";
import type { NpcStateContext } from "./NpcState";
import { NpcState } from "./NpcState";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game.npc.behavior
 * @scope runtime
 */

export class StationaryState extends NpcState {
  type: BehaviorType = "stationary";

  update(_context: NpcStateContext): MovementStateResult {
    return {
      dx: 0,
      dy: 0,
      remainingSteps: 0,
      pauseSteps: 999999,
    };
  }
}
