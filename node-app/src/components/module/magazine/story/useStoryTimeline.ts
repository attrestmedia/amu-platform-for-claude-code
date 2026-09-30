"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createStoryClock,
  getSceneRestTimeMs,
  prefersReducedMotion,
  resolvePlayback,
  sampleStoryTimeline,
  subscribeDocumentHidden,
  subscribeReducedMotion,
  type StoryClock,
  type StoryFrame,
  type StoryTimeline,
  type TimelineScene,
} from "../../../../motion-story";

/**
 * Story 타임라인 재생 훅 — 웹에서 t 를 진행시키는 유일한 주체.
 *
 * - 초기 렌더(SSR · hydration)는 항상 첫 장면의 정지 프레임이다. 텍스트가 모두 보이고 서버/클라이언트 마크업이 같다.
 * - 재생 조건: 마운트됨 · active · 재생 의도(autoPlay 또는 play()) · reduced-motion 아님 · 문서 visible · hold 아님.
 * - reduced-motion 이면 자동 재생하지 않고 장면마다 정지 프레임만 보여준다 (수동 이동은 가능).
 * - `loops` 회 재생 후 마지막 장면 정지 프레임에서 멈춘다.
 */

const subscribeNothing = () => () => {};
const getTrue = () => true;
const getFalse = () => false;
const isDocumentHidden = () => document.hidden;

export type ReducedMotionPolicy = "user" | "always" | "never";

export type UseStoryTimelineOptions = {
  timeline: StoryTimeline;
  loops?: number;
  autoPlay?: boolean;
  /** false 면 재생하지 않는다 (예: 뷰포트에서 가장 많이 보이는 표면이 아님) */
  active?: boolean;
  reducedMotion?: ReducedMotionPolicy;
  pauseWhenHidden?: boolean;
  /** 내레이션 오디오 등 외부 마스터 클럭 (ms). null 이면 wall clock */
  getMasterTimeMs?: (() => number | null) | undefined;
  onComplete?: (() => void) | undefined;
};

type Position = { kind: "static"; sceneIndex: number } | { kind: "live"; elapsedMs: number };

export type StoryTimelineController = {
  frame: StoryFrame;
  scene: TimelineScene | null;
  /** 정지 프레임(모든 텍스트 표시)으로 그려야 하는가 */
  isStatic: boolean;
  playing: boolean;
  done: boolean;
  reducedMotion: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** 길게 누르기 등 일시 정지 (사용자 정지 상태는 바꾸지 않는다) */
  hold: (held: boolean) => void;
  goToScene: (index: number) => void;
  next: () => boolean;
  prev: () => boolean;
  restart: () => void;
};

