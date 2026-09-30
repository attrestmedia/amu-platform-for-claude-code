"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Badge, Checkbox, TooltipBasic } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { escapeRegExp } from "utils/normalize";
import { renderAspectOptionLabel } from "utils/ai";
import { DEFAULT_IMAGE_ASPECT, DEFAULT_IMAGE_SIZE, ASPECT_TO_OPENAI_COMPAT_SIZE } from "consts/ai";
import type { ImageProviderType } from "types/ai";
import { clampAspectForProvider } from "utils/app";
import { resolveImageReferencePolicy } from "utils/lab";
import type { PromptItemType, PromptSearchFieldType } from "types/app";
import { ImagePlus } from "lucide-react";

export function PresetCard({
  item,
  modelName,
  onSelect,
  highlightQuery = "",
  highlightField = "all",
  contentOnly,
  showMatchedTagsOnly = false,
  selectionMode = false,
  selected = false,
  onSelectionChange,
}: {
  item: PromptItemType;
  modelName: string;
  onSelect: () => void;
  highlightQuery?: string;
  highlightField?: PromptSearchFieldType;
  contentOnly?: boolean;
  showMatchedTagsOnly?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionChange?: (selected: boolean) => void;
}) {
  const query = highlightQuery.trim();
  const queryLower = query.toLowerCase();
  const canHighlight = (field: "all" | "key" | "title" | "categories" | "tags") =>
    Boolean(query) && (highlightField === "all" || highlightField === field);
  const renderHighlight = (text: string) => {
    if (!query || !text) return text;
    const re = new RegExp(`(${escapeRegExp(query)})`, "ig");
    const parts = String(text).split(re);
    if (parts.length === 1) return text;
    return parts.map((part, idx) =>
      idx % 2 === 1 ? (
        <mark key={`${part}-${idx}`} className="rounded-sm bg-yellow-200/70 px-0.5 text-inherit">
          {part}
        </mark>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      ),
    );
  };

  const dp = item.defaultParams || {};
  const samplesByModel = (dp.modelSamples || {}) as Record<string, string[]>;
  const byCurrentModel = samplesByModel[modelName] || [];
  const preview: string = byCurrentModel[0] || (dp.previewImage as string) || "";

  const prov: ImageProviderType =
    dp?.provider === "openai" || dp?.provider === "xai" || dp?.provider === "google" ? dp.provider : "google";
  const referencePolicy = resolveImageReferencePolicy(item.inputPolicy, prov);
  const aspectLabel = dp.aspectRatio ? clampAspectForProvider(prov, String(dp.aspectRatio), modelName) : null;
  const sizeLabel =
    prov === "openai" || prov === "xai"
      ? String(
          ASPECT_TO_OPENAI_COMPAT_SIZE[aspectLabel || clampAspectForProvider(prov, DEFAULT_IMAGE_ASPECT, modelName)] ||
            DEFAULT_IMAGE_SIZE,
        )
      : dp.size
        ? String(dp.size)
        : null;
  const tags = item.tags || [];
  const categoryKeySet = new Set((item.categories || []).map((cat) => cat.trim().toLowerCase()));
  const extraTags = tags.filter((tag, index, arr) => {
    const normalizedTag = tag.trim().toLowerCase();

    if (!normalizedTag) return false;
    if (categoryKeySet.has(normalizedTag)) return false;

    return arr.findIndex((nextTag) => nextTag.trim().toLowerCase() === normalizedTag) === index;
  });
  const matchedExtraTags = extraTags.filter((tag) => tag.toLowerCase().includes(queryLower));
  const shouldShowMatchedTagsOnly = showMatchedTagsOnly && canHighlight("tags") && matchedExtraTags.length > 0;
  const expandableTags = shouldShowMatchedTagsOnly ? matchedExtraTags : extraTags;
  const hasExpandableTags = expandableTags.length > 0;
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  const handleToggleTags = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsTagsExpanded((prev) => !prev);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleCardKeyDown}
      className={cn(
        !contentOnly &&
          "group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-input bg-card text-left shadow-sm",
        !contentOnly && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50",
        !contentOnly &&
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {preview ? (
        <div className="relative w-full bg-muted aspect-[4/3] overflow-hidden">
          <ImageBox
            src={preview}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {/* 오버레이 그라데이션 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-2 p-3")}>
        <div className="flex min-w-0 items-center gap-2">
          {selectionMode ? (
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelectionChange?.(checked === true)}
              onClick={(event) => event.stopPropagation()}
              aria-label={lang({
                ko: `${item.title} 템플릿 선택`,
                en: `Select ${item.title} template`,
              })}
            />
          ) : null}
          <p className="min-w-0 cursor-pointer text-left text-base font-semibold text-card-foreground hover:text-primary">
            {canHighlight("title") ? renderHighlight(item.title) : item.title}
          </p>
        </div>
        {canHighlight("key") && item.key.toLowerCase().includes(queryLower) && (
          <p className="text-xxs text-muted-foreground font-mono truncate">{renderHighlight(item.key)}</p>
        )}
        {/* <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed text-left">{item.templateText}</p> */}
        <div className="mt-auto flex flex-wrap items-center gap-1">
          {referencePolicy.required && (
            <TooltipBasic
              trigger="click"
              triggerAs="span"
              autoClose
              ariaLabel={lang({
                ko: "첨부 이미지 필수 안내",
                en: "Image requirement information",
              })}
              triggerClassName="w-fit shrink-0"
              icon={
                <Badge
                  variant="outline"
                  size="xs"
                  className="cursor-help border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                >
                  <ImagePlus className="icon-xxs" aria-hidden />
                  <Lang text={{ ko: "첨부 이미지 필수", en: "Image required" }} />
                </Badge>
              }
            >
              <p className="text-muted-foreground truncate text-xs">
                <Lang
                  text={{
                    ko: "첨부 이미지가 필요해요.",
                    en: "An image attachment is required.",
                  }}
                />
              </p>
            </TooltipBasic>
          )}
          {item.categories?.map((cat) => (
            <Badge
              key={cat}
              variant="outline"
              size="xs"
              className="border-primary/10 bg-primary/10 text-xxs text-primary"
            >
              {canHighlight("categories") ? renderHighlight(cat) : cat}
            </Badge>
          ))}
          {aspectLabel && (
            <Badge variant="outline" size="xs" className="text-xxs text-muted-foreground">
              {renderAspectOptionLabel(aspectLabel)}
            </Badge>
          )}
          {sizeLabel && (
            <Badge variant="outline" size="xs" className="text-xxs text-muted-foreground">
              {sizeLabel}
            </Badge>
          )}
          {hasExpandableTags && (
            <Badge
              variant="outline"
              size="xs"
              aria-expanded={isTagsExpanded}
              aria-label={isTagsExpanded ? "태그 접기" : "태그 더보기"}
              className={cn(
                "border-border text-muted",
                isTagsExpanded && "border-border bg-background text-foreground/60",
              )}
              onClick={handleToggleTags}
            >
              {isTagsExpanded ? "접기" : `+${expandableTags.length}`}
            </Badge>
          )}
        </div>
        {isTagsExpanded && hasExpandableTags && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {expandableTags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                size="xs"
                className="border-none bg-background text-xxs text-foreground/60"
              >
                {canHighlight("tags") ? renderHighlight(tag) : tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
