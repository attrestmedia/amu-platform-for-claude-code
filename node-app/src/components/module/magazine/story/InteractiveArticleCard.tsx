"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Pause, Play } from "lucide-react";
import {
  bindGestures,
  buildStoryTimeline,
  DECK_KEYMAP,
  getSceneRestTimeMs,
  MOTION_TOKENS,
  sampleStoryTimeline,
  toDeckAction,
  type DeckAction,
  type HomeCardTier,
  type InteractiveArticleResource,
} from "../../../../motion-story";
import { StorySceneView } from "./scenes/StorySceneView";
import { useStoryTimeline } from "./useStoryTimeline";
import { useActiveSurface, useSurfaceImpression } from "./useSurfaceVisibility";

/**
 * 홈(/) 시그니처 카드 — 인터랙티브 아티클 리소스의 `homeCard` 표면을 루프 재생한다.
 *
 * 등급
 *  - standard : 정적 (첫 장면 정지 프레임)
 *  - motion   : 이미지 Ken Burns + 텍스트 루프
 *  - signature: motion + `signatureLayer`(WebGL 배경 등). 페이지당 1장만 (HomeDeck 이 강제)
 *
 * 재생: 가시 비율 ≥ 0.6 중 가장 많이 보이는 카드 1장만 · 2회 루프 후 정지 · 탭 숨김 시 정지 · reduced-motion 정적.
 * 제스처(Interaction Language v2): 오른쪽 스와이프 = 읽기, 왼쪽 스와이프 = 카테고리 탐색, 더블 탭 = 좋아요, 단일 탭 = 없음.
 * 같은 목적지를 버튼(읽기 링크)·키보드(← →)로도 갈 수 있다.
 */

export type InteractiveArticleCardLabels = {
  read: string;
  motionToggle: string;
  interactiveBadge: string;
};

export const DEFAULT_CARD_LABELS: InteractiveArticleCardLabels = {
  read: "인터랙티브로 읽기",
  motionToggle: "카드 움직임",
  interactiveBadge: "인터랙티브",
};