export function useStoryTimeline({
  timeline,
  loops = 1,
  autoPlay = true,
  active = true,
  reducedMotion: policy = "user",
  pauseWhenHidden = true,
  getMasterTimeMs,
  onComplete,
}: UseStoryTimelineOptions): StoryTimelineController {
  // 외부 상태(마운트 여부 · 동작 줄이기 · 탭 숨김)는 구독으로 읽는다. 서버 스냅샷은 모두 "정지" 쪽이다.
  const mounted = useSyncExternalStore(subscribeNothing, getTrue, getFalse);
  const userReduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, getFalse);
  const hidden = useSyncExternalStore(subscribeDocumentHidden, isDocumentHidden, getFalse);
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** 사용자 의도: 재생을 원하는가. 시스템 정지(active 이탈·숨김·hold)는 이 값을 바꾸지 않는다 */
  const [wantPlay, setWantPlay] = useState(autoPlay);
  const [position, setPosition] = useState<Position>({ kind: "static", sceneIndex: 0 });

  // 타임라인(또는 루프 수)이 바뀌면 렌더 중에 재생 상태를 초기화한다 (effect 안 setState 대신)
  const [tracked, setTracked] = useState({ timeline, loops });
  if (tracked.timeline !== timeline || tracked.loops !== loops) {
    setTracked({ timeline, loops });
    setDone(false);
    setPlaying(false);
    setPosition({ kind: "static", sceneIndex: 0 });
  }

  const clockRef = useRef<StoryClock | null>(null);
  const onCompleteRef = useRef(onComplete);
  const masterRef = useRef(getMasterTimeMs);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    masterRef.current = getMasterTimeMs;
  });

  const reducedMotion = policy === "always" || (policy === "user" && userReduced);

  // 타임라인마다 클럭 1개
  useEffect(() => {
    const clock = createStoryClock({
      getMasterTimeMs: () => masterRef.current?.() ?? null,
      onTick: (elapsedMs) => {
        const playback = resolvePlayback(timeline, elapsedMs, loops);
        if (playback.done) {
          clock.pause();
          setPlaying(false);
          setDone(true);
          setPosition({ kind: "static", sceneIndex: Math.max(0, timeline.scenes.length - 1) });
          onCompleteRef.current?.();
          return;
        }
        setPosition({ kind: "live", elapsedMs });
      },
    });
    clockRef.current = clock;
    return () => {
      clock.destroy();
      clockRef.current = null;
    };
  }, [timeline, loops]);

  const canRun = mounted && active && !reducedMotion && !(pauseWhenHidden && hidden) && !held;

  // 자동 재생 · 시스템 정지 (active 이탈 · 탭 숨김 · 길게 누르기)
  useEffect(() => {
    const clock = clockRef.current;
    if (!clock) return;
    if (canRun && wantPlay && !done) {
      if (!clock.playing) {
        if (position.kind === "static") clock.seek(timeline.scenes[position.sceneIndex]?.startMs ?? 0);
        clock.play();
        setPlaying(true);
      }
    } else if (clock.playing) {
      clock.pause();
      setPlaying(false);
    }
  }, [canRun, done, position, timeline, wantPlay]);

  const frame = useMemo(() => {
    if (position.kind === "static") return sampleStoryTimeline(timeline, getSceneRestTimeMs(timeline, position.sceneIndex));
    return sampleStoryTimeline(timeline, resolvePlayback(timeline, position.elapsedMs, loops).timeMs);
  }, [loops, position, timeline]);

  const play = useCallback(() => {
    const clock = clockRef.current;
    if (!clock || reducedMotion) return;
    if (done) {
      setDone(false);
      clock.seek(0);
    } else if (position.kind === "static") {
      clock.seek(timeline.scenes[position.sceneIndex]?.startMs ?? 0);
    }
    setWantPlay(true);
  }, [done, position, reducedMotion, timeline]);

  const pause = useCallback(() => {
    setWantPlay(false);
    // 같은 렌더에서 정지 상태를 반영한다 (effect 를 기다리면 한 프레임 늦는다)
    if (clockRef.current?.playing) {
      clockRef.current.pause();
      setPlaying(false);
    }
  }, []);

  const goToScene = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(0, index), timeline.scenes.length - 1);
      const scene = timeline.scenes[clamped];
      const clock = clockRef.current;
      if (!scene || !clock) return;
      setDone(false);
      if (clock.playing) {
        clock.seek(scene.startMs);
      } else {
        clock.seek(scene.startMs);
        setPosition({ kind: "static", sceneIndex: clamped });
      }
    },
    [timeline],
  );

  const next = useCallback(() => {
    if (frame.sceneIndex >= timeline.scenes.length - 1) return false;
    goToScene(frame.sceneIndex + 1);
    return true;
  }, [frame.sceneIndex, goToScene, timeline.scenes.length]);

  const prev = useCallback(() => {
    if (frame.sceneIndex <= 0) {
      goToScene(0);
      return false;
    }
    goToScene(frame.sceneIndex - 1);
    return true;
  }, [frame.sceneIndex, goToScene]);

  const restart = useCallback(() => {
    setDone(false);
    setWantPlay(true);
    clockRef.current?.seek(0);
    setPosition({ kind: "static", sceneIndex: 0 });
  }, []);

  const isStatic = position.kind === "static";

  return {
    frame,
    scene: timeline.scenes[frame.sceneIndex] ?? null,
    isStatic,
    playing,
    done,
    reducedMotion,
    play,
    pause,
    toggle: playing ? pause : play,
    hold: setHeld,
    goToScene,
    next,
    prev,
    restart,
  };
}
