"use client";

import { type ReactNode } from "react";
import { Badge, Pagination, Preloader } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang } from "components/module/i18n";
import type { ImagePromptMetaType } from "types/app";
import { cn } from "utils/common";
import { Eye } from "lucide-react";
import { STUDIO_GENERATION_SOURCE_SERVICE_LABELS } from "consts/app";

type LocalizedText = {
  ko: string;
  en: string;
};

type StudioImageGalleryProps = {
  items: ImagePromptMetaType[];
  loading?: boolean;
  emptyText: LocalizedText;
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onSelect?: (item: ImagePromptMetaType, index: number) => void;
  renderActions?: (item: ImagePromptMetaType) => ReactNode;
  className?: string;
  showSource?: boolean;
};

function formatCreatedAt(value: ImagePromptMetaType["createdAt"]) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

export function StudioImageGallery({
  items,
  loading = false,
  emptyText,
  page,
  pageSize,
  totalItems,
  onPageChange,
  onSelect,
  renderActions,
  className,
  showSource = false,
}: StudioImageGalleryProps) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page)), totalPages);

  const goToPage = (nextPage: number) => {
    onPageChange(Math.min(Math.max(1, Math.floor(nextPage)), totalPages));
  };

  if (loading) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed p-6">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <Preloader variant="spin" size="md" />
          <p className="text-center text-xs text-muted-foreground">
            <Lang text={{ ko: "이미지를 불러오는 중입니다.", en: "Loading images." }} />
          </p>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          <Lang text={emptyText} />
        </p>
      </div>
    );
  }

  return (
    <section className={cn("space-y-5", className)}>
      <div className="grid gap-3 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((item, index) => {
          const title = item.templateTitle || item.templateKey || item.assetId;
          const createdAt = formatCreatedAt(item.createdAt);

          return (
            <article
              key={item.assetId || item.url}
              className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-input bg-card text-left shadow-sm"
            >
              <button
                type="button"
                onClick={() => onSelect?.(item, index)}
                className="relative aspect-[4/3] w-full overflow-hidden bg-muted text-left"
              >
                <ImageBox
                  src={item.url}
                  alt={title}
                  className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                  objectFit="object-cover"
                  objectPosition="object-center"
                  width="100%"
                  height="100%"
                  sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                />
                <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-primary-text shadow-sm">
                  <Eye className="icon-xs" aria-hidden />
                </span>
              </button>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-card-foreground">{title}</p>
                    <p className="mt-0.5 truncate font-mono text-xxs text-muted-foreground">{item.assetId}</p>
                  </div>
                  <Badge
                    variant="outline"
                    size="xs"
                    className={cn(
                      "shrink-0 text-xxs",
                      item.visibility === "private"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-primary/10 bg-primary/10 text-primary",
                    )}
                  >
                    <Lang
                      text={
                        item.visibility === "private" ? { ko: "비공개", en: "Private" } : { ko: "공개", en: "Public" }
                      }
                    />
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {showSource ? (
                    <Badge variant="outline" size="xs" className="border-primary/20 bg-primary/5 text-xxs text-primary">
                      <Lang text={STUDIO_GENERATION_SOURCE_SERVICE_LABELS[item.sourceService || "unknown"]} />
                    </Badge>
                  ) : null}
                  {item.templateKey ? (
                    <Badge variant="outline" size="xs" className="max-w-full truncate text-xxs text-muted-foreground">
                      {item.templateKey}
                    </Badge>
                  ) : null}
                  {createdAt ? (
                    <Badge variant="outline" size="xs" className="text-xxs text-muted-foreground">
                      {createdAt}
                    </Badge>
                  ) : null}
                </div>

                {item.extraPrompt ? (
                  <p className="line-clamp-2 text-xs leading-5 text-secondary-text">{item.extraPrompt}</p>
                ) : null}

                {renderActions ? <div className="mt-auto flex items-center gap-2">{renderActions(item)}</div> : null}
              </div>
            </article>
          );
        })}
      </div>

      <Pagination page={currentPage} pageSize={safePageSize} totalItems={totalItems} onPageChange={goToPage} />
    </section>
  );
}
