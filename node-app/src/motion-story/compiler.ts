import type {
  InteractiveArticleSurfaces,
  StoryBeat,
  StoryBeatRole,
  StoryScene,
  StorySceneLayout,
  StoryTextReveal,
} from "./contract";
import { getPresetDurationMs, type CameraPresetKey, type EmphasisPresetKey, type EnterPresetKey, type TransitionPresetKey } from "./presets";
import { MOTION_TOKENS } from "./tokens";

/**
 * 표현 컴파일러 (결정론적, LLM 없음).
 *
 * 인터랙티브 아티클 리소스를 저작할 때 Beat 만 쓰고 나머지(layout · 프리셋 · 타이밍)를 규칙으로 채우는 보조 도구다.
 * 결과는 초안이며 편집자가 Scene 을 직접 고칠 수 있다. 같은 입력은 항상 같은 출력을 만든다.
 */

type RoleRule = {
  layout: StorySceneLayout;
  reveal: StoryTextReveal;
  enter: EnterPresetKey;
  emphasis?: EmphasisPresetKey;
  camera?: CameraPresetKey;
};

export const ROLE_PRESENTATION: Record<StoryBeatRole, RoleRule> = {
  hook: { layout: "cover", reveal: "line", enter: "enter.mask-reveal", camera: "camera.push" },
  context: { layout: "image_text", reveal: "line", enter: "enter.fade-up", camera: "camera.pan-left" },
  problem: { layout: "statement", reveal: "line", enter: "enter.fade-up" },
  insight: { layout: "statement", reveal: "line", enter: "enter.fade-up", emphasis: "emph.underline" },
  evidence: { layout: "statement", reveal: "line", enter: "enter.fade-up" },
  example: { layout: "image_text", reveal: "line", enter: "enter.slide-left", camera: "camera.push" },
  turn: { layout: "quote", reveal: "word", enter: "enter.fade" },
  takeaway: { layout: "statement", reveal: "line", enter: "enter.scale-in", emphasis: "emph.underline" },
  cta: { layout: "outro", reveal: "fade", enter: "enter.fade" },
};

/** 한 줄 읽기 시간 — readingPace (한국어 초당 글자 수, 줄당 최소 시간) */
export function readingMsForLine(line: string): number {
  const { koCharsPerSecond, minLineMs } = MOTION_TOKENS.readingPace;
  const chars = line.replace(/\s+/g, "").length;
  return Math.max(minLineMs, Math.round((chars / koCharsPerSecond) * 1000));
}

export function countRevealUnits(lines: readonly string[], reveal: StoryTextReveal): number {
  if (reveal === "none" || reveal === "fade") return lines.length > 0 ? 1 : 0;
  if (reveal === "line") return lines.length;
  return lines.reduce((sum, line) => sum + line.split(/\s+/).filter(Boolean).length, 0);
}

export function revealStaggerMs(reveal: StoryTextReveal): number {
  if (reveal === "word") return MOTION_TOKENS.stagger.word;
  if (reveal === "line") return MOTION_TOKENS.stagger.line;
  return 0;
}

/**
 * 본 구간(durationMs) = max(최소 길이, 마지막 reveal 종료, 누적 읽기 시간). 10ms 단위로 올림, 상한 적용.
 */
export function computeSceneDurationMs(lines: readonly string[], reveal: StoryTextReveal, enter: EnterPresetKey | undefined): number {
  const { minDurationMs, maxDurationMs } = MOTION_TOKENS.scene;
  const units = countRevealUnits(lines, reveal);
  const enterMs = reveal === "none" ? 0 : getPresetDurationMs(enter ?? "enter.fade-up");
  const revealEnd = units > 0 ? (units - 1) * revealStaggerMs(reveal) + enterMs : 0;
  const reading = lines.reduce((sum, line) => sum + readingMsForLine(line), 0);
  const raw = Math.max(minDurationMs, revealEnd, reading);
  return Math.min(maxDurationMs, Math.ceil(raw / 10) * 10);
}

