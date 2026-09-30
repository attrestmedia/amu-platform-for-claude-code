"use client";

import type { ImagePromptMetaType, PromptVisibilityType } from "types/app";
import { Badge, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ChevronsUpDown, X } from "lucide-react";
import { cn } from "utils/common";
import { ImagePreviewRail } from "../ImagePreviewRail";
import { RecentImageFilterControls } from "./RecentImageFilterControls";
import type { RecentOwnerFilterType, RecentVisibilityFilterType } from "./types";

/**
 * Result Viewer (계약 §3.3) — 사용자 본인의 생성 결과 전용 공간.
 * Phase 3: 기존 PresetDetailWidget에서 summary 모드를 제거하고 Result 전용으로 축소.
 * - 우선순위 1: 현재 생성 batch / 2: 이 화면에서 사용자가 최근 생성한 결과
 * - 공개 Gallery·Discovery·개인 전체 라이브러리는 책임에 포함하지 않는다
 * - stale 배너: Generation Fingerprint 불일치 시 표시(§3.7)
 */

type GalleryStateType = {
  sourceImageCount: number;
  images: string[];
  metaBySrc: Record<string, ImagePromptMetaType>;
  isGenerating: boolean;
  sortText: { ko: string; en: string };
  togglingSrc: string | null;
};

type GalleryFilterType = {
  enabled: boolean;
  owner: RecentOwnerFilterType;
  visibility: RecentVisibilityFilterType;
  showVisibilityButtons: boolean;
  onChangeOwner: (value: RecentOwnerFilterType) => void;
  onChangeVisibility: (value: RecentVisibilityFilterType) => void;
};

type GalleryActionsType = {
  onCycleSort: () => void;
  onSelect: (src: string, index: number) => void;
  onToggleVisibility: (src: string, next: PromptVisibilityType) => Promise<void> | void;
};

export function GalleryContent({
  gallery,
  filter,
  actions,
}: {
  gallery: GalleryStateType;
  filter: GalleryFilterType;
  actions: GalleryActionsType;
}) {
  return (
    <div className="flex flex-col">
      {filter.enabled ? (
        <div className="px-3 pb-2 pt-3">
          <RecentImageFilterControls
            ownerFilter={filter.owner}
            onChangeOwnerFilter={filter.onChangeOwner}
            visibilityFilter={filter.visibility}
            onChangeVisibilityFilter={filter.onChangeVisibility}
            showVisibilityFilterButtons={filter.showVisibilityButtons}
            hideLabel={false}
          />
        </div>
      ) : null}
      {gallery.images.length > 0 || gallery.isGenerating ? (
        <ImagePreviewRail
          layout="grid"
          images={gallery.images}
          metaBySrc={gallery.metaBySrc}
          onToggleVisibility={filter.enabled ? actions.onToggleVisibility : undefined}
          togglingSrc={gallery.togglingSrc}
          onSelect={actions.onSelect}
          className="pb-3 pt-2"
          innerClassName="gap-3 pb-1"
          isGenerating={gallery.isGenerating}
        />
      ) : (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          <Lang
            text={{
              ko: "아직 생성 결과가 없습니다.",
              en: "No generation results yet.",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ResultViewerStaleBanner() {
  return (
    <div
      aria-live="polite"
      className="mx-3 mb-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700"
    >
      <Lang
        text={{
          ko: "현재 결과는 이전 설정으로 생성되었습니다.",
          en: "These results were generated with previous settings.",
        }}
      />
    </div>
  );
}

export function ResultViewerHeader({
  imageCount,
  sortText,
  onCycleSort,
  onClose,
  headingRef,
}: {
  imageCount: number;
  sortText: { ko: string; en: string };
  onCycleSort: () => void;
  onClose: () => void;
  headingRef?: React.RefObject<HTMLParagraphElement | null>;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1.5 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <p ref={headingRef} tabIndex={-1} className="truncate text-sm font-medium text-foreground outline-none">
          <Lang text={{ ko: "생성 결과", en: "Results" }} />
        </p>
        {imageCount > 1 ? (
          <Badge variant="outline" size="xs" className="text-xxs font-mono tracking-wider">
            {imageCount}
            <Lang text={{ ko: "장", en: " images" }} />
          </Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Badge
          role="button"
          tabIndex={0}
          variant="outline"
          size="xs"
          className="cursor-pointer select-none border-none bg-background pl-2.5 pr-2 py-1 text-xxs font-medium"
          aria-label={lang({
            ko: `${sortText.ko}, 클릭하면 다음 정렬로 변경`,
            en: `${sortText.en}, click to change sort`,
          })}
          onClick={onCycleSort}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onCycleSort();
          }}
        >
          <Lang text={sortText} />
          <ChevronsUpDown className="ml-1 h-3 w-3 opacity-70" />
        </Badge>
        <Button
          variant="blank"
          size="icon-xs"
          rounded="full"
          onClick={onClose}
          aria-label={lang({ ko: "생성 결과 닫기", en: "Close results" })}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export type ResultViewerGalleryStateType = GalleryStateType;
export type ResultViewerGalleryFilterType = GalleryFilterType;
export type ResultViewerGalleryActionsType = GalleryActionsType;

export function ResultViewerBody({
  gallery,
  filter,
  actions,
  stale,
}: {
  gallery: GalleryStateType;
  filter: GalleryFilterType;
  actions: GalleryActionsType;
  stale: boolean;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col")}>
      {stale ? <ResultViewerStaleBanner /> : null}
      <GalleryContent gallery={gallery} filter={filter} actions={actions} />
    </div>
  );
}
