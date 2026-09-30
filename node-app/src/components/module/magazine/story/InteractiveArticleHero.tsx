"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { buildStoryTimeline, MOTION_TOKENS, type InteractiveArticleResource } from "../../../../motion-story";
import { StorySceneView } from "./scenes/StorySceneView";
import { useStoryTimeline } from "./useStoryTimeline";
import { useActiveSurface } from "./useSurfaceVisibility";

/**
 * 인터랙티브 아티클 진입부 Hero — `hero` 표면(Hook + Context)을 1회 재생하고 마지막 프레임에서 멈춘다.
 * 루프하지 않는다 (읽기 진입을 방해하지 않기 위해). 제목(h1)은 소비자가 Hero 밖에 둔다 — Hero 텍스트는 Hook Beat 다.
 * 재생 길이가 5초를 넘으면 일시정지 컨트롤을 둔다 (WCAG 2.2.2).
 */

export type InteractiveArticleHeroProps = {
  resource: InteractiveArticleResource;
  /** [스토리로 보기] 등 진입 버튼 */
  actions?: ReactNode;
  signatureLayer?: ReactNode;
  labels?: { region?: string; motionToggle?: string };
  className?: string;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function InteractiveArticleHero({ resource, actions, signatureLayer, labels, className }: InteractiveArticleHeroProps) {
  const surface = resource.surfaces.hero ? "hero" : null;
  const timeline = useMemo(() => buildStoryTimeline(resource, surface ?? "story", surface ? {} : { maxLines: MOTION_TOKENS.scene.maxLines }), [resource, surface]);
  const rootRef = useRef<HTMLElement>(null);
  const active = useActiveSurface(rootRef, Boolean(surface));
  const player = useStoryTimeline({ timeline, loops: 1, autoPlay: true, active: Boolean(surface) && active });
  const scene = timeline.scenes[player.frame.sceneIndex];
  const needsPauseControl = Boolean(surface) && timeline.totalMs > MOTION_TOKENS.a11y.pauseControlRequiredAfterMs && !player.reducedMotion;
  const showSignature = Boolean(signatureLayer) && active && !player.reducedMotion && !player.done;

  return (
    <section
      ref={rootRef}
      aria-label={labels?.region ?? "인터랙티브 아티클 도입"}
      data-interactive-article-hero={resource.slug}
      className={`relative overflow-hidden rounded-2xl border border-border ${className ?? ""}`}
    >
      <div className="relative aspect-[4/5] w-full sm:aspect-[16/10]">
        {scene ? (
          <StorySceneView
            scene={scene}
            localMs={player.frame.localMs}
            isStatic={!surface || player.isStatic}
            assets={resource.assets}
            variant="hero"
            priority
            backgroundLayer={showSignature ? signatureLayer : undefined}
          />
        ) : null}
        {needsPauseControl ? (
          <button
            type="button"
            className={`absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-primary-text shadow-sm backdrop-blur-sm ${focusRing}`}
            aria-pressed={player.playing}
            aria-label={labels?.motionToggle ?? "도입 움직임"}
            onClick={player.done ? player.restart : player.toggle}
          >
            {player.playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background p-4">{actions}</div> : null}
    </section>
  );
}
