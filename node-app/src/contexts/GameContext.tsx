"use client";

import React, { createContext, useContext, useReducer } from "react";
import type { ReactNode } from "react";
import type { DirectionType } from "types/game";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain game
 * @scope client-context
 */

// 게임 상태 타입 정의
interface GameState {
  stageSize: {
    width: number;
    height: number;
  };
  direction: {
    keyboard: DirectionType;
  };
  isInitialized: boolean;
  needsMapUpdate: boolean;
  isResizing: boolean;
}

// 초기 상태
const initialState: GameState = {
  stageSize: {
    width: 600,
    height: 800,
  },
  direction: {
    keyboard: null,
  },
  isInitialized: false,
  needsMapUpdate: false,
  isResizing: false,
};

// 액션 타입 정의
type GameAction =
  | { type: "SET_STAGE_SIZE"; payload: { width: number; height: number } }
  | { type: "SET_KEYBOARD_DIRECTION"; payload: DirectionType }
  | { type: "SET_INITIALIZED"; payload: boolean }
  | { type: "SET_NEEDS_MAP_UPDATE"; payload: boolean }
  | { type: "SET_RESIZING"; payload: boolean };

// 리듀서 함수
function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_STAGE_SIZE":
      return { ...state, stageSize: action.payload };
    case "SET_KEYBOARD_DIRECTION":
      if (state.direction.keyboard === action.payload) return state;
      return { ...state, direction: { ...state.direction, keyboard: action.payload } };
    case "SET_INITIALIZED":
      return { ...state, isInitialized: action.payload };
    case "SET_NEEDS_MAP_UPDATE":
      return { ...state, needsMapUpdate: action.payload };
    case "SET_RESIZING":
      return { ...state, isResizing: action.payload };
    default:
      return state;
  }
}

// 컨텍스트 생성
type GameContextType = {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
};

const GameContext = createContext<GameContextType | undefined>(undefined);

// 컨텍스트 프로바이더 컴포넌트
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>;
}

// 커스텀 훅
export function useGameContext() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGameContext must be used within a GameProvider");
  }
  return context;
}
