import {
  getSurfaceScenes,
  type DataFigure,
  type InteractiveArticleResource,
  type InteractiveArticleSurfaceKey,
  type StoryBeat,
  type StoryBeatRole,
  type StoryScene,
  type StorySceneLayout,
  type StoryTextReveal,
} from "./contract";
import { revealStaggerMs } from "./compiler";
import {
  channelsToCss,
  getMotionPreset,
  getPresetDurationMs,
  samplePreset,
  type CameraPresetKey,
  type EmphasisPresetKey,
  type EnterPresetKey,
  type MotionCssStyle,
  type TransitionPresetKey,
} from "./presets";
import { MOTION_TOKENS } from "./tokens";

/**
 * Story 타임라인 엔진 — 모든 모션은 `t`(ms)의 순수 함수다.
 *
 *   buildStoryTimeline(resource, surface)  리소스 → 표면별 절대 시간표 (한 번 계산)
 *   sampleStoryTimeline(timeline, t)       t → 현재 장면·구간
 *   sampleSceneStyles(scene, localMs)      장면 로컬 t → 요소별 CSS
 *
 * 웹은 wall clock(또는 오디오 currentTime)으로 t 를 진행하고, 스크럽·영상 export 는 t 를 직접 지정한다.
 * 이 파일은 Date · Math.random · performance.now · DOM 을 쓰지 않는다.
 */

export type NarrationCue = { text: string; startMs: number; endMs: number };

export type TimelineUnit = { index: number; lineIndex: number; text: string; startMs: number };

export type TimelineLine = {
  text: string;
  isHeadline: boolean;
  /** reveal=word 일 때 어절 단위, 그 외 null */
  words: { text: string; unitIndex: number }[] | null;
  /** reveal=line · fade 일 때 이 줄이 따르는 unit. reveal=none 이면 -1 */
  unitIndex: number;
};

export type TimelineScene = {
  sceneId: string;
  index: number;
  layout: StorySceneLayout;
  beatIds: string[];
  roles: StoryBeatRole[];
  sourceRefs: string[];
  visual: StoryScene["visual"];
  figures: DataFigure[];
  startMs: number;
  endMs: number;
  lengthMs: number;
  preRollMs: number;
  durationMs: number;
  holdMs: number;
  reveal: StoryTextReveal;
  enter: EnterPresetKey;
  enterMs: number;
  revealEndMs: number;
  emphasis: EmphasisPresetKey | null;
  emphasisStartMs: number;
  camera: CameraPresetKey | null;
  transitionOut: TransitionPresetKey;
  transitionMs: number;
  transitionStartMs: number;
  /** 텍스트가 모두 보이고 퇴장 전인 시점 (정지 프레임 기준) */
  restLocalMs: number;
  lines: TimelineLine[];
  units: TimelineUnit[];
};

export type StoryTimeline = {
  surface: InteractiveArticleSurfaceKey;
  articleId: string;
  revision: string;
  scenes: TimelineScene[];
  totalMs: number;
  /** 마지막 장면의 정지 프레임 절대 시각 */
  restMs: number;
};

export type BuildTimelineOptions = {
  /** sceneId → 장면 시작 기준 cue. reveal=word 이고 어절 수가 같을 때만 적용 (아니면 readingPace 타이밍) */
  cues?: Readonly<Record<string, readonly NarrationCue[]>> | undefined;
  /** 마지막 장면 퇴장: keep = 리소스 값(루프 표면), cut = 퇴장 없음(Story·Hero). 기본값은 표면별로 정한다 */
  endTransition?: "keep" | "cut" | undefined;
  /** 장면당 최대 줄 수. 기본: story = text.maxLines, 카드·Hero = text.maxLines ?? 토큰 maxLines */
  maxLines?: number | undefined;
};

const DEFAULT_END_TRANSITION: Record<InteractiveArticleSurfaceKey, "keep" | "cut"> = {
  story: "cut",
  hero: "cut",
  homeCard: "keep",
  short: "cut",
};

function defaultEnter(reveal: StoryTextReveal): EnterPresetKey {
  return reveal === "fade" ? "enter.fade" : "enter.fade-up";
}

function buildLines(beats: StoryBeat[], reveal: StoryTextReveal, maxLines: number) {
  const raw: { text: string; isHeadline: boolean }[] = [];
  for (const beat of beats) {
    if (beat.headline) raw.push({ text: beat.headline, isHeadline: true });
    for (const line of beat.body) raw.push({ text: line, isHeadline: false });
  }
  const limited = raw.slice(0, Math.max(1, maxLines));
  const units: Omit<TimelineUnit, "startMs">[] = [];
  const lines: TimelineLine[] = limited.map((line, lineIndex) => {
    if (reveal === "none") return { ...line, words: null, unitIndex: -1 };
    if (reveal === "fade") {
      if (units.length === 0) units.push({ index: 0, lineIndex, text: limited.map((l) => l.text).join("\n") });
      return { ...line, words: null, unitIndex: 0 };
    }
    if (reveal === "line") {
      const index = units.length;
      units.push({ index, lineIndex, text: line.text });
      return { ...line, words: null, unitIndex: index };
    }
    const words = line.text.split(/\s+/).filter(Boolean).map((word) => {
      const index = units.length;
      units.push({ index, lineIndex, text: word });
      return { text: word, unitIndex: index };
    });
    return { ...line, words, unitIndex: -1 };
  });
  return { lines, units };
}