export function beatLines(beat: StoryBeat): string[] {
  return beat.headline ? [beat.headline, ...beat.body] : [...beat.body];
}

export type DraftScenesOptions = {
  /** 마지막 장면 퇴장 (기본 trans.cut) */
  finalTransition?: TransitionPresetKey;
  /** 장면 사이 전환 (기본 trans.fade) */
  transition?: TransitionPresetKey;
};

/** Beat 1개 = Scene 1개 초안. data · comparison 은 수치 출처 검증이 필요하므로 자동 생성하지 않는다. */
export function draftScenesFromBeats(beats: readonly StoryBeat[], options: DraftScenesOptions = {}): StoryScene[] {
  const transition = options.transition ?? "trans.fade";
  const finalTransition = options.finalTransition ?? "trans.cut";
  return beats.map((beat, index) => {
    const rule = ROLE_PRESENTATION[beat.role];
    const lines = beatLines(beat);
    const scene: StoryScene = {
      sceneId: `scene-${index + 1}`,
      beatIds: [beat.beatId],
      layout: rule.layout,
      text: { reveal: rule.reveal, enter: rule.enter, ...(rule.emphasis ? { emphasis: rule.emphasis } : {}) },
      timing: {
        preRollMs: MOTION_TOKENS.scene.preRollMs,
        durationMs: computeSceneDurationMs(lines, rule.reveal, rule.enter),
        holdMs: MOTION_TOKENS.scene.holdMs,
      },
      transitionOut: index === beats.length - 1 ? finalTransition : transition,
    };
    if (rule.camera) scene.visual = { camera: rule.camera };
    return scene;
  });
}

function fitsLoopBudget(scenes: readonly StoryScene[]) {
  const budget = scenes.reduce((sum, scene) => sum + scene.timing.durationMs + scene.timing.holdMs, 0);
  return scenes.length <= MOTION_TOKENS.card.maxScenes && budget <= MOTION_TOKENS.card.maxLoopMs;
}

/**
 * 표면 초안: story = 전체, hero = hook(+context), homeCard = hook(+중요도 최상위 1개).
 * 루프 예산(장면 2개 · 8초)을 넘기면 그 표면은 만들지 않는다 (fail-closed → 정적 카드).
 */
export function draftSurfaces(
  beats: readonly StoryBeat[],
  scenes: readonly StoryScene[],
  options: { homeCardTier?: "standard" | "motion" | "signature" } = {},
): InteractiveArticleSurfaces {
  const beatById = new Map(beats.map((beat) => [beat.beatId, beat]));
  const roleOf = (scene: StoryScene) => beatById.get(scene.beatIds[0] ?? "")?.role;
  const importanceOf = (scene: StoryScene) => Math.max(...scene.beatIds.map((id) => beatById.get(id)?.importance ?? 0));

  const surfaces: InteractiveArticleSurfaces = { story: { sceneIds: scenes.map((scene) => scene.sceneId) } };
  const hook = scenes.find((scene) => roleOf(scene) === "hook");
  if (!hook) return surfaces;

  const pick = (candidates: StoryScene[]) => {
    for (const candidate of candidates) {
      if (fitsLoopBudget([hook, candidate])) return [hook, candidate];
    }
    return fitsLoopBudget([hook]) ? [hook] : null;
  };

  const heroScenes = pick(scenes.filter((scene) => roleOf(scene) === "context"));
  if (heroScenes) surfaces.hero = { sceneIds: heroScenes.map((scene) => scene.sceneId) };

  const ranked = scenes
    .filter((scene) => scene !== hook && roleOf(scene) !== "cta")
    .map((scene, order) => ({ scene, order, importance: importanceOf(scene) }))
    .sort((a, b) => b.importance - a.importance || a.order - b.order)
    .map((entry) => entry.scene);
  const cardScenes = pick(ranked);
  if (cardScenes) surfaces.homeCard = { sceneIds: cardScenes.map((scene) => scene.sceneId), tier: options.homeCardTier ?? "motion" };

  return surfaces;
}