export type InteractiveArticleCardProps = {
  resource: InteractiveArticleResource;
  href: string;
  tier?: HomeCardTier;
  headingLevel?: "h2" | "h3";
  /** 첫 카드: 이미지가 LCP 후보 */
  priority?: boolean;
  signatureLayer?: ReactNode | undefined;
  labels?: Partial<InteractiveArticleCardLabels> | undefined;
  onDeckAction?: ((action: DeckAction, resource: InteractiveArticleResource) => void) | undefined;
  /** 60% 이상 1초 노출 시 1회 */
  onImpression?: ((resource: InteractiveArticleResource) => void) | undefined;
  className?: string;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function InteractiveArticleCard({
  resource,
  href,
  tier: tierOverride,
  headingLevel = "h3",
  priority = false,
  signatureLayer,
  labels: labelOverrides,
  onDeckAction,
  onImpression,
  className,
}: InteractiveArticleCardProps) {
  const labels = { ...DEFAULT_CARD_LABELS, ...labelOverrides };
  const surface = resource.surfaces.homeCard;
  const tier: HomeCardTier = surface ? (tierOverride ?? surface.tier) : "standard";
  const timeline = useMemo(
    () => buildStoryTimeline(resource, surface ? "homeCard" : "story"),
    [resource, surface],
  );
  const motionEnabled = tier !== "standard" && Boolean(surface);

  const rootRef = useRef<HTMLElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const active = useActiveSurface(rootRef, motionEnabled);
  const player = useStoryTimeline({ timeline, loops: MOTION_TOKENS.card.loops, autoPlay: true, active: motionEnabled && active });
  useSurfaceImpression(rootRef, onImpression ? () => onImpression(resource) : undefined);

  const actionRef = useRef(onDeckAction);
  useEffect(() => {
    actionRef.current = onDeckAction;
  });
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !onDeckAction) return;
    return bindGestures(media, {
      config: { axes: "x", doubleTap: true },
      onIntent: (intent) => {
        const action = toDeckAction(intent);
        if (action) actionRef.current?.(action, resource);
      },
    });
  }, [onDeckAction, resource]);

  const staticFrame = sampleStoryTimeline(timeline, getSceneRestTimeMs(timeline, 0));
  const frame = motionEnabled ? player.frame : staticFrame;
  const scene = timeline.scenes[frame.sceneIndex];
  const isStatic = !motionEnabled || player.isStatic;
  const showSignature = tier === "signature" && active && !player.reducedMotion && Boolean(signatureLayer);
  const Heading = headingLevel;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const action = DECK_KEYMAP[event.key];
    if (!action || !onDeckAction) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    event.preventDefault();
    onDeckAction(action, resource);
  };

  return (
    <article
      ref={rootRef}
      data-interactive-article-card={resource.slug}
      data-story-tier={tier}
      className={`relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface ${className ?? ""}`}
      onKeyDown={handleKeyDown}
    >
      <div ref={mediaRef} className="relative aspect-[4/5] w-full select-none overflow-hidden" style={{ touchAction: "pan-y" }}>
        {scene ? (
          <StorySceneView
            scene={scene}
            localMs={frame.localMs}
            isStatic={isStatic}
            assets={resource.assets}
            variant="card"
            priority={priority}
            backgroundLayer={showSignature ? signatureLayer : undefined}
          />
        ) : null}

        {motionEnabled && !player.reducedMotion ? (
          <>
            <button
              type="button"
              className={`absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-primary-text shadow-sm backdrop-blur-sm ${focusRing}`}
              aria-pressed={player.playing}
              aria-label={labels.motionToggle}
              onClick={player.toggle}
            >
              {player.playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            </button>
            <div className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-muted/60" aria-hidden="true">
              <div className="h-full w-full origin-left bg-primary" style={{ transform: `scaleX(${(isStatic ? 1 : frame.progress).toFixed(4)})` }} />
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary-text">{labels.interactiveBadge}</span>
        <Heading className="text-lg font-bold leading-snug text-primary-text">
          <a href={href} className={`rounded-sm hover:underline ${focusRing}`}>
            {resource.title}
          </a>
        </Heading>
        <p className="line-clamp-2 text-sm leading-6 text-secondary-text">{resource.summary}</p>
        <a
          href={href}
          className={`mt-auto inline-flex min-h-11 items-center gap-1 self-start rounded-full text-sm font-semibold text-primary-text ${focusRing}`}
          aria-label={`${resource.title} — ${labels.read}`}
          tabIndex={-1}
        >
          {labels.read}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export type InteractiveArticleHomeDeckProps = {
  resources: readonly InteractiveArticleResource[];
  hrefFor: (resource: InteractiveArticleResource) => string;
  signatureLayer?: ReactNode;
  onDeckAction?: InteractiveArticleCardProps["onDeckAction"];
  onImpression?: InteractiveArticleCardProps["onImpression"];
  labels?: Partial<InteractiveArticleCardLabels>;
  className?: string;
};

/** signature 등급은 페이지당 1장만 — 첫 번째 signature 이후는 motion 으로 낮춘다. */
export function resolveDeckTiers(resources: readonly InteractiveArticleResource[]): HomeCardTier[] {
  let signatureUsed = false;
  return resources.map((resource) => {
    const tier: HomeCardTier = resource.surfaces.homeCard?.tier ?? "standard";
    if (tier !== "signature") return tier;
    if (signatureUsed) return "motion";
    signatureUsed = true;
    return "signature";
  });
}

/** 홈 카드 묶음. signature 등급은 첫 번째 signature 카드 1장만 유지하고 나머지는 motion 으로 낮춘다. */
export function InteractiveArticleHomeDeck({ resources, hrefFor, signatureLayer, onDeckAction, onImpression, labels, className }: InteractiveArticleHomeDeckProps) {
  if (resources.length === 0) return null;
  const tiers = resolveDeckTiers(resources);
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ""}`}>
      {resources.map((resource, index) => {
        const tier = tiers[index] ?? "standard";
        return (
          <InteractiveArticleCard
            key={resource.articleId}
            resource={resource}
            href={hrefFor(resource)}
            tier={tier}
            priority={index === 0}
            signatureLayer={tier === "signature" ? signatureLayer : undefined}
            onDeckAction={onDeckAction}
            onImpression={onImpression}
            labels={labels}
          />
        );
      })}
    </div>
  );
}
