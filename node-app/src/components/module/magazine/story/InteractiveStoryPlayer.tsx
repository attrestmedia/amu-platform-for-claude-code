"use client";

import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import {
  bindGestures,
  buildStoryTimeline,
  STORY_KEYMAP,
  toStoryAction,
  type InteractiveArticleResource,
  type NarrationCue,
  type StoryAction,
} from "../../../../motion-story";
import { StorySceneView } from "./scenes/StorySceneView";
import { useStoryTimeline } from "./useStoryTimeline";

/**
 * 인터랙티브 아티클 Story 플레이어 — 9:16 세로 stage (모바일 전체 화면, 데스크톱 중앙 9:16).
 *
 * 숏폼 문법: 탭 왼쪽 1/3 = 이전 · 나머지 = 다음 / 좌우 스와이프 / 길게 누르기 = 누르는 동안 정지 / 아래로 스와이프 = 닫기
 * 키보드 대체: ← → Space Esc Home End. 모든 제스처 목적지는 하단 버튼으로도 갈 수 있다.
 * 자동 재생 콘텐츠이므로 일시정지 컨트롤(44×44, aria-pressed)을 항상 둔다 (WCAG 2.2.2).
 *
 * 다이얼로그·페이지 셸은 소비자가 감싼다 (라우트는 이번 범위 밖).
 */

export type InteractiveStoryPlayerLabels = {
  region: string;
  autoplay: string;
  autoplayOff: string;
  previous: string;
  next: string;
  close: string;
  finish: string;
  sceneStatus: (current: number, total: number) => string;
};

export const DEFAULT_STORY_PLAYER_LABELS: InteractiveStoryPlayerLabels = {
  region: "인터랙티브 스토리",
  autoplay: "자동 재생",
  autoplayOff: "동작 줄이기 설정으로 자동 재생 꺼짐",
  previous: "이전 장면",
  next: "다음 장면",
  close: "스토리 닫기",
  finish: "스토리 마치기",
  sceneStatus: (current, total) => `${total}개 장면 중 ${current}번째`,
};

