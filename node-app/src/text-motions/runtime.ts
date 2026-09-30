import {
  CURSOR_BASE_STYLE,
  OVERLAY_BASE_STYLE,
  SR_ONLY_STYLE,
  TEXT_MOTION_DATA_ATTR,
  WORD_STYLE,
  unitBaseStyle,
} from './core/layout';
import type { TextLayoutNode } from './core/segment';
import type { MotionStyle, TextMotionFrame } from './core/types';
import type { TextMotionSpec } from './spec';
import {
  getRootStyle,
  getStaticTextMotionFrame,
  resolveTextMotion,
  sampleTextMotion,
  type ResolvedTextMotion,
} from './timeline';

/**
 * 브라우저 런타임 (React 컴포넌트와 바닐라 mount API 가 공유).
 * - applyTextMotionFrame: 프레임 → DOM 반영 (유일한 DOM 쓰기 경로)
 * - createTextMotionPlayer: rAF 시계 (재생/정지/탐색/루프/완료)
 * - 트리거 헬퍼: reduced motion, in-view
 */

export interface TextMotionElements {
  units: HTMLElement[];
  overlay?: HTMLElement | null;
  cursor?: HTMLElement | null;
}

export type TextMotionTrigger = 'mount' | 'in-view' | 'manual';
export type ReducedMotionPolicy = 'user' | 'always' | 'never';

export interface TextMotionHandle {
  play(): void;
  pause(): void;
  restart(): void;
  seek(timeMs: number): void;
  readonly timeMs: number;
  readonly playing: boolean;
  readonly durationMs: number;
}

// ───────────────────────── DOM 반영 ─────────────────────────

const appliedKeys = new WeakMap<HTMLElement, Set<string>>();

export function applyStyle(el: HTMLElement, style: MotionStyle): void {
  const prev = appliedKeys.get(el);
  const next = new Set(Object.keys(style));
  if (prev) for (const key of prev) if (!next.has(key)) el.style.removeProperty(key);
  for (const [key, value] of Object.entries(style)) {
    if (el.style.getPropertyValue(key) !== value) el.style.setProperty(key, value);
  }
  appliedKeys.set(el, next);
}

export function applyTextMotionFrame(elements: TextMotionElements, frame: TextMotionFrame): void {
  frame.units.forEach((unit, i) => {
    const el = elements.units[i];
    if (!el) return;
    applyStyle(el, unit.style);
    if (unit.text !== undefined && el.textContent !== unit.text) el.textContent = unit.text;
  });
  if (elements.overlay && frame.overlay) applyStyle(elements.overlay, frame.overlay);
  if (elements.cursor && frame.cursor) applyStyle(elements.cursor, frame.cursor);
}

/** 루트 아래에서 data 속성으로 요소 수집 (React/바닐라 공통) */
export function collectTextMotionElements(root: ParentNode): TextMotionElements {
  const units: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>(`[${TEXT_MOTION_DATA_ATTR.unit}]`).forEach((el) => {
    units[Number(el.getAttribute(TEXT_MOTION_DATA_ATTR.unit))] = el;
  });
  return {
    units,
    overlay: root.querySelector<HTMLElement>(`[${TEXT_MOTION_DATA_ATTR.overlay}]`),
    cursor: root.querySelector<HTMLElement>(`[${TEXT_MOTION_DATA_ATTR.cursor}]`),
  };
}

// ───────────────────────── 재생 시계 ─────────────────────────

export interface TextMotionPlayer extends TextMotionHandle {
  destroy(): void;
}

