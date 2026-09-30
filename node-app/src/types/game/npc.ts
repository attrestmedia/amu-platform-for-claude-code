import type { DirectionFacingType } from "./stage";
import type { BehaviorType } from "./stage";
import type { IPersona, IPersonaAbility } from "../ai";
import type { LogicalWorldPoint } from "./coordinates";

// NPC 행동 패턴
export interface INpcBehavior {
  type: BehaviorType;
  params?: {
    pathPoints?: { x: number; y: number }[];
    logicalPathPoints?: LogicalWorldPoint[];
    targetDistance?: number;
    wanderRadius?: number;
    changeDirectionProbability?: number;
    speed?: number;
    pauseDuration?: number;
    moveDuration?: number;
  };
}

// 페르소나 기반 확장 NPC 데이터 (캐릭터 카드/표시용)
// - Persona DB(toClientPersona) 스냅샷 연동 구조
export interface IExtendedNpcData extends IPersona {
  ability?: IPersonaAbility; // NPC 전용 능력치
  extra?: Record<string, unknown>;
}

// 게임 내 NPC 인스턴스
// - 스테이지 위치, 방향 등 런타임 정보 포함
export interface INpcInterface {
  id: string; // 스테이지 내 고유 인스턴스 ID
  persona: IExtendedNpcData; // Persona DB 스냅샷
  displayName?: string; // 표시 이름
  behavior?: INpcBehavior; // 기본 행동 패턴
  direction?: DirectionFacingType;
  logicalPosition: LogicalWorldPoint;
}

// NPC 움직임 상태
export interface INpcMovementState {
  dx: number;
  dy: number;
  baseY: number;
  remainingSteps: number;
  pauseSteps: number;
  behavior: INpcBehavior;
  currentPathIndex?: number;
  targetX?: number;
  targetY?: number;
}

// v2 논리 좌표에 배치된 NPC 런타임 스냅샷
export interface IGlobalNpcData {
  id: string;
  info: INpcInterface;
  logicalPosition: LogicalWorldPoint;
}

// 스테이지에서 NPC 상호작용에 넘길 수 있는 타입 통합
export type NpcActionType = INpcInterface | IGlobalNpcData | IExtendedNpcData;

// NpcActionType 공통 식별용 인터페이스
export interface INpcIdentity {
  id: string; // 스테이지 인스턴스 ID 또는 pid fallback
  pid: string;
  displayName: string;
  persona: IExtendedNpcData;
}
