"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Lang, lang } from "components/module/i18n";
import { Button, Dropdown, Pagination, Preloader } from "@amu-labs/ui";
import type { PromptItemType, PromptSearchFieldType } from "types/app";
import { cn } from "utils/common";
import { getGenStudioTemplateArticleUrl, type GenStudioTemplateGuideKind } from "utils/app";
import { GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY } from "consts/app";
import { ExternalLink, MoreVertical } from "lucide-react";
import {
  GenStudioPromptToolbar,
  type GenStudioPromptToolbarAction,
  type GenStudioSearchMode,
  type LocalizedText,
} from "./GenStudioPromptToolbar";

export const STUDIO_TEMPLATE_GALLERY_PAGE_SIZE = 30;

type StudioTemplateGalleryProps = {
  items: PromptItemType[];
  searchField: PromptSearchFieldType;
  onSearchFieldChange: (value: PromptSearchFieldType) => void;
  query: string;
  onQueryChange: (value: string) => void;
  emptyText: LocalizedText;
  loading?: boolean;
  loadingText?: LocalizedText;
  pageSize?: number;
  page?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  resetKey?: string;
  searchPlaceholder?: LocalizedText;
  bookmark?: GenStudioPromptToolbarAction;
  manage?: GenStudioPromptToolbarAction;
  groupManage?: GenStudioPromptToolbarAction;
  customPrompt?: GenStudioPromptToolbarAction;
  searchMode?: GenStudioSearchMode;
  onSearchModeChange?: (mode: GenStudioSearchMode) => void;
  searchFieldOptions?: Array<{ value: string; label: { ko: string; en: string } }>;
  selectionBar?: ReactNode;
  notice?: ReactNode;
  recommendedItems?: PromptItemType[];
  recommendedTitle?: LocalizedText;
  recommendedDescription?: LocalizedText;
  templateGuideKind?: GenStudioTemplateGuideKind;
  className?: string;
  gridClassName?: string;
  onVisibleItemsChange?: (items: PromptItemType[]) => void;
  onTemplateSelect?: (item: PromptItemType) => void;
  renderItem: (item: PromptItemType) => ReactNode;
};

type GalleryPaginationState = {
  key: string;
  page: number;
};

