import type { MotionStyle } from './types';

/**
 * 모든 어댑터(React / DOM / 영상 렌더)가 공유하는 정적 마크업 스타일.
 * 동적 스타일(sampleTextMotion 결과)은 이 위에 덮어쓴다.
 */

export const TEXT_MOTION_DATA_ATTR = {
  root: 'data-amu-text-motion',
  unit: 'data-amu-tm-unit',
  overlay: 'data-amu-tm-overlay',
  cursor: 'data-amu-tm-cursor',
} as const;

export const ROOT_STYLE: MotionStyle = {
  position: 'relative',
};

/** 화면에는 안 보이고 스크린리더만 읽는 원문 */
export const SR_ONLY_STYLE: MotionStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  'white-space': 'nowrap',
  border: '0',
};

/** 단어 그룹: 글자 분할 시에도 줄바꿈은 단어 경계에서만 */
export const WORD_STYLE: MotionStyle = {
  display: 'inline-block',
  'white-space': 'nowrap',
};

export const unitDisplay = (space: boolean) => (space ? 'inline' : 'inline-block');

export function unitBaseStyle(space: boolean): MotionStyle {
  return {
    display: unitDisplay(space),
    'white-space': space ? 'pre-wrap' : 'pre-line',
    'backface-visibility': 'hidden',
  };
}

export const OVERLAY_BASE_STYLE: MotionStyle = {
  position: 'absolute',
  inset: '0',
  'background-color': 'currentColor',
  'pointer-events': 'none',
};

export const CURSOR_BASE_STYLE: MotionStyle = {
  display: 'inline-block',
  width: '0.2em',
  height: '1.1em',
  'margin-left': '0.08em',
  'vertical-align': 'middle',
  'background-color': 'currentColor',
};

/** kebab-case CSS → React style 키 (-webkit-x → WebkitX) */
export function toReactStyle(style: MotionStyle): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(style)) {
    const camel = key.replace(/^-(webkit|moz|ms)-/, (_, v: string) => `${v.charAt(0).toUpperCase()}${v.slice(1)}-`)
      .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out;
}