function buildScene(
  scene: StoryScene,
  index: number,
  startMs: number,
  beatById: Map<string, StoryBeat>,
  options: { isLast: boolean; endTransition: "keep" | "cut"; maxLines: number; cues: readonly NarrationCue[] | undefined },
): TimelineScene {
  const beats = scene.beatIds.map((id) => beatById.get(id)).filter((beat): beat is StoryBeat => Boolean(beat));
  const reveal = scene.text.reveal;
  const enter = scene.text.enter ?? defaultEnter(reveal);
  const { lines, units: rawUnits } = buildLines(beats, reveal, options.maxLines);
  const preRollMs = scene.timing.preRollMs;
  const stagger = revealStaggerMs(reveal);

  const cues = options.cues;
  const useCues = reveal === "word" && cues !== undefined && cues.length === rawUnits.length && rawUnits.length > 0;
  const units: TimelineUnit[] = rawUnits.map((unit, i) => ({
    ...unit,
    startMs: useCues ? Math.max(0, Math.round(cues[i]?.startMs ?? 0)) : preRollMs + i * stagger,
  }));

  let durationMs = scene.timing.durationMs;
  if (useCues) {
    const lastCueEnd = Math.max(...cues.map((cue) => cue.endMs));
    durationMs = Math.max(durationMs, Math.ceil(lastCueEnd - preRollMs));
  }

  const enterMs = reveal === "none" ? 0 : getPresetDurationMs(enter);
  const lastUnitStart = units.length > 0 ? Math.max(...units.map((unit) => unit.startMs)) : preRollMs;
  const revealEndMs = units.length > 0 ? lastUnitStart + enterMs : preRollMs;

  const emphasis = scene.text.emphasis ?? null;
  const emphasisStartMs = emphasis === "emph.number-count" ? preRollMs : revealEndMs;

  const lengthMs = preRollMs + durationMs + scene.timing.holdMs;
  const transitionOut: TransitionPresetKey = options.isLast && options.endTransition === "cut" ? "trans.cut" : (scene.transitionOut ?? "trans.cut");
  const transitionMs = Math.min(getPresetDurationMs(transitionOut), lengthMs);
  const transitionStartMs = lengthMs - transitionMs;

  return {
    sceneId: scene.sceneId,
    index,
    layout: scene.layout,
    beatIds: [...scene.beatIds],
    roles: beats.map((beat) => beat.role),
    sourceRefs: beats.flatMap((beat) => beat.sourceRefs),
    visual: scene.visual,
    figures: scene.data?.figures ?? [],
    startMs,
    endMs: startMs + lengthMs,
    lengthMs,
    preRollMs,
    durationMs,
    holdMs: scene.timing.holdMs,
    reveal,
    enter,
    enterMs,
    revealEndMs,
    emphasis,
    emphasisStartMs,
    camera: scene.visual?.camera ?? null,
    transitionOut,
    transitionMs,
    transitionStartMs,
    restLocalMs: transitionStartMs,
    lines,
    units,
  };
}

export function buildStoryTimeline(
  resource: InteractiveArticleResource,
  surface: InteractiveArticleSurfaceKey,
  options: BuildTimelineOptions = {},
): StoryTimeline {
  const scenes = getSurfaceScenes(resource, surface);
  const beatById = new Map(resource.beats.map((beat) => [beat.beatId, beat]));
  const endTransition = options.endTransition ?? DEFAULT_END_TRANSITION[surface];
  const built: TimelineScene[] = [];
  let cursor = 0;
  scenes.forEach((scene, index) => {
    const maxLines = options.maxLines ?? scene.text.maxLines ?? (surface === "story" ? Number.POSITIVE_INFINITY : MOTION_TOKENS.scene.maxLines);
    const timelineScene = buildScene(scene, index, cursor, beatById, {
      isLast: index === scenes.length - 1,
      endTransition,
      maxLines,
      cues: options.cues?.[scene.sceneId],
    });
    built.push(timelineScene);
    cursor = timelineScene.endMs;
  });
  const last = built[built.length - 1];
  return {
    surface,
    articleId: resource.articleId,
    revision: resource.revision,
    scenes: built,
    totalMs: cursor,
    restMs: last ? last.startMs + last.restLocalMs : 0,
  };
}

