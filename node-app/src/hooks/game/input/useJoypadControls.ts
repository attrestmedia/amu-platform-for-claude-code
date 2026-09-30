"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { DirectionType } from "types/game";
import { useNpcActionStore, useUiControlStore } from "store/game";

/**
 * @docHint
 * @purpose useJoypadControls 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-input
 * @scope client
 */

interface UseJoypadControlsResult {
  // 상태
  activeButtons: string[];
  isDragging: boolean;

  // 레퍼런스
  joypadRef: React.RefObject<HTMLDivElement | null>;
  stickRef: React.RefObject<HTMLDivElement | null>;
  draggingRef: React.RefObject<boolean>;
  touchIdRef: React.RefObject<number | null>;

  // 이벤트 핸들러
  handleMouseDown: (e: React.MouseEvent) => void;
  handleStickMouseDown: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  handleStickTouchStart: (e: React.TouchEvent) => void;
}

/**
 * 조이패드 컨트롤 로직을 처리하는 커스텀 훅
 *
 * @param onDirectionChange 방향 변경 시 호출될 콜백 함수
 * @returns 조이패드 상태 및 이벤트 핸들러
 */
export const useJoypadControls = (onDirectionChange: (direction: DirectionType) => void): UseJoypadControlsResult => {
  // 상태 관리
  const [activeButtons, setActiveButtons] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Refs
  const joypadRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const touchIdRef = useRef<number | null>(null);

  const isActionOpen = useNpcActionStore((state) => state.isActionOpen); // 다이얼로그 열림 상태
  const isInputLocked = useUiControlStore((state) => state.isInputLocked); // 전역 입력 잠금

  // mousemove/mouseup 전역 리스너 cleanup을 모아두는 ref — handleMouseUp이 자기 자신을 참조하지 않도록 분리.
  const mouseListenerCleanupRef = useRef<(() => void) | null>(null);

  /**
   * 활성화된 버튼 목록에서 방향 계산
   */
  const calculateDirection = useCallback((activeButtonsList: string[]): DirectionType => {
    const hasUp = activeButtonsList.includes("up");
    const hasDown = activeButtonsList.includes("down");
    const hasLeft = activeButtonsList.includes("left");
    const hasRight = activeButtonsList.includes("right");

    if (hasUp && hasLeft) return "up-left";
    if (hasUp && hasRight) return "up-right";
    if (hasDown && hasLeft) return "down-left";
    if (hasDown && hasRight) return "down-right";

    if (hasUp) return "up";
    if (hasDown) return "down";
    if (hasLeft) return "left";
    if (hasRight) return "right";

    return null;
  }, []);

  /**
   * 스틱 드래그 처리 - 좌표 계산 및 스타일 업데이트
   */
  const handleStickDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!joypadRef.current || !stickRef.current) return;

      // 다이얼로그/입력 잠금 시 조이패드 입력 무시
      if (isActionOpen || isInputLocked) return;

      const joypadRect = joypadRef.current.getBoundingClientRect();
      const centerX = joypadRect.left + joypadRect.width / 2;
      const centerY = joypadRect.top + joypadRect.height / 2;

      // 드래그 거리 및 각도 계산
      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const maxDistance = joypadRect.width / 2 - stickRef.current.offsetWidth / 2;
      const actualDistance = Math.min(distance, maxDistance);
      const angle = Math.atan2(deltaY, deltaX);

      // 스틱 위치 계산 및 적용
      const newX = Math.cos(angle) * actualDistance;
      const newY = Math.sin(angle) * actualDistance;
      stickRef.current.style.transform = `translate(${newX}px, ${newY}px)`;

      // 활성화된 버튼 결정
      const activeButtonsList: string[] = [];
      const threshold = maxDistance * 0.3; // 30% 이상 움직여야 방향 감지
      if (Math.abs(deltaY) > threshold) {
        activeButtonsList.push(deltaY < 0 ? "up" : "down");
      }
      if (Math.abs(deltaX) > threshold) {
        activeButtonsList.push(deltaX < 0 ? "left" : "right");
      }

      // 상태 업데이트 및 콜백 호출
      setActiveButtons(activeButtonsList);
      onDirectionChange(calculateDirection(activeButtonsList));
    },
    [calculateDirection, onDirectionChange, isActionOpen, isInputLocked]
  );

  /**
   * 마우스 이동 이벤트 핸들러
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingRef.current) {
        handleStickDrag(e.clientX, e.clientY);
      }
    },
    [handleStickDrag]
  );

  /**
   * 마우스 업 이벤트 핸들러 — 자기 자신 참조 회피용으로 cleanup은 ref에 저장된 함수로 실행한다.
   */
  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
    setIsDragging(false);

    // 스틱 위치 초기화
    if (stickRef.current) {
      stickRef.current.style.transform = "translate(0px, 0px)";
    }

    // 모든 버튼 비활성화
    setActiveButtons([]);
    onDirectionChange(null);

    // 이벤트 리스너 제거 — handleMouseUp을 직접 참조하지 않고 cleanup ref 호출
    mouseListenerCleanupRef.current?.();
    mouseListenerCleanupRef.current = null;
  }, [onDirectionChange]);

  // 전역 mousemove/mouseup 리스너 부착 + cleanup 등록. handleMouseDown/handleStickMouseDown에서 재사용.
  const attachGlobalMouseListeners = useCallback(() => {
    // 기존 리스너가 있으면 먼저 제거
    mouseListenerCleanupRef.current?.();
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    mouseListenerCleanupRef.current = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  /**
   * 베이스 영역 마우스 다운 이벤트 핸들러
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (joypadRef.current && joypadRef.current.contains(e.target as Node)) {
        draggingRef.current = true;
        setIsDragging(true);
        handleStickDrag(e.clientX, e.clientY);
        attachGlobalMouseListeners();
      }
    },
    [handleStickDrag, attachGlobalMouseListeners]
  );

  /**
   * 스틱 직접 마우스 다운 이벤트 핸들러
   */
  const handleStickMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation(); // 베이스 이벤트와 중복 방지
      draggingRef.current = true;
      setIsDragging(true);
      handleStickDrag(e.clientX, e.clientY);
      attachGlobalMouseListeners();
    },
    [handleStickDrag, attachGlobalMouseListeners]
  );

  /**
   * 터치 시작 이벤트 핸들러
   */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      const target = touch.target as Node;
      if (joypadRef.current && (joypadRef.current === target || joypadRef.current.contains(target))) {
        touchIdRef.current = touch.identifier;
        draggingRef.current = true;
        setIsDragging(true);
        handleStickDrag(touch.clientX, touch.clientY);
      }
    },
    [handleStickDrag]
  );

  /**
   * 터치 이동 이벤트 핸들러
   */
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      // 현재 추적 중인 터치 식별
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === touchIdRef.current) {
          handleStickDrag(touch.clientX, touch.clientY);
          break;
        }
      }
    },
    [handleStickDrag]
  );

  /**
   * 터치 종료 이벤트 핸들러
   */
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let touchEnded = true;

      // 추적 중인 터치가 아직 남아있는지 확인
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchIdRef.current) {
          touchEnded = false;
          break;
        }
      }

      if (touchEnded) {
        draggingRef.current = false;
        setIsDragging(false);
        touchIdRef.current = null;

        // 스틱 위치 초기화
        if (stickRef.current) {
          stickRef.current.style.transform = "translate(0px, 0px)";
        }

        // 모든 버튼 비활성화
        setActiveButtons([]);
        onDirectionChange(null);
      }
    },
    [onDirectionChange]
  );

  /**
   * 스틱 직접 터치 시작 이벤트 핸들러
   */
  const handleStickTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      touchIdRef.current = touch.identifier;
      draggingRef.current = true;
      setIsDragging(true);
      handleStickDrag(touch.clientX, touch.clientY);
    },
    [handleStickDrag]
  );

  /**
   * 키보드 이벤트 처리
   */
  useEffect(() => {
    const pressedKeys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    /**
     * 활성화된 키를 기반으로 유효한 방향 계산
     */
    const getEffectiveDirection = (): DirectionType => {
      const activeButtonsList: string[] = [];
      if (pressedKeys.up) activeButtonsList.push("up");
      if (pressedKeys.down) activeButtonsList.push("down");
      if (pressedKeys.left) activeButtonsList.push("left");
      if (pressedKeys.right) activeButtonsList.push("right");
      return calculateDirection(activeButtonsList);
    };

    /**
     * 키 다운 이벤트 핸들러
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      // 다이얼로그 or 입력 잠금 중이면 게임 입력 무시
      if (isActionOpen || isInputLocked) return;

      if (e.repeat) return; // 키 반복 무시

      let keyHandled = false;

      switch (e.key) {
        case "ArrowUp":
          pressedKeys.up = true;
          keyHandled = true;
          break;
        case "ArrowDown":
          pressedKeys.down = true;
          keyHandled = true;
          break;
        case "ArrowLeft":
          pressedKeys.left = true;
          keyHandled = true;
          break;
        case "ArrowRight":
          pressedKeys.right = true;
          keyHandled = true;
          break;
      }

      if (keyHandled) {
        e.preventDefault();
        const newDirection = getEffectiveDirection();
        onDirectionChange(newDirection);
      }
    };

    /**
     * 키 업 이벤트 핸들러
     */
    const handleKeyUp = (e: KeyboardEvent) => {
      // 다이얼로그가 열려있을 때는 게임 캐릭터 움직임에 영향을 주지 않음
      if (isActionOpen) return;

      let keyHandled = false;

      switch (e.key) {
        case "ArrowUp":
          pressedKeys.up = false;
          keyHandled = true;
          break;
        case "ArrowDown":
          pressedKeys.down = false;
          keyHandled = true;
          break;
        case "ArrowLeft":
          pressedKeys.left = false;
          keyHandled = true;
          break;
        case "ArrowRight":
          pressedKeys.right = false;
          keyHandled = true;
          break;
      }

      if (keyHandled) {
        const newDirection = getEffectiveDirection();
        onDirectionChange(newDirection);
      }
    };

    // 이벤트 리스너 등록
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // 컴포넌트 언마운트 시 정리
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [calculateDirection, onDirectionChange, isActionOpen, isInputLocked]);

  // 마운트 해제 시 전역 이벤트 리스너 정리 — cleanup ref 호출로 명시적 함수 참조 회피
  useEffect(() => {
    return () => {
      mouseListenerCleanupRef.current?.();
      mouseListenerCleanupRef.current = null;
    };
  }, []);

  return {
    // 상태
    activeButtons,
    isDragging,

    // 레퍼런스
    joypadRef,
    stickRef,
    draggingRef,
    touchIdRef,

    // 이벤트 핸들러
    handleMouseDown,
    handleStickMouseDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleStickTouchStart,
  };
};

export default useJoypadControls;
