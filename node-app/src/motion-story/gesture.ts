/**
 * AMU Signature Interaction — 제스처 컨트롤러.
 *
 * 구조: 순수 상태 머신 `reduceGesture(state, event, config)` + DOM 바인딩 `bindGestures(element, ...)`.
 * 상태 머신은 DOM·타이머를 모르므로 단위 테스트로 임계값·전이를 고정할 수 있다.
 *
 * 규칙 (홈 리뉴얼 원장 HOM-03 · Interaction Language v2 요약)
 *  - 방향 락: 처음 lockDistancePx 이상 움직인 축으로 고정한다. 세로로 락되면 네이티브 스크롤에 넘긴다(axes="x").
 *  - 화면 양끝 edgeGuardPx 에서 시작한 포인터는 처리하지 않는다 (브라우저 뒤로가기 edge 제스처 보호).
 *  - 링크·버튼·입력 요소 위에서 시작한 제스처는 가로채지 않는다.
 *  - 단일 탭은 기본 액션이 없다(홈 Deck). 더블 탭은 doubleTap=true 일 때만 판정하며, 그때 단일 탭은 판정 창이 지난 뒤 발행한다.
 *  - 모든 제스처 목적지는 키보드·버튼으로도 도달할 수 있어야 한다 (`STORY_KEYMAP`, `DECK_KEYMAP`).
 *
 * 임계값 기본값은 **잠정값**이다. Interaction Language v2 §18 정본 수치가 확인되면 이 객체만 교체한다.
 */

export type GestureConfig = {
  axes: "x" | "both";
  doubleTap: boolean;
  edgeGuardPx: number;
  lockDistancePx: number;
  /** 주축 이동량이 보조축의 몇 배 이상이어야 락하는가 */
  lockRatio: number;
  tapSlopPx: number;
  tapMaxMs: number;
  longPressMs: number;
  doubleTapMs: number;
  doubleTapSlopPx: number;
  swipeDistancePx: number;
  /** px/ms */
  flingVelocity: number;
  flingMinDistancePx: number;
};

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  axes: "x",
  doubleTap: false,
  edgeGuardPx: 24,
  lockDistancePx: 10,
  lockRatio: 1.2,
  tapSlopPx: 10,
  tapMaxMs: 300,
  longPressMs: 450,
  doubleTapMs: 280,
  doubleTapSlopPx: 24,
  swipeDistancePx: 64,
  flingVelocity: 0.45,
  flingMinDistancePx: 24,
};

export type SwipeDirection = "left" | "right" | "up" | "down";

export type GestureIntent =
  | { type: "tap"; x: number; y: number }
  | { type: "double-tap"; x: number; y: number }
  | { type: "swipe"; direction: SwipeDirection; distance: number; velocity: number }
  | { type: "drag"; axis: "x" | "y"; delta: number }
  | { type: "long-press-start" }
  | { type: "long-press-end" };

export type GestureEvent =
  | { type: "down"; pointerId: number; x: number; y: number; t: number; blocked?: boolean }
  | { type: "move"; pointerId: number; x: number; y: number; t: number }
  | { type: "up"; pointerId: number; x: number; y: number; t: number }
  | { type: "cancel"; pointerId: number }
  | { type: "timer"; t: number };

type Pointer = { pointerId: number; x0: number; y0: number; t0: number; x: number; y: number; t: number };

export type GestureState = {
  phase: "idle" | "pressed" | "locked-x" | "locked-y" | "native" | "long-press" | "blocked";
  pointer: Pointer | null;
  /** 더블 탭 판정 대기 중인 단일 탭 */
  pendingTap: { x: number; y: number; t: number } | null;
};

export const INITIAL_GESTURE_STATE: GestureState = { phase: "idle", pointer: null, pendingTap: null };

type Result = { state: GestureState; intents: GestureIntent[] };

const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

function flushPendingTap(state: GestureState, t: number, config: GestureConfig, intents: GestureIntent[]): GestureState {
  if (state.pendingTap && t - state.pendingTap.t >= config.doubleTapMs) {
    intents.push({ type: "tap", x: state.pendingTap.x, y: state.pendingTap.y });
    return { ...state, pendingTap: null };
  }
  return state;
}

function resolveSwipe(pointer: Pointer, axis: "x" | "y", config: GestureConfig): GestureIntent | null {
  const delta = axis === "x" ? pointer.x - pointer.x0 : pointer.y - pointer.y0;
  const elapsed = Math.max(1, pointer.t - pointer.t0);
  const velocity = Math.abs(delta) / elapsed;
  const passes =
    Math.abs(delta) >= config.swipeDistancePx || (Math.abs(delta) >= config.flingMinDistancePx && velocity >= config.flingVelocity);
  if (!passes) return null;
  const direction: SwipeDirection = axis === "x" ? (delta < 0 ? "left" : "right") : delta < 0 ? "up" : "down";
  return { type: "swipe", direction, distance: Math.abs(delta), velocity };
}

