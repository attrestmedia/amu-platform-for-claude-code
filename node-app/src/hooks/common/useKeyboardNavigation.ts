"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useUiControlStore } from "store/game/uiControlStore";

/**
 * @docHint
 * @purpose useKeyboardNavigation 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain ui-a11y
 * @scope client
 */

interface NavigationOptions {
  isOpen: boolean; // 다이얼로그나 메뉴가 열려있는지 여부
  refs: React.RefObject<HTMLElement | null>[]; // 버튼 레퍼런스 배열. 좌우 또는 상하 방향으로 정렬된 버튼 레퍼런스들
  direction?: "horizontal" | "vertical" | "grid"; // 네비게이션 방향 (horizontal 또는 vertical)
  columnCount?: number; // 그리드 레이아웃일 경우 열의 수
  onFocusChange?: (index: number) => void; // 포커스 변경 시 실행할 함수
  onEnterActions?: (() => void)[]; // 엔터 키 누를 때 실행할 함수들. 인덱스별로 정의
  autoFocusDelay?: number; // 자동 포커스 시간(ms). 기본값은 100ms
  initialFocusIndex?: number; // 초기 포커스 인덱스. 기본값은 0
  useCapture?: boolean; // 캡처 단계에서 리스너 실행
  stopPropagation?: boolean; // 다이얼로그 오픈 중에는 전파 차단
}

// 키보드 방향키를 사용하여 버튼이나 요소들 사이 네비게이션
// 다이얼로그, 메뉴, 폼 등에서 키보드 접근성 향상
export const useKeyboardNavigation = ({
  isOpen,
  refs,
  direction = "horizontal",
  columnCount = 1,
  onFocusChange,
  onEnterActions,
  autoFocusDelay = 100,
  initialFocusIndex = 0,
  useCapture = false,
  stopPropagation = false,
}: NavigationOptions) => {
  // 현재 포커스된 요소 인덱스
  const [focusedIndex, setFocusedIndex] = useState(initialFocusIndex);
  const isInputLocked = useUiControlStore((s) => s.isInputLocked);

  // 컴포넌트가 마운트/열렸는지 여부 추적
  const isOpenedRef = useRef<boolean>(false);

  // 포커스 변경 처리 함수 — deps 추적 가능하도록 useCallback으로 메모이즈
  const changeFocus = useCallback(
    (newIndex: number) => {
      if (newIndex >= 0 && newIndex < refs.length) {
        setFocusedIndex(newIndex);
        refs[newIndex]?.current?.focus();
        onFocusChange?.(newIndex);
      }
    },
    [refs, onFocusChange],
  );

  // 키보드 이벤트 처리
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // input이나 textarea에 포커스가 있을 때는 키 이벤트를 가로채지 않음
      const activeElement = document.activeElement;
      const isInputActive = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

      if (isInputActive || isInputLocked) {
        return; // 입력 필드에 포커스가 있으면 이벤트 처리하지 않음
      }

      let newIndex = focusedIndex;
      let handled = false;

      if (direction === "horizontal" || direction === "grid") {
        if (e.key === "ArrowLeft") {
          newIndex = Math.max(0, focusedIndex - 1);
          e.preventDefault();
          handled = true;
        } else if (e.key === "ArrowRight") {
          newIndex = Math.min(refs.length - 1, focusedIndex + 1);
          e.preventDefault();
          handled = true;
        }
      }

      if (direction === "vertical" || direction === "grid") {
        // 상/하 방향키 처리
        if (e.key === "ArrowUp") {
          if (direction === "grid") {
            // 그리드 레이아웃에서는 한 행 위로 이동
            newIndex = Math.max(0, focusedIndex - columnCount);
          } else {
            newIndex = Math.max(0, focusedIndex - 1);
          }
          e.preventDefault();
          handled = true;
        } else if (e.key === "ArrowDown") {
          if (direction === "grid") {
            // 그리드 레이아웃에서는 한 행 아래로 이동
            newIndex = Math.min(refs.length - 1, focusedIndex + columnCount);
          } else {
            newIndex = Math.min(refs.length - 1, focusedIndex + 1);
          }
          e.preventDefault();
          handled = true;
        }
      }

      // 엔터 키 처리
      if (e.key === "Enter" || e.key === " ") {
        if (onEnterActions && onEnterActions[focusedIndex]) {
          onEnterActions[focusedIndex]();
          e.preventDefault();
          handled = true;
        }
      }

      // 포커스 변경이 있을 경우만 처리
      if (newIndex !== focusedIndex) {
        changeFocus(newIndex);
      }

      // 실제 전파 차단
      if (handled && stopPropagation) {
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
      }
    };

    // 이벤트 리스너 등록(캡처 옵션으로 등록/해제)
    window.addEventListener("keydown", handleKeyDown, useCapture);
    return () => window.removeEventListener("keydown", handleKeyDown, useCapture);
  }, [
    isOpen,
    focusedIndex,
    refs.length,
    direction,
    columnCount,
    onEnterActions,
    useCapture,
    isInputLocked,
    stopPropagation,
    changeFocus,
  ]);

  // 자동 포커스 설정
  useEffect(() => {
    if (isOpen && !isOpenedRef.current && refs.length > 0) {
      isOpenedRef.current = true;

      const tryFocus = (retries = 2) => {
        const timer = setTimeout(() => {
          changeFocus(initialFocusIndex);
          // 버튼 ref가 아직 null이면 한 번 더 시도
          if (!refs[initialFocusIndex]?.current && retries > 0) {
            tryFocus(retries - 1);
          }
        }, autoFocusDelay);

        return () => clearTimeout(timer);
      };

      const cleanup = tryFocus(2);
      return cleanup;
    } else if (!isOpen) {
      isOpenedRef.current = false;
    }
  }, [isOpen, refs, initialFocusIndex, autoFocusDelay, changeFocus]);

  return {
    focusedIndex,
    setFocusedIndex: changeFocus,
  };
};

export default useKeyboardNavigation;
