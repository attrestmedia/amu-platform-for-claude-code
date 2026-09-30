"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@amu-labs/ui";
import { trackGaEvent } from "utils/analytics/ga4";
import type { EditorialStoryManifest, EditorialStoryScene } from "libs/server-utils/magazine/editorialStory";
import { motion, useReducedMotion } from "framer-motion";

type Props = {
  manifest: EditorialStoryManifest;
  archetype: string;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
const control = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary-text transition-colors hover:bg-muted/40 ${focusRing} motion-reduce:transition-none`;
const iconControl = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-primary-text transition-colors hover:bg-muted/40 ${focusRing} motion-reduce:transition-none`;

function sceneLabel(scene: EditorialStoryScene) {
  if (scene.layout === "cover") return "이야기의 시작";
  if (scene.layout === "image_text") return "장면 전환";
  if (scene.layout === "outro") return "다음 읽기";
  return "핵심 장면";
}

export default function AppMagazineStoryMode({ manifest, archetype }: Props) {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion() === true;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const entryTrackedRef = useRef(false);
  const completionTrackedRef = useRef(false);
  const returnTrackedRef = useRef(false);

  const scenes = manifest.scenes;
  const scene = scenes[currentIndex] ?? scenes[0];
  const beatsById = useMemo(() => new Map(manifest.beats.map((beat) => [beat.beatId, beat])), [manifest.beats]);
  const sceneLines = scene?.beatIds.flatMap((beatId) => beatsById.get(beatId)?.body ?? []) ?? [];
  const lastScene = currentIndex >= scenes.length - 1;

  const measurementParams = useMemo(() => ({
    section_id: "story-mode",
    experience_id: "editorial-story-mode",
    experience_level: "story",
    archetype,
    integration_mode: "direct_import",
    story_revision: manifest.revision,
  }), [archetype, manifest.revision]);

  const closeStoryMode = useCallback(() => {
    if (!open) return;
    if (!returnTrackedRef.current) {
      returnTrackedRef.current = true;
      trackGaEvent("magazine_return", {
        ...measurementParams,
        return_type: "in_page_module",
        from_service: "editorial_story_mode",
        completion_state: completionTrackedRef.current ? "complete" : "abandoned",
      });
    }
    setPlaying(false);
    setOpen(false);
  }, [measurementParams, open]);

  const openStoryMode = useCallback(() => {
    entryTrackedRef.current = false;
    completionTrackedRef.current = false;
    returnTrackedRef.current = false;
    setCurrentIndex(0);
    setPlaying(!reducedMotion);
    setOpen(true);
  }, [reducedMotion]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) openStoryMode();
    else closeStoryMode();
  }, [closeStoryMode, openStoryMode]);

  const goPrevious = useCallback(() => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, []);

  const goNext = useCallback(() => {
    if (lastScene) {
      closeStoryMode();
      return;
    }
    setCurrentIndex((index) => Math.min(scenes.length - 1, index + 1));
  }, [closeStoryMode, lastScene, scenes.length]);

  useEffect(() => {
    if (!open || entryTrackedRef.current) return;
    entryTrackedRef.current = true;
    trackGaEvent("article_experience_impression", { ...measurementParams, stage: "entry" });
  }, [measurementParams, open]);

  useEffect(() => {
    if (!open || !scene || !lastScene || completionTrackedRef.current) return;
    completionTrackedRef.current = true;
    trackGaEvent("article_experience_impression", { ...measurementParams, stage: "complete" });
  }, [lastScene, measurementParams, open, scene]);

  useEffect(() => {
    if (!open || !playing || reducedMotion || !scene || lastScene) return;
    const timer = window.setTimeout(() => setCurrentIndex((index) => Math.min(scenes.length - 1, index + 1)), scene.durationMs);
    return () => window.clearTimeout(timer);
  }, [currentIndex, lastScene, open, playing, reducedMotion, scene, scenes.length]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-dialog-trigger="true"
        className={`${control} bg-primary text-primary-text`}
        onClick={openStoryMode}
        aria-haspopup="dialog"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        <span>스토리 모드로 읽기</span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          centered={false}
          hideClose
          className="z-50 h-screen w-screen max-w-none p-0"
          innerWrapClassName="flex h-full w-full flex-col bg-background px-4 py-4 sm:px-8 sm:py-6"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              goPrevious();
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              goNext();
            }
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between border-b border-border pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary-text">
              Story Mode · {Math.min(currentIndex + 1, scenes.length)} / {scenes.length}
            </p>
            <button ref={closeRef} type="button" className={iconControl} onClick={closeStoryMode} aria-label="스토리 모드 닫기">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-center overflow-y-auto py-8">
            <DialogTitle className="sr-only">{manifest.title} 스토리 모드</DialogTitle>
            <DialogDescription className="sr-only">본문을 장면별로 읽는 풀스크린 재생 화면입니다.</DialogDescription>
            {scene ? (
              <section key={scene.sceneId} aria-live="polite" data-story-mode-scene={scene.sceneId}>
                <p className="mb-4 text-sm font-semibold text-primary">{sceneLabel(scene)}</p>
                <h2 className="max-w-2xl text-3xl font-bold leading-tight text-primary-text sm:text-5xl">{manifest.title}</h2>
                <div className="mt-8 max-w-2xl space-y-4 text-lg leading-8 text-secondary-text sm:text-2xl sm:leading-10">
                  {sceneLines.map((line, index) => (
                    <motion.p
                      key={`${scene.sceneId}-${index}`}
                      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 0.42, delay: index * 0.16, ease: "easeOut" }}
                    >
                      {line}
                    </motion.p>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-3xl border-t border-border pt-4">
            <div className="mb-4 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary motion-reduce:transition-none" style={{ width: `${((currentIndex + 1) / Math.max(scenes.length, 1)) * 100}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className={control} onClick={goPrevious} disabled={currentIndex === 0}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>이전</span>
              </button>
              <div className="flex items-center gap-2">
                {!reducedMotion ? (
                  <button
                    type="button"
                    className={iconControl}
                    onClick={() => setPlaying((value) => !value)}
                    aria-label={playing ? "자동 재생 일시정지" : "자동 재생 시작"}
                    aria-pressed={playing}
                  >
                    {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                  </button>
                ) : <span className="px-2 text-xs text-secondary-text">자동 재생 꺼짐</span>}
                <button type="button" className={`${control} bg-primary`} onClick={goNext}>
                  <span>{lastScene ? "본문으로 돌아가기" : "다음"}</span>
                  {lastScene ? null : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