export function reduceGesture(state: GestureState, event: GestureEvent, config: GestureConfig = DEFAULT_GESTURE_CONFIG): Result {
  const intents: GestureIntent[] = [];

  if (event.type === "timer") {
    let next = flushPendingTap(state, event.t, config, intents);
    const p = next.pointer;
    if (next.phase === "pressed" && p && event.t - p.t0 >= config.longPressMs) {
      intents.push({ type: "long-press-start" });
      next = { ...next, phase: "long-press" };
    }
    return { state: next, intents };
  }

  if (event.type === "down") {
    let next = flushPendingTap(state, event.t, config, intents);
    if (next.pointer) return { state: next, intents }; // 멀티 터치: 첫 포인터만 추적
    const pointer: Pointer = { pointerId: event.pointerId, x0: event.x, y0: event.y, t0: event.t, x: event.x, y: event.y, t: event.t };
    next = { ...next, phase: event.blocked ? "blocked" : "pressed", pointer };
    return { state: next, intents };
  }

  const p = state.pointer;
  if (!p || event.pointerId !== p.pointerId) return { state, intents };

  if (event.type === "cancel") {
    if (state.phase === "long-press") intents.push({ type: "long-press-end" });
    return { state: { ...state, phase: "idle", pointer: null }, intents };
  }

  const pointer: Pointer = { ...p, x: event.x, y: event.y, t: event.t };
  const dx = pointer.x - pointer.x0;
  const dy = pointer.y - pointer.y0;

  if (event.type === "move") {
    let phase = state.phase;
    if (phase === "pressed" && distance(pointer.x, pointer.y, pointer.x0, pointer.y0) >= config.lockDistancePx) {
      if (Math.abs(dx) >= Math.abs(dy) * config.lockRatio) phase = "locked-x";
      else if (Math.abs(dy) >= Math.abs(dx) * config.lockRatio) phase = config.axes === "both" ? "locked-y" : "native";
    }
    if (phase === "locked-x") intents.push({ type: "drag", axis: "x", delta: dx });
    if (phase === "locked-y") intents.push({ type: "drag", axis: "y", delta: dy });
    return { state: { ...state, phase, pointer }, intents };
  }

  // up
  const released: GestureState = { ...state, phase: "idle", pointer: null };
  switch (state.phase) {
    case "locked-x":
    case "locked-y": {
      const swipe = resolveSwipe(pointer, state.phase === "locked-x" ? "x" : "y", config);
      if (swipe) intents.push(swipe);
      return { state: released, intents };
    }
    case "long-press":
      intents.push({ type: "long-press-end" });
      return { state: released, intents };
    case "pressed": {
      const moved = distance(pointer.x, pointer.y, pointer.x0, pointer.y0);
      if (moved > config.tapSlopPx || pointer.t - pointer.t0 > config.tapMaxMs) return { state: released, intents };
      if (!config.doubleTap) {
        intents.push({ type: "tap", x: pointer.x, y: pointer.y });
        return { state: released, intents };
      }
      const pending = state.pendingTap;
      if (pending && pointer.t - pending.t < config.doubleTapMs && distance(pending.x, pending.y, pointer.x, pointer.y) <= config.doubleTapSlopPx) {
        intents.push({ type: "double-tap", x: pointer.x, y: pointer.y });
        return { state: { ...released, pendingTap: null }, intents };
      }
      return { state: { ...released, pendingTap: { x: pointer.x, y: pointer.y, t: pointer.t } }, intents };
    }
    default:
      return { state: released, intents };
  }
}

