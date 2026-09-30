/**
 * @docHint
 * @purpose themeUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain theme
 * @scope client
 */

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "amu-theme";
const ATTR_KEY = "data-theme";

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

export function getStoredThemeMode(): ThemeMode {
  if (!isBrowser()) return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

// 현재 적용 중인 모드
export function getThemeMode(): ThemeMode {
  if (!isBrowser()) return "system";
  const v = document.documentElement.getAttribute(ATTR_KEY);
  if (v === "light" || v === "dark") return v;
  return "system";
}

// system일 때 실제 적용되는 테마(light/dark) 반환
export function getResolvedTheme(): ResolvedTheme {
  if (!isBrowser()) return "light";
  const forced = document.documentElement.getAttribute(ATTR_KEY);
  if (forced === "light" || forced === "dark") return forced;

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  return prefersDark ? "dark" : "light";
}

// DOM에 테마 모드 적용
export function applyThemeMode(mode: ThemeMode) {
  if (!isBrowser()) return;

  const root = document.documentElement;

  if (mode === "light" || mode === "dark") {
    root.setAttribute(ATTR_KEY, mode);
  } else {
    root.removeAttribute(ATTR_KEY); // system
  }
}

// 테마 모드 저장 + DOM 적용
export function setThemeMode(mode: ThemeMode) {
  if (!isBrowser()) return;

  if (mode === "system") {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }

  applyThemeMode(mode);
}

// 앱 내부(설정 화면 등)에서 최초 로드/재적용 시 사용
export function initThemeFromStorage(): ThemeMode {
  const mode = getStoredThemeMode();
  applyThemeMode(mode);
  return mode;
}

// system 모드일 때 OS 테마 변경을 감지하고 콜백 호출
export function subscribeSystemThemeChange(onChange: (resolved: ResolvedTheme) => void) {
  if (!isBrowser()) return () => {};

  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq) return () => {};

  const handler = () => {
    // 강제 모드면 시스템 변경 이벤트를 무시
    if (getThemeMode() !== "system") return;
    onChange(getResolvedTheme());
  };

  // 구형 이벤트명까지는 지원 계획이 없다 했으니 addEventListener만 사용
  mq.addEventListener("change", handler);

  return () => {
    mq.removeEventListener("change", handler);
  };
}

// data-theme 속성 변경, system 테마 변경, 다른 탭의 저장소 변경을 한 번에 추적
export function subscribeThemeChange(onChange: (resolved: ResolvedTheme) => void) {
  if (!isBrowser()) return () => {};

  const root = document.documentElement;
  const handleChange = () => {
    onChange(getResolvedTheme());
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === ATTR_KEY) {
        handleChange();
        break;
      }
    }
  });

  observer.observe(root, {
    attributes: true,
    attributeFilter: [ATTR_KEY],
  });

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    handleChange();
  };

  window.addEventListener("storage", handleStorage);

  const unsubscribeSystemTheme = subscribeSystemThemeChange(handleChange);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", handleStorage);
    unsubscribeSystemTheme();
  };
}
