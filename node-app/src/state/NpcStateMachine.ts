import type { BehaviorType } from "types/game";
import type { NpcStateContext, MovementStateResult, INpcState } from "./NpcState";
import { FollowState } from "./FollowState";
import { PatrolState } from "./PatrolState";
import { StationaryState } from "./StationaryState";
import { RandomState } from "./RandomState";
import { WanderState } from "./WanderState";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game.npc.behavior
 * @scope runtime
 */

export class NpcStateMachine {
  private context: NpcStateContext;
  private currentState: INpcState;
  private stateMap: Map<BehaviorType, INpcState>;

  constructor(context: NpcStateContext) {
    this.context = context;

    // 모든 상태 인스턴스 생성 및 매핑
    this.stateMap = new Map();
    this.stateMap.set("wander", new WanderState());
    this.stateMap.set("follow", new FollowState());
    this.stateMap.set("patrol", new PatrolState());
    this.stateMap.set("stationary", new StationaryState());
    this.stateMap.set("random", new RandomState());

    // 초기 상태 설정
    const initialBehaviorType = context.npc.data?.behavior?.type || "wander";
    this.currentState = this.stateMap.get(initialBehaviorType) || this.stateMap.get("wander")!;

    // 상태 진입
    this.currentState.enter(this.context);
  }

  // 상태 업데이트 및 전환 처리
  update(): MovementStateResult {
    // 현재 상태 업데이트
    const result = this.currentState.update(this.context);

    // 상태 변경 필요 여부 확인
    if (this.currentState.shouldTransition(this.context)) {
      // 다음 상태 얻기
      const nextState = this.currentState.getNextState(this.context);

      // 상태 전환
      this.currentState = nextState;
      this.currentState.enter(this.context);

      // 새 상태에서 즉시 업데이트 결과 얻기
      return this.currentState.update(this.context);
    }

    // 업데이트 결과 반환
    return result;
  }

  // 특정 상태로 강제 전환
  transitionTo(behaviorType: BehaviorType): void {
    if (this.currentState.type === behaviorType) return;

    const nextState = this.stateMap.get(behaviorType);
    if (nextState) {
      this.currentState = nextState;
      this.currentState.enter(this.context);
    }
  }

  // 현재 상태 타입 반환
  getCurrentStateType(): BehaviorType {
    return this.currentState.type;
  }
}
