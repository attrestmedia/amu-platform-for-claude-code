"use client";

import React, { useMemo } from "react";
import type { DirectionType } from "types/game";
import { useJoypadControls } from "hooks/game/input";
import "./Joypad.scss";

/**
 * Joypad 컴포넌트 Props 인터페이스
 */
interface JoypadProps {
  /** 방향 변경 시 호출될 콜백 함수 */
  onKeyboardDirectionChange: (direction: DirectionType) => void;
  /** 컴포넌트 스타일 */
  style?: React.CSSProperties;
  /** 조이패드 크기 (픽셀) */
  size?: number;
}

/**
 * 게임 내 가상 조이스틱 컴포넌트
 * 마우스, 터치, 키보드 입력을 모두 지원합니다.
 */
const Joypad = ({ onKeyboardDirectionChange, style, size = 120 }: JoypadProps) => {
  // 조이패드 컨트롤 훅 사용
  const {
    activeButtons,
    isDragging,
    joypadRef,
    stickRef,
    handleMouseDown,
    handleStickMouseDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleStickTouchStart,
  } = useJoypadControls(onKeyboardDirectionChange);

  // 조이패드 기본 스타일 메모이제이션 (불필요한 리렌더링 방지)
  const joypadBaseStyle = useMemo(
    () => (size ? { width: `${size}px`, height: `${size}px`, opacity: 0.35 } : undefined),
    [size]
  );

  return (
    <div className="joypad__container" style={style}>
      <div
        ref={joypadRef}
        className="joypad__base touch-none select-none overscroll-none"
        style={joypadBaseStyle}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* 조이스틱 가이드 (배경 가이드라인) */}
        <div className="joypad__guide"></div>

        {/* 방향 버튼 (시각적 표시) */}
        <div
          className={`joypad__button joypad__button--up ${
            activeButtons.includes("up") ? "joypad__button--active" : ""
          }`}
        ></div>
        <div
          className={`joypad__button joypad__button--down ${
            activeButtons.includes("down") ? "joypad__button--active" : ""
          }`}
        ></div>
        <div
          className={`joypad__button joypad__button--left ${
            activeButtons.includes("left") ? "joypad__button--active" : ""
          }`}
        ></div>
        <div
          className={`joypad__button joypad__button--right ${
            activeButtons.includes("right") ? "joypad__button--active" : ""
          }`}
        ></div>

        {/* 조이스틱 핸들 */}
        <div
          ref={stickRef}
          className={`joypad__stick ${isDragging ? "joypad__stick--dragging" : ""}`}
          onMouseDown={handleStickMouseDown}
          onTouchStart={handleStickTouchStart}
        ></div>
      </div>
    </div>
  );
};

export default Joypad;