export type InteractiveStoryPlayerProps = {
  resource: InteractiveArticleResource;
  labels?: Partial<InteractiveStoryPlayerLabels>;
  autoPlay?: boolean;
  /** 내레이션 cue (sceneId → cue). 어절 수가 맞는 장면만 word reveal 을 cue 에 맞춘다 */
  cues?: Readonly<Record<string, readonly NarrationCue[]>>;
  getMasterTimeMs?: () => number | null;
  /** 마지막 장면(outro)의 행동 버튼 (예: 원문 기사 보기) */
  outroAction?: ReactNode;
  onClose?: () => void;
  onComplete?: () => void;
  onSceneChange?: (sceneIndex: number, sceneId: string) => void;
  className?: string;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
const iconButton = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-primary-text transition-colors hover:bg-muted/40 disabled:opacity-40 ${focusRing} motion-reduce:transition-none`;

export function InteractiveStoryPlayer({
  resource,
  labels: labelOverrides,
  autoPlay = true,
  cues,
  getMasterTimeMs,
  outroAction,
  onClose,
  onComplete,
  onSceneChange,
  className,
}: InteractiveStoryPlayerProps) {
  const labels = { ...DEFAULT_STORY_PLAYER_LABELS, ...labelOverrides };
  const timeline = useMemo(() => buildStoryTimeline(resource, "story", { cues }), [cues, resource]);
  const player = useStoryTimeline({ timeline, loops: 1, autoPlay, getMasterTimeMs, onComplete });
  const stageRef = useRef<HTMLDivElement>(null);
  const { frame, scene } = player;
  const total = timeline.scenes.length;
  const isLast = frame.sceneIndex >= total - 1;

  const run = useCallback(
    (action: StoryAction) => {
      switch (action) {
        case "prev":
          player.prev();
          break;
        case "next":
          if (!player.next()) onClose?.();
          break;
        case "toggle":
          player.toggle();
          break;
        case "close":
          onClose?.();
          break;
        case "first":
          player.goToScene(0);
          break;
        case "last":
          player.goToScene(total - 1);
          break;
        case "hold-start":
          player.hold(true);
          break;
        case "hold-end":
          player.hold(false);
          break;
      }
    },
    [onClose, player, total],
  );

  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    return bindGestures(stage, {
      config: { axes: "both" },
      onIntent: (intent, box) => {
        const action = toStoryAction(intent, box);
        if (action) runRef.current(action);
      },
    });
  }, []);

  const sceneId = scene?.sceneId;
  const onSceneChangeRef = useRef(onSceneChange);
  useEffect(() => {
    onSceneChangeRef.current = onSceneChange;
  });
  useEffect(() => {
    if (sceneId) onSceneChangeRef.current?.(frame.sceneIndex, sceneId);
  }, [frame.sceneIndex, sceneId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const action = STORY_KEYMAP[event.key];
    if (!action) return;
    // 버튼 위 Space 는 버튼 자체 동작을 따른다
    if (event.key === " " && target.closest("button, a[href]")) return;
    if (action === "close" && !onClose) return;
    event.preventDefault();
    run(action);
  };

  return (
    <div
      role="region"
      aria-roledescription="story"
      aria-label={`${resource.title} — ${labels.region}`}
      className={`flex h-full w-full items-center justify-center bg-background ${className ?? ""}`}
      onKeyDown={handleKeyDown}
    >
      <div className="relative flex h-full max-h-[100dvh] w-full flex-col sm:aspect-[9/16] sm:h-[min(100dvh,56rem)] sm:w-auto">
        {/* 진행 바: 장면별 세그먼트, transform 으로만 채운다 */}
        <div className="absolute inset-x-3 top-3 z-20 flex gap-1" aria-hidden="true">
          {timeline.scenes.map((item, index) => {
            const fill = index < frame.sceneIndex ? 1 : index > frame.sceneIndex ? 0 : player.isStatic ? 1 : frame.sceneProgress;
            return (
              <div key={item.sceneId} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${fill.toFixed(4)})` }} />
              </div>
            );
          })}
        </div>

        <div className="absolute inset-x-3 top-6 z-20 flex items-center justify-between">
          <p className="rounded-full bg-background/85 px-2.5 py-1 text-xs font-semibold text-primary-text backdrop-blur-sm" aria-live="polite">
            <span aria-hidden="true">
              {frame.sceneIndex + 1} / {total}
            </span>
            <span className="sr-only">{labels.sceneStatus(frame.sceneIndex + 1, total)}</span>
          </p>
          {onClose ? (
            <button type="button" className={`${iconButton} bg-background/85 backdrop-blur-sm`} onClick={onClose} aria-label={labels.close}>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div ref={stageRef} className="relative min-h-0 flex-1 select-none overflow-hidden" style={{ touchAction: "none" }} data-story-stage="">
          {scene ? (
            <StorySceneView
              key={scene.sceneId}
              scene={scene}
              localMs={frame.localMs}
              isStatic={player.isStatic}
              assets={resource.assets}
              variant="stage"
              priority={frame.sceneIndex === 0}
              outroAction={outroAction}
              className="pt-14"
            />
          ) : null}
        </div>

        <div className="relative z-20 flex items-center justify-between gap-2 border-t border-border bg-background px-3 py-2">
          <button type="button" className={iconButton} onClick={() => run("prev")} disabled={frame.sceneIndex === 0} aria-label={labels.previous}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          {player.reducedMotion ? (
            <span className="px-2 text-center text-xs text-secondary-text">{labels.autoplayOff}</span>
          ) : (
            <button type="button" className={iconButton} onClick={() => run("toggle")} aria-pressed={player.playing} aria-label={labels.autoplay}>
              {player.playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
            </button>
          )}
          <button type="button" className={iconButton} onClick={() => run("next")} disabled={isLast && !onClose} aria-label={isLast ? labels.finish : labels.next}>
            {isLast && onClose ? <X className="h-5 w-5" aria-hidden="true" /> : <ChevronRight className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}
