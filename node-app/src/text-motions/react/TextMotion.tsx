'use client';

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type Ref,
} from 'react';

import {
  CURSOR_BASE_STYLE,
  OVERLAY_BASE_STYLE,
  SR_ONLY_STYLE,
  TEXT_MOTION_DATA_ATTR,
  WORD_STYLE,
  toReactStyle,
  unitBaseStyle,
} from '../core/layout';
import type { TextLayoutNode } from '../core/segment';
import type { MotionStyle, TextMotionFrame } from '../core/types';
import type { TextMotionPresetId } from '../presets/registry';
import {
  applyTextMotionFrame,
  collectTextMotionElements,
  createTextMotionPlayer,
  observeInView,
  prefersReducedMotion,
  type ReducedMotionPolicy,
  type TextMotionHandle,
  type TextMotionPlayer,
  type TextMotionTrigger,
} from '../runtime';
import type { TextMotionOptions, TextMotionSpec } from '../spec';
import {
  getRootStyle,
  getStaticTextMotionFrame,
  resolveTextMotion,
  sampleTextMotion,
  sampleTextMotionAtProgress,
} from '../timeline';

export interface TextMotionProps extends TextMotionOptions {
  text: string;
  /** 기본값 'fade-in' */
  preset?: TextMotionPresetId;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** 재생 시작 조건 (기본 'mount'). timeMs/progress 제어형에서는 무시 */
  trigger?: TextMotionTrigger;
  /** 기본 'user' = OS 의 모션 감소 설정을 따른다 */
  reducedMotion?: ReducedMotionPolicy;
  /**
   * 제어형(render 모드): 지정하면 타이머 없이 이 시점(ms)만 순수 렌더한다.
   * Rendiv/Revideo 등 프레임 기반 렌더러에서 frame → ms 로 넘겨 사용.
   */
  timeMs?: number;
  /** 제어형: 0..1 진행도 (스크롤 연동 등) */
  progress?: number;
  onComplete?: () => void;
  ref?: Ref<TextMotionHandle>;
}

function css(...styles: (MotionStyle | undefined)[]): CSSProperties {
  return toReactStyle(Object.assign({}, ...styles)) as CSSProperties;
}

function renderNodes(nodes: TextLayoutNode[], frame: TextMotionFrame): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'break':
        return <br key={`b${i}`} />;
      case 'text':
        return node.text;
      case 'word':
        return (
          <span key={`w${i}`} style={css(WORD_STYLE)}>
            {renderNodes(node.children, frame)}
          </span>
        );
      case 'unit': {
        const unitFrame = frame.units[node.index];
        return (
          <span
            key={`u${node.index}`}
            {...{ [TEXT_MOTION_DATA_ATTR.unit]: node.index }}
            style={css(unitBaseStyle(node.space), unitFrame?.style)}
          >
            {unitFrame?.text ?? node.text}
          </span>
        );
      }
    }
  });
}

/**
 * AMU 텍스트 모션 컴포넌트.
 *
 * - interactive: rAF 시계가 DOM 스타일을 직접 갱신 (React 리렌더 없음)
 * - render(제어형): timeMs/progress 로 순수 렌더 → 영상 프레임 렌더와 결과 동일
 * 두 모드 모두 sampleTextMotion 하나로 프레임을 계산한다.
 */
export function TextMotion({
  text,
  preset = 'fade-in',
  split,
  durationMs,
  staggerMs,
  delayMs,
  staggerFrom,
  easing,
  seed,
  loop,
  loopDelayMs,
  as: Tag = 'span',
  className,
  style,
  trigger = 'mount',
  reducedMotion = 'user',
  timeMs,
  progress,
  onComplete,
  ref,
}: TextMotionProps) {
  // spec 을 값(JSON)으로 비교해 인라인 배열(easing 등)로 인한 불필요한 재해석을 막는다
  const specKey = JSON.stringify({ preset, text, split, durationMs, staggerMs, delayMs, staggerFrom, easing, seed, loop, loopDelayMs });
  const resolved = useMemo(() => resolveTextMotion(JSON.parse(specKey) as TextMotionSpec), [specKey]);

  const controlled = timeMs !== undefined || progress !== undefined;
  const frame = useMemo(() => {
    if (timeMs !== undefined) return sampleTextMotion(resolved, timeMs);
    if (progress !== undefined) return sampleTextMotionAtProgress(resolved, progress);
    return sampleTextMotion(resolved, 0);
  }, [resolved, timeMs, progress]);

  const rootRef = useRef<HTMLElement>(null);
  const visualRef = useRef<HTMLSpanElement>(null);
  const playerRef = useRef<TextMotionPlayer | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (controlled || !visualRef.current || !rootRef.current) return;
    const elements = collectTextMotionElements(visualRef.current);
    const render = (f: TextMotionFrame) => applyTextMotionFrame(elements, f);

    if (prefersReducedMotion(reducedMotion)) {
      render(getStaticTextMotionFrame(resolved));
      return;
    }
    const player = createTextMotionPlayer(resolved, render, { onComplete: () => onCompleteRef.current?.() });
    playerRef.current = player;
    let unobserve = () => {};
    if (trigger === 'in-view') unobserve = observeInView(rootRef.current, () => player.play());
    else if (trigger === 'mount') player.play();

    return () => {
      unobserve();
      player.destroy();
      playerRef.current = null;
    };
  }, [controlled, resolved, trigger, reducedMotion]);

  useImperativeHandle(
    ref,
    (): TextMotionHandle => ({
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      restart: () => playerRef.current?.restart(),
      seek: (ms) => playerRef.current?.seek(ms),
      get timeMs() {
        return playerRef.current?.timeMs ?? frame.timeMs;
      },
      get playing() {
        return playerRef.current?.playing ?? false;
      },
      get durationMs() {
        return resolved.totalMs;
      },
    }),
    [frame.timeMs, resolved.totalMs],
  );

  const { kind } = resolved.preset;
  return (
    <Tag
      ref={rootRef}
      className={className}
      style={{ ...css(getRootStyle(resolved)), ...style }}
      {...{ [TEXT_MOTION_DATA_ATTR.root]: resolved.preset.id }}
    >
      <span style={css(SR_ONLY_STYLE)}>{text}</span>
      {/* spec 이 바뀌면 재마운트: 명령형 DOM 갱신과 React 조정이 충돌하지 않도록 */}
      <span key={specKey} ref={visualRef} aria-hidden="true">
        {renderNodes(resolved.segmentation.tree, frame)}
        {kind === 'type' && resolved.preset.cursor && (
          <span {...{ [TEXT_MOTION_DATA_ATTR.cursor]: '' }} style={css(CURSOR_BASE_STYLE, frame.cursor)} />
        )}
        {kind === 'block' && (
          <span {...{ [TEXT_MOTION_DATA_ATTR.overlay]: '' }} style={css(OVERLAY_BASE_STYLE, frame.overlay)} />
        )}
      </span>
    </Tag>
  );
}
