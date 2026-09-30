/**
 * AMU Text Motion — 공통 타입
 *
 * 모든 프리셋은 이 파일의 타입만으로 "데이터"로 정의되고,
 * 분할·타이밍·샘플링·스타일 합성·DOM 적용은 core 공통 엔진이 단일 경로로 처리한다.
 */

/** 텍스트 분할 단위 */
export type TextSplit = 'char' | 'word' | 'line' | 'whole';

/** 스태거 순서 */
export type StaggerFrom = 'start' | 'end' | 'center' | 'edges' | 'random';

/** AMU Motion Design System 분류 (motion-content-ui-system.md: Entrance / Emphasis / Exit) */
export type TextMotionCategory =
  | 'entrance' // 등장
  | 'emphasis' // 강조 (등장과 동시에 강조 동작)
  | 'exit' // 퇴장
  | 'transient' // 등장 후 스스로 사라짐 (credits, anti-gravity 등)
  | 'reveal'; // 글자 내용 자체가 변하는 절차적 등장 (typewriter, decode 등)

export type TextMotionTag =
  | 'basic'
  | 'slide'
  | 'scale'
  | 'rotate'
  | '3d'
  | 'blur'
  | 'glow'
  | 'bounce'
  | 'elastic'
  | 'playful'
  | 'tech'
  | 'elegant'
  | 'dramatic'
  | 'spacing'
  | 'outline'
  | 'shadow';

/** 길이 값: number = px, 문자열은 % 또는 em */
export type MotionLength = number | `${number}%` | `${number}em`;

export type CubicBezier = readonly [number, number, number, number];

export type NamedEasing =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'amu-standard'
  | 'amu-emphasized'
  | 'amu-decelerate'
  | 'amu-accelerate'
  | 'amu-anticipate'
  | 'amu-expo';

export type MotionEasing = NamedEasing | CubicBezier;

/**
 * 키프레임 1개. CSS @keyframes 와 같은 의미론을 따른다.
 * - transform / filter / text-shadow 채널은 "속성 그룹" 단위로 해석한다.
 *   (그룹 채널 중 하나라도 지정된 프레임에서, 지정되지 않은 같은 그룹 채널은 중립값)
 * - 그 외 채널은 지정된 프레임들 사이에서 독립 보간한다.
 * - easing 은 이 프레임에서 시작하는 구간에 적용된다 (CSS animation-timing-function 의미론).
 */
export interface MotionKeyframe {
  offset: number;
  easing?: MotionEasing;

  opacity?: number;
  /** letter-spacing 증분 (em). 기준 트래킹 --amu-text-motion-tracking 에 더해진다 */
  letterSpacing?: number;
  /** 글자 채움 불투명도 0..1 (-webkit-text-fill-color) */
  fill?: number;
  /** 외곽선 두께 px (-webkit-text-stroke) */
  stroke?: number;

  // transform 그룹
  x?: MotionLength;
  y?: MotionLength;
  z?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  rotateX?: number;
  rotateY?: number;
  /** (1,1,1) 축 기준 회전 (deg) */
  rotateXYZ?: number;
  skewX?: number;
  skewY?: number;

  // filter 그룹
  blur?: number;

  // text-shadow 그룹
  /** 발광 반경 px */
  glowSize?: number;
  /** 발광 강도 0..1 */
  glowAlpha?: number;
  /** 네온 강도 0..1 (accent 색 3중 발광) */
  neon?: number;
  /** RGB 분리 거리 px */
  rgbSplit?: number;
  /** 하단 그림자 y 오프셋 px */
  shadowY?: number;
  /** 하단 그림자 blur px */
  shadowBlur?: number;
  /** 하단 그림자 강도 0..1 */
  shadowAlpha?: number;
  /** 입체 돌출 깊이 px (4겹 레이어) */
  extrude?: number;
}

export type MotionChannel = Exclude<keyof MotionKeyframe, 'offset' | 'easing'>;

/** 모든 프리셋 공통 메타 */
interface TextMotionPresetBase {
  id: string;
  /** amu_text_motion_library.md 의 원본 번호 */
  legacyIds: readonly number[];
  name: string;
  /** 한국어 설명 (AI 프롬프트/스튜디오 UI 노출용) */
  description: string;
  category: TextMotionCategory;
  tags: readonly TextMotionTag[];
  defaultSplit: TextSplit;
  /** 단위 1개의 애니메이션 길이 (절차형은 프리셋별 의미) */
  durationMs: number;
  /** 단위 간 간격 */
  staggerMs: number;
  easing: MotionEasing;
}

/** 키프레임 보간형 프리셋 (원본 100개 중 93개) */
export interface KeyframeTextMotionPreset extends TextMotionPresetBase {
  kind: 'keyframes';
  frames: readonly MotionKeyframe[];
  /** transform 에 prepend 되는 perspective (px) */
  perspective?: number;
  transformOrigin?: string;
  /** 시작 전 숨김 여부. 기본 true (exit 계열은 false) */
  hiddenBeforeStart?: boolean;
}

/** 글자 단위 순차 노출 (typewriter / terminal) */
export interface TypeTextMotionPreset extends TextMotionPresetBase {
  kind: 'type';
  cursor: boolean;
  cursorBlinkMs: number;
}

/** 무작위 글리프 → 원문 수렴 (shuffle / binary decode) */
export interface ScrambleTextMotionPreset extends TextMotionPresetBase {
  kind: 'scramble';
  charset: string;
  /** 스크램블 글리프가 바뀌는 간격 (ms). durationMs = frameMs * scrambleFrames */
  frameMs: number;
  scrambleFrames: number;
}

/** 무작위 순서로 즉시 노출 */
export interface ShuffleOrderTextMotionPreset extends TextMotionPresetBase {
  kind: 'shuffle-order';
}

/** 블록이 덮었다 걷히며 노출 */
export interface BlockTextMotionPreset extends TextMotionPresetBase {
  kind: 'block';
}

/** 하이라이트가 훑고 지나가며 노출 */
export interface SweepTextMotionPreset extends TextMotionPresetBase {
  kind: 'sweep';
}

export type TextMotionPreset =
  | KeyframeTextMotionPreset
  | TypeTextMotionPreset
  | ScrambleTextMotionPreset
  | ShuffleOrderTextMotionPreset
  | BlockTextMotionPreset
  | SweepTextMotionPreset;

export type TextMotionKind = TextMotionPreset['kind'];

/** CSS 속성명(kebab-case) → 값 */
export type MotionStyle = Record<string, string>;

export interface TextMotionUnitFrame {
  style: MotionStyle;
  /** 절차형 프리셋이 표시 텍스트를 바꿀 때 */
  text?: string;
}

/** 특정 시점의 전체 상태. 모든 렌더 경로(웹/영상)는 이 값만 적용한다. */
export interface TextMotionFrame {
  units: TextMotionUnitFrame[];
  /** block 프리셋의 덮개 */
  overlay?: MotionStyle;
  /** type 프리셋의 커서 */
  cursor?: MotionStyle;
  /** 현재 시점 (루프 적용 후, ms) */
  timeMs: number;
  done: boolean;
}

/**
 * 웹 인터랙션 입력 (motion-content-ui-system.md 의 MotionContext).
 * render 모드는 timer 를 쓰지 않고 외부에서 준 시간으로만 그린다.
 */
export interface MotionContext {
  progress: number;
  mode: 'interactive' | 'render';
}
