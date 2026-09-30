import { Sprite } from "pixi.js";
import type { NpcSpriteType, BehaviorType } from "types/game";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game.npc.behavior
 * @scope module
 */

// 상태 전환 결과 인터페이스
export interface MovementStateResult {
  dx: number;
  dy: number;
  remainingSteps: number;
  pauseSteps: number;
  currentPathIndex?: number;
  targetX?: number;
  targetY?: number;
}

// NPC 상태 컨텍스트 인터페이스
export interface NpcStateContext {
  npc: NpcSpriteType;
  protagonist: Sprite | null;
  stageWidth: number;
  stageHeight: number;
  npcSize: number;
  userSize: number;
  movementStep: number;
  baseY: number;
  behaviorParams: {
    wanderRadius?: number;
    targetDistance?: number;
    pathPoints?: Array<{ x: number; y: number }>;
    changeDirectionProbability?: number;
    speed?: number;
    pauseDuration?: number;
    moveDuration?: number;
  };
  currentState: {
    dx: number;
    dy: number;
    remainingSteps: number;
    pauseSteps: number;
    currentPathIndex?: number;
  };
}

// 기본 NPC 상태 인터페이스
export interface INpcState {
  type: BehaviorType;
  enter(context: NpcStateContext): void;
  update(context: NpcStateContext): MovementStateResult;
  shouldTransition(context: NpcStateContext): boolean;
  getNextState(context: NpcStateContext): INpcState;
}

// 기본 NPC 상태 추상 클래스
export abstract class NpcState implements INpcState {
  abstract type: BehaviorType;

  enter(_context: NpcStateContext): void {}

  abstract update(context: NpcStateContext): MovementStateResult;

  shouldTransition(_context: NpcStateContext): boolean {
    return false;
  }

  getNextState(_context: NpcStateContext): INpcState {
    return this;
  }

  protected getRandomAngle(): number {
    return Math.random() * Math.PI * 2;
  }

  protected calculateSpeed(context: NpcStateContext): number {
    return (context.behaviorParams.speed || 1) * context.movementStep;
  }
}
