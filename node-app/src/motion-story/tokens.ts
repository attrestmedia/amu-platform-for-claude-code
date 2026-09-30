/**
 * AMU Motion Design Tokens — `motion-tokens.v1` (단일 소스)
 *
 * 설계 근거: `.agent/references/NODE_APP/signature_interaction_and_interactive_motion/
 *   20260929_065533__motion-story-runtime-design-and-implementation-plan.md` §4.2
 *
 * - React(node-app)·vanilla(WordPress)·영상 export 가 모두 이 값을 쓴다.
 * - 수치는 설계 문서의 **초안값**이다. readingPace 는 파일럿 완주율·이탈 지점으로 보정한다.
 * - 애니메이션 채널은 opacity · transform · clip-path (+ 밑줄용 background-size) 로 제한한다
 *   (visual-runtime §3: width/height/top/left 금지).
 */

export const MOTION_TOKENS_VERSION = "motion-tokens.v1" as const;

export type CubicBezier = readonly [number, number, number, number];

export const MOTION_TOKENS = {
  version: MOTION_TOKENS_VERSION,
  duration: {
    fast: 160,
    base: 240,
    slow: 420,
    line: 520,
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.3, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
    linear: [0, 0, 1, 1],
  },
  stagger: {
    line: 380,
    word: 90,
  },
  readingPace: {
    koCharsPerSecond: 9,
    minLineMs: 1400,
  },
  scene: {
    /** 배경만 보이는 구간 (PREROLL) */
    preRollMs: 360,
    /** 마지막 상태 유지 (FINAL BEAT HOLD) */
    holdMs: 1200,
    minDurationMs: 2400,
    maxDurationMs: 12_000,
    maxLines: 4,
  },
  card: {
    /** homeCard·archiveCard: sceneIds 1~2개, durationMs + holdMs 합계 상한 (루프 피로 방지) */
    maxScenes: 2,
    maxLoopMs: 8000,
    /** 2회 루프 후 마지막 프레임에서 정지 */
    loops: 2,
    /** IntersectionObserver 가시 비율 — 가장 많이 보이는 카드 1장만 재생 */
    activeRatio: 0.6,
    /** 노출 계측: 60% 이상 1초 */
    impressionMs: 1000,
  },
  short: {
    maxDurationMs: 45_000,
  },
  a11y: {
    /** 자동으로 움직이는 콘텐츠가 이 시간을 넘으면 일시정지 컨트롤 필수 (WCAG 2.2.2) */
    pauseControlRequiredAfterMs: 5000,
    /** 뷰당 동시에 움직이는 요소 상한 */
    maxConcurrentMotion: 2,
  },
} as const;

export type MotionTokens = typeof MOTION_TOKENS;
export type MotionDurationToken = keyof MotionTokens["duration"];
export type MotionEasingToken = keyof MotionTokens["easing"];

export function cubicBezierCss(curve: CubicBezier): string {
  if (curve[0] === 0 && curve[1] === 0 && curve[2] === 1 && curve[3] === 1) return "linear";
  return `cubic-bezier(${curve.join(", ")})`;
}