export function StudioTemplateGallery({
  items,
  searchField,
  onSearchFieldChange,
  query,
  onQueryChange,
  emptyText,
  loading = false,
  loadingText = { ko: "템플릿 목록을 불러오는 중입니다.", en: "Loading templates." },
  pageSize = STUDIO_TEMPLATE_GALLERY_PAGE_SIZE,
  page,
  totalItems,
  onPageChange,
  resetKey,
  searchPlaceholder,
  bookmark,
  manage,
  groupManage,
  customPrompt,
  searchMode,
  onSearchModeChange,
  searchFieldOptions,
  selectionBar,
  notice,
  recommendedItems = [],
  recommendedTitle = { ko: "추천 템플릿", en: "Recommended templates" },
  recommendedDescription,
  templateGuideKind = "image",
  className,
  gridClassName,
  onVisibleItemsChange,
  onTemplateSelect,
  renderItem,
}: StudioTemplateGalleryProps) {
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  const paginationKey = resetKey ?? [query, searchField].join("\u0000");
  const isControlledPagination = Boolean(onPageChange);
  const [pagination, setPagination] = useState<GalleryPaginationState>({
    key: paginationKey,
    page: 1,
  });
  const effectivePagination =
    isControlledPagination || pagination.key === paginationKey ? pagination : { key: paginationKey, page: 1 };
  const total = Math.max(0, Math.floor(totalItems ?? items.length));
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page ?? effectivePagination.page)), totalPages);
  const visibleItems = useMemo(() => {
    if (isControlledPagination) return items;
    const start = (currentPage - 1) * normalizedPageSize;
    return items.slice(start, start + normalizedPageSize);
  }, [currentPage, isControlledPagination, items, normalizedPageSize]);
  const hasRecommendedItems = recommendedItems.length > 0;

  useEffect(() => {
    onVisibleItemsChange?.(visibleItems);
  }, [onVisibleItemsChange, visibleItems]);

  const handlePageChange = (nextPage: number) => {
    const safePage = Math.min(Math.max(1, Math.floor(nextPage)), totalPages);
    if (isControlledPagination) {
      onPageChange?.(safePage);
      return;
    }
    setPagination({ key: paginationKey, page: safePage });
  };

  const renderTemplateTile = (item: PromptItemType, keyPrefix = "template") => {
    const isCustomTemplate = item.key === GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY;
    const articleUrl = isCustomTemplate ? "" : getGenStudioTemplateArticleUrl(item.key, templateGuideKind);
    return (
      <div
        key={`${keyPrefix}-${item.key}`}
        className={cn(
          "relative flex flex-col overflow-hidden rounded-xl border border-input bg-card text-left shadow-sm",
          isCustomTemplate && "border-2 border-accent",
        )}
      >
        {renderItem(item)}
        <div className="mx-3 mb-3 mt-auto flex items-center gap-2">
          {onTemplateSelect && (
            <>
              <Button
                variant="primary"
                size="sm"
                rounded="lg"
                className="min-w-0 flex-1"
                onClick={(event) => {
                  event.stopPropagation();
                  onTemplateSelect(item);
                }}
              >
                <Lang text={{ ko: "이 템플릿으로 생성하기", en: "Use this template" }} />
              </Button>

              {articleUrl && (
                <Dropdown
                  options={[
                    {
                      value: "template-guide",
                      label: lang({ ko: "템플릿 활용법 알아보기", en: "Learn how to use this template" }),
                    },
                  ]}
                  selected={null}
                  onSelect={() => window.open(articleUrl, "_blank", "noopener,noreferrer")}
                  renderTrigger={() => <MoreVertical className="icon-xs" aria-hidden />}
                  renderOption={() => (
                    <span className="inline-flex items-center gap-2">
                      <ExternalLink className="icon-xxs" aria-hidden />
                      <Lang text={{ ko: "템플릿 활용법 알아보기", en: "Learn how to use this template" }} />
                    </span>
                  )}
                  hideArrow
                  openPortal
                  openSide="top"
                  contentAlign="end"
                  triggerAriaLabel={lang({ ko: "템플릿 더보기", en: "More template actions" })}
                  className={cn(
                    "icon-sm justify-center rounded-full border border-border/60 p-0 text-secondary-text",
                    "hover:border-secondary-sub/30 hover:bg-secondary-sub/10",
                  )}
                  dropdownClassName="min-w-[220px] rounded-lg"
                  itemClassName="text-xs font-medium flex items-center"
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className={cn("w-full", className)}>
      <GenStudioPromptToolbar
        searchField={searchField}
        onSearchFieldChange={(value) => onSearchFieldChange(value as PromptSearchFieldType)}
        query={query}
        onQueryChange={onQueryChange}
        searchPlaceholder={searchPlaceholder}
        bookmark={bookmark}
        manage={manage}
        groupManage={groupManage}
        customPrompt={customPrompt}
        searchMode={searchMode}
        onSearchModeChange={onSearchModeChange}
        searchFieldOptions={searchFieldOptions}
      />
      {selectionBar}
      {notice}

      {hasRecommendedItems ? (
        <div className="mb-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-primary-text">
              <Lang text={recommendedTitle} />
            </h2>
            {recommendedDescription ? (
              <p className="mt-1 text-xs leading-5 text-secondary-text">
                <Lang text={recommendedDescription} />
              </p>
            ) : null}
          </div>
          <div className={cn("grid gap-3 sm:grid-cols-3 lg:grid-cols-4", gridClassName)}>
            {recommendedItems.map((item) => renderTemplateTile(item, "recommended"))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed p-6">
          <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
            <Preloader variant="spin" size="md" />
            <p className="text-center text-xs text-muted-foreground">
              <Lang text={loadingText} />
            </p>
          </div>
        </div>
      ) : items.length === 0 ? (
        hasRecommendedItems ? null : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              <Lang text={emptyText} />
            </p>
            {customPrompt ? (
              <Button variant="outline" size="sm" className="mt-4" onClick={customPrompt.onClick}>
                <Lang text={{ ko: "직접 프롬프트로 시작하기", en: "Start with a custom prompt" }} />
              </Button>
            ) : null}
          </div>
        )
      ) : (
        <>
          <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", gridClassName)}>
            {visibleItems.map((item) => renderTemplateTile(item))}
          </div>

          <Pagination
            page={currentPage}
            pageSize={normalizedPageSize}
            totalItems={total}
            disabled={loading}
            onPageChange={handlePageChange}
            className="mt-5"
          />
        </>
      )}
    </section>
  );
}