// ---------------------------------------------------------------------------
// 샘플링
// ---------------------------------------------------------------------------

export type StoryPhase = "preRoll" | "reveal" | "hold" | "transition";

export type StoryFrame = {
  timeMs: number;
  sceneIndex: number;
  localMs: number;
  phase: StoryPhase;
  /** 현재 장면 진행률 0~1 */
  sceneProgress: number;
  /** 표면 전체 진행률 0~1 */
  progress: number;
};

export function findSceneIndex(timeline: StoryTimeline, timeMs: number): number {
  const { scenes } = timeline;
  for (let i = scenes.length - 1; i >= 0; i--) {
    const scene = scenes[i];
    if (scene && timeMs >= scene.startMs) return i;
  }
  return 0;
}

export function sampleStoryTimeline(timeline: StoryTimeline, timeMs: number): StoryFrame {
  const t = Math.min(Math.max(0, timeMs), timeline.totalMs);
  const sceneIndex = findSceneIndex(timeline, t);
  const scene = timeline.scenes[sceneIndex];
  if (!scene) return { timeMs: t, sceneIndex: 0, localMs: 0, phase: "hold", sceneProgress: 1, progress: 1 };
  const localMs = t - scene.startMs;
  let phase: StoryPhase = "transition";
  if (localMs < scene.preRollMs) phase = "preRoll";
  else if (localMs < scene.preRollMs + scene.durationMs) phase = "reveal";
  else if (localMs < scene.transitionStartMs) phase = "hold";
  return {
    timeMs: t,
    sceneIndex,
    localMs,
    phase,
    sceneProgress: scene.lengthMs > 0 ? Math.min(1, localMs / scene.lengthMs) : 1,
    progress: timeline.totalMs > 0 ? t / timeline.totalMs : 1,
  };
}

/** 장면 i 의 정지 프레임 절대 시각 (reduced-motion · 수동 이동 · 재생 완료 후) */
export function getSceneRestTimeMs(timeline: StoryTimeline, sceneIndex: number): number {
  const scene = timeline.scenes[Math.min(Math.max(0, sceneIndex), timeline.scenes.length - 1)];
  return scene ? scene.startMs + scene.restLocalMs : 0;
}

export type SceneStyles = {
  container: MotionCssStyle;
  camera: MotionCssStyle;
  units: MotionCssStyle[];
  emphasis: MotionCssStyle;
  /** number-count 로컬 시간 (정지 프레임이면 Infinity → 최종값) */
  counterLocalMs: number;
};

/**
 * 장면 로컬 시각의 요소별 스타일. `isStatic` 이면 모든 텍스트가 보이는 정지 프레임을 돌려준다
 * (카메라는 시작 구도, 강조는 완료 상태, 퇴장 없음).
 */
export function sampleSceneStyles(scene: TimelineScene, localMs: number, isStatic = false): SceneStyles {
  const endOfEnter = scene.enterMs;
  const units = scene.units.map((unit) =>
    channelsToCss(samplePreset(scene.enter, isStatic ? endOfEnter : localMs - unit.startMs)),
  );
  let emphasis: MotionCssStyle = {};
  if (scene.emphasis && !getMotionPreset(scene.emphasis).counter) {
    const emphasisMs = getPresetDurationMs(scene.emphasis);
    emphasis = channelsToCss(samplePreset(scene.emphasis, isStatic ? emphasisMs : localMs - scene.emphasisStartMs));
  }
  const camera = scene.camera ? channelsToCss(samplePreset(scene.camera, isStatic ? 0 : localMs, scene.lengthMs)) : {};
  const container = channelsToCss(samplePreset(scene.transitionOut, isStatic ? -1 : localMs - scene.transitionStartMs));
  return {
    container,
    camera,
    units,
    emphasis,
    counterLocalMs: isStatic ? Number.POSITIVE_INFINITY : localMs - scene.emphasisStartMs,
  };
}

// ---------------------------------------------------------------------------
// 루프
// ---------------------------------------------------------------------------

export type PlaybackPosition = { timeMs: number; iteration: number; done: boolean };

/**
 * 경과 시간 → 타임라인 시각. `loops` 회 재생이 끝나면 마지막 정지 프레임(restMs)에서 멈춘다.
 */
export function resolvePlayback(timeline: StoryTimeline, elapsedMs: number, loops = 1): PlaybackPosition {
  const total = timeline.totalMs;
  if (total <= 0) return { timeMs: 0, iteration: 0, done: true };
  const elapsed = Math.max(0, elapsedMs);
  const maxLoops = Math.max(1, loops);
  if (Number.isFinite(maxLoops) && elapsed >= total * maxLoops) {
    return { timeMs: timeline.restMs, iteration: maxLoops - 1, done: true };
  }
  const iteration = Math.floor(elapsed / total);
  return { timeMs: elapsed - iteration * total, iteration, done: false };
}
