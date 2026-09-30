"use client";

import { useEffect, useRef } from "react";
import { lang } from "components/module/i18n";
import type { CardNewsCard } from "types/card-news";
import type { CardNewsPreparedScene } from "types/card-news/scene";
import { renderCardNewsCanvas } from "libs/card-news/export";

type CardNewsThumbnailProps = {
  card: CardNewsCard;
  scene?: CardNewsPreparedScene;
  active?: boolean;
  onClick: () => void;
};

export function CardNewsThumbnail({ card, scene, active = false, onClick }: CardNewsThumbnailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!scene || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const render = () => {
      const width = Math.max(1, container.clientWidth || 120);
      renderCardNewsCanvas(scene, {
        canvas,
        surface: "preview",
        cssWidth: width,
        cssHeight: width * scene.frameSize.h / scene.frameSize.w,
        pixelRatio: 1,
      });
    };
    render();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(render);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [scene]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lang({ ko: `카드 ${card.order + 1} 선택`, en: `Select card ${card.order + 1}` })}
      aria-pressed={active}
      className={`group flex min-w-[5.75rem] flex-col gap-2 rounded-xl p-2 text-left transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-surface-2"
      }`}
    >
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg border border-border/80 bg-surface-2"
        style={{ aspectRatio: scene ? `${scene.frameSize.w} / ${scene.frameSize.h}` : "4 / 5" }}
      >
        {scene ? (
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: card.background.type === "color" ? card.background.value : "var(--surface-2)" }}
            aria-hidden
          />
        )}
        <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/85 text-[11px] font-semibold text-primary-text shadow-sm">
          {card.order + 1}
        </span>
      </div>
      <span className="truncate px-0.5 text-xs font-medium text-primary-text">
        {card.altText || lang({ ko: `카드 ${card.order + 1}`, en: `Card ${card.order + 1}` })}
      </span>
    </button>
  );
}