/** 다음 timer 이벤트가 필요한 시각 (없으면 null). DOM 바인딩이 이 시각에 맞춰 타이머를 건다. */
export function nextGestureDeadline(state: GestureState, config: GestureConfig = DEFAULT_GESTURE_CONFIG): number | null {
  const deadlines: number[] = [];
  if (state.phase === "pressed" && state.pointer) deadlines.push(state.pointer.t0 + config.longPressMs);
  if (state.pendingTap) deadlines.push(state.pendingTap.t + config.doubleTapMs);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

// ---------------------------------------------------------------------------
// DOM 바인딩
// ---------------------------------------------------------------------------

export const GESTURE_IGNORE_SELECTOR =
  'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="slider"], [contenteditable=""], [contenteditable="true"], [data-gesture-ignore]';

export type BindGesturesOptions = {
  config?: Partial<GestureConfig>;
  onIntent: (intent: GestureIntent, event: { width: number; height: number; left: number; top: number }) => void;
  ignoreSelector?: string;
  now?: () => number;
};

export function bindGestures(element: HTMLElement, options: BindGesturesOptions): () => void {
  const config: GestureConfig = { ...DEFAULT_GESTURE_CONFIG, ...options.config };
  const ignoreSelector = options.ignoreSelector ?? GESTURE_IGNORE_SELECTOR;
  const now = options.now ?? (() => performance.now());
  let state = INITIAL_GESTURE_STATE;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (intents: GestureIntent[]) => {
    if (intents.length === 0) return;
    const rect = element.getBoundingClientRect();
    const box = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    for (const intent of intents) options.onIntent(intent, box);
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const deadline = nextGestureDeadline(state, config);
    if (deadline === null) return;
    timer = setTimeout(() => dispatch({ type: "timer", t: now() }), Math.max(0, deadline - now()));
  };

  const dispatch = (event: GestureEvent) => {
    const result = reduceGesture(state, event, config);
    state = result.state;
    emit(result.intents);
    schedule();
  };

  const isBlocked = (event: PointerEvent) => {
    const viewport = window.innerWidth;
    if (event.clientX < config.edgeGuardPx || event.clientX > viewport - config.edgeGuardPx) return true;
    const target = event.target instanceof Element ? event.target.closest(ignoreSelector) : null;
    return Boolean(target && element.contains(target) && target !== element);
  };

  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    dispatch({ type: "down", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: now(), blocked: isBlocked(event) });
  };
  const onMove = (event: PointerEvent) => {
    const before = state.phase;
    dispatch({ type: "move", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: now() });
    if (before === "pressed" && (state.phase === "locked-x" || state.phase === "locked-y")) {
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // 캡처 실패는 추적에 영향이 없다
      }
    }
  };
  const onUp = (event: PointerEvent) => dispatch({ type: "up", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: now() });
  const onCancel = (event: PointerEvent) => dispatch({ type: "cancel", pointerId: event.pointerId });
  const onContextMenu = (event: Event) => {
    if (state.phase === "long-press" || state.phase === "pressed") event.preventDefault();
  };

  element.addEventListener("pointerdown", onDown);
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerup", onUp);
  element.addEventListener("pointercancel", onCancel);
  element.addEventListener("contextmenu", onContextMenu);

  return () => {
    if (timer !== null) clearTimeout(timer);
    element.removeEventListener("pointerdown", onDown);
    element.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerup", onUp);
    element.removeEventListener("pointercancel", onCancel);
    element.removeEventListener("contextmenu", onContextMenu);
  };
}

// ---------------------------------------------------------------------------
// 표면별 의미 매핑 + 키보드 대체 경로
// ---------------------------------------------------------------------------

export type StoryAction = "prev" | "next" | "toggle" | "close" | "first" | "last" | "hold-start" | "hold-end";

/** Story 플레이어: 탭 왼쪽 1/3 = 이전, 나머지 = 다음 / 스와이프 좌=다음·우=이전·아래=닫기 / 길게 누르기 = 누르는 동안 정지 */
export function toStoryAction(intent: GestureIntent, box: { width: number; left: number }): StoryAction | null {
  switch (intent.type) {
    case "tap":
      return intent.x - box.left < box.width / 3 ? "prev" : "next";
    case "swipe":
      if (intent.direction === "left") return "next";
      if (intent.direction === "right") return "prev";
      if (intent.direction === "down") return "close";
      return null;
    case "long-press-start":
      return "hold-start";
    case "long-press-end":
      return "hold-end";
    default:
      return null;
  }
}

export type DeckAction = "explore-category" | "read" | "like";

/** 홈 Deck: 왼쪽 스와이프 = 카테고리 탐색, 오른쪽 스와이프 = 글 읽기, 더블 탭 = 좋아요, 단일 탭 = 액션 없음 */
export function toDeckAction(intent: GestureIntent): DeckAction | null {
  if (intent.type === "swipe" && intent.direction === "left") return "explore-category";
  if (intent.type === "swipe" && intent.direction === "right") return "read";
  if (intent.type === "double-tap") return "like";
  return null;
}

export const STORY_KEYMAP: Readonly<Record<string, StoryAction>> = {
  ArrowLeft: "prev",
  ArrowRight: "next",
  " ": "toggle",
  Spacebar: "toggle",
  Escape: "close",
  Home: "first",
  End: "last",
};

export const DECK_KEYMAP: Readonly<Record<string, DeckAction>> = {
  ArrowLeft: "explore-category",
  ArrowRight: "read",
};
