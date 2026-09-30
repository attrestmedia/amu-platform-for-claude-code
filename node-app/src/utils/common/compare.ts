import React from "react";

/**
 * @docHint
 * @purpose compare 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ui
 * @scope shared
 */

// 클라이언트 체크
export const isClient = (() => {
  return typeof window === "object" && !!window.document;
})();

// 서버 체크
export const isServer = !isClient;

// 개발 환경 체크
export const isDev = process.env.NODE_ENV === "development";

// 제품 환경 체크
export const isProduct = process.env.NODE_ENV === "production";

// 동일 컴포넌트 체크
export const isSameComponent = <T>(
  source: React.ReactNode | React.ReactPortal,
  target: React.Component<T> | React.FunctionComponent<T>,
): source is React.ReactElement<T> => {
  if (!React.isValidElement(source)) {
    return false;
  }

  if (source?.type === target) {
    return true;
  }

  return false;
};

// 모바일 디바이스 체크 (User Agent 기반)
export const isMobile = (() => {
  if (!isClient) return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    "mobile",
    "android",
    "iphone",
    "ipod",
    "blackberry",
    "windows phone",
    "opera mini",
    "iemobile",
  ];

  return mobileKeywords.some((keyword) => userAgent.includes(keyword));
})();

// 태블릿 디바이스 체크 (User Agent 기반)
export const isTablet = (() => {
  if (!isClient) return false;

  const userAgent = navigator.userAgent.toLowerCase();
  return /tablet|ipad|playbook|silk/.test(userAgent) && !isMobile;
})();

// IE10/구형 Edge 호환을 위해 표준 외 속성 노출. 표준 타입에 없으므로 좁힌 인터페이스로 캐스트.
type NavigatorWithLegacyTouch = Navigator & { msMaxTouchPoints?: number };

// 터치 디바이스 체크
export const isTouchDevice = (() => {
  if (!isClient) return false;

  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    ((navigator as NavigatorWithLegacyTouch).msMaxTouchPoints ?? 0) > 0
  );
})();

// 모바일 화면 크기 체크 (640px 이하)
const maxPhoneScreen = 640;
const maxTabletScreen = 1024;
export const isMobileScreen = () => {
  if (!isClient) return false;
  return window.innerWidth <= maxPhoneScreen;
};

// 태블릿 화면 크기 체크 (768px ~ 1024px)
export const isTabletScreen = () => {
  if (!isClient) return false;
  const width = window.innerWidth;
  return width > maxPhoneScreen && width <= maxTabletScreen;
};

// 데스크톱 화면 크기 체크 (1024px 초과)
export const isDesktopScreen = () => {
  if (!isClient) return false;
  return window.innerWidth > maxTabletScreen;
};

// 종합적인 모바일 환경 체크
// - UA가 모바일/태블릿이거나, 터치 디바이스면 모바일 환경으로 판단
export const isMobileEnvironment = () => {
  return isMobile || isTablet || isTouchDevice;
};

// 모바일 브라우저/웹뷰가 capture 입력을 지원하는지 확인한다.
export const supportsCameraCaptureInput = () => {
  if (!isClient) return false;

  const input = document.createElement("input");
  input.type = "file";
  return "capture" in input;
};

// Tailwind breakpoint(min-width) 기준: sm(640) / md(768) / lg(1024) / xl(1280) / 2xl(1536)
type TailwindBreakpointType = "sm" | "md" | "lg" | "xl" | "2xl";

const TAILWIND_BREAKPOINT_MIN_WIDTH: Record<Exclude<TailwindBreakpointType, "base">, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

// Tailwind 기준으로 현재 화면(width)에 해당하는 breakpoint 반환
export const getCurrentBreakpoint = (width?: number): TailwindBreakpointType => {
  const w = typeof width === "number" ? width : isClient ? window.innerWidth : 0;

  if (w >= TAILWIND_BREAKPOINT_MIN_WIDTH["2xl"]) return "2xl";
  if (w >= TAILWIND_BREAKPOINT_MIN_WIDTH.xl) return "xl";
  if (w >= TAILWIND_BREAKPOINT_MIN_WIDTH.lg) return "lg";
  if (w >= TAILWIND_BREAKPOINT_MIN_WIDTH.md) return "md";
  if (w >= TAILWIND_BREAKPOINT_MIN_WIDTH.sm) return "sm";
  return "sm";
};