export function createTextMotionPlayer(
  resolved: ResolvedTextMotion,
  render: (frame: TextMotionFrame) => void,
  options: { onComplete?: () => void } = {},
): TextMotionPlayer {
  let time = 0;
  let playing = false;
  let raf = 0;
  let last = 0;

  const draw = () => {
    const frame = sampleTextMotion(resolved, time);
    render(frame);
    return frame;
  };

  const tick = (now: number) => {
    time += now - last;
    last = now;
    const frame = draw();
    if (frame.done) {
      playing = false;
      options.onComplete?.();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const play = () => {
    if (playing) return;
    if (!resolved.timing.loop && time >= resolved.totalMs) time = 0;
    playing = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  draw();

  return {
    play,
    pause() {
      playing = false;
      stop();
    },
    restart() {
      stop();
      playing = false;
      time = 0;
      draw();
      play();
    },
    seek(timeMs: number) {
      time = Math.max(0, timeMs);
      draw();
    },
    destroy() {
      playing = false;
      stop();
    },
    get timeMs() {
      return time;
    },
    get playing() {
      return playing;
    },
    get durationMs() {
      return resolved.totalMs;
    },
  };
}

// ───────────────────────── 트리거 ─────────────────────────

export function prefersReducedMotion(policy: ReducedMotionPolicy = 'user'): boolean {
  if (policy !== 'user') return policy === 'always';
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function observeInView(el: Element, onEnter: () => void, threshold = 0.3): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onEnter();
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        onEnter();
      }
    },
    { threshold },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

// ───────────────────────── 바닐라 mount (React 밖: 매거진 HTML, 임베드 등) ─────────────────────────

function styleText(style: MotionStyle): string {
  return Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

function buildNodes(doc: Document, nodes: TextLayoutNode[], parent: HTMLElement): void {
  for (const node of nodes) {
    if (node.type === 'break') parent.appendChild(doc.createElement('br'));
    else if (node.type === 'text') parent.appendChild(doc.createTextNode(node.text));
    else if (node.type === 'word') {
      const word = doc.createElement('span');
      word.setAttribute('style', styleText(WORD_STYLE));
      buildNodes(doc, node.children, word);
      parent.appendChild(word);
    } else {
      const unit = doc.createElement('span');
      unit.setAttribute(TEXT_MOTION_DATA_ATTR.unit, String(node.index));
      unit.setAttribute('style', styleText(unitBaseStyle(node.space)));
      unit.textContent = node.text;
      parent.appendChild(unit);
    }
  }
}

export interface MountTextMotionOptions {
  trigger?: TextMotionTrigger;
  reducedMotion?: ReducedMotionPolicy;
  onComplete?: () => void;
}

export interface MountedTextMotion extends TextMotionHandle {
  destroy(): void;
}

/** 요소 내부를 텍스트 모션 마크업으로 교체하고 재생한다. destroy() 시 원래 내용 복원. */
export function mountTextMotion(
  root: HTMLElement,
  spec: TextMotionSpec,
  options: MountTextMotionOptions = {},
): MountedTextMotion {
  const doc = root.ownerDocument;
  const original = Array.from(root.childNodes);
  const resolved = resolveTextMotion(spec);

  root.replaceChildren();
  const rootStyle = getRootStyle(resolved);
  const originalRootStyle = root.getAttribute('style');
  root.setAttribute(TEXT_MOTION_DATA_ATTR.root, resolved.preset.id);
  for (const [k, v] of Object.entries(rootStyle)) root.style.setProperty(k, v);

  const sr = doc.createElement('span');
  sr.setAttribute('style', styleText(SR_ONLY_STYLE));
  sr.textContent = spec.text;
  const visual = doc.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  buildNodes(doc, resolved.segmentation.tree, visual);
  if (resolved.preset.kind === 'type' && resolved.preset.cursor) {
    const cursor = doc.createElement('span');
    cursor.setAttribute(TEXT_MOTION_DATA_ATTR.cursor, '');
    cursor.setAttribute('style', styleText(CURSOR_BASE_STYLE));
    visual.appendChild(cursor);
  }
  if (resolved.preset.kind === 'block') {
    const overlay = doc.createElement('span');
    overlay.setAttribute(TEXT_MOTION_DATA_ATTR.overlay, '');
    overlay.setAttribute('style', styleText(OVERLAY_BASE_STYLE));
    visual.appendChild(overlay);
  }
  root.append(sr, visual);

  const elements = collectTextMotionElements(visual);
  const render = (frame: TextMotionFrame) => applyTextMotionFrame(elements, frame);
  const player = createTextMotionPlayer(resolved, render, { onComplete: options.onComplete });

  let unobserve = () => {};
  if (prefersReducedMotion(options.reducedMotion)) {
    render(getStaticTextMotionFrame(resolved));
  } else if (options.trigger === 'in-view') {
    unobserve = observeInView(root, () => player.play());
  } else if (options.trigger !== 'manual') {
    player.play();
  }

  return {
    play: () => player.play(),
    pause: () => player.pause(),
    restart: () => player.restart(),
    seek: (ms) => player.seek(ms),
    get timeMs() {
      return player.timeMs;
    },
    get playing() {
      return player.playing;
    },
    get durationMs() {
      return player.durationMs;
    },
    destroy() {
      unobserve();
      player.destroy();
      root.removeAttribute(TEXT_MOTION_DATA_ATTR.root);
      if (originalRootStyle === null) root.removeAttribute('style');
      else root.setAttribute('style', originalRootStyle);
      root.replaceChildren(...original);
    },
  };
}
