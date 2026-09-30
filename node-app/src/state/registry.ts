import type { INpcState } from "./NpcState";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game.npc.behavior
 * @scope module
 */

// 상태 생성자 타입
export type StateCtor<T extends INpcState = INpcState> = new () => T;

// 전역 상태 레지스트리 (필요한 상태만 등록)
export const StateRegistry = {
  Follow: null as unknown as StateCtor,
  Wander: null as unknown as StateCtor,
};
