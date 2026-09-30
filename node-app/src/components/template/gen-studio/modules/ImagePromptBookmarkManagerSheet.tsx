"use client";

import { useMemo, useState } from "react";
import { Lang, lang } from "components/module/i18n";
import { Badge, Button, Input, Sheet, SheetContent } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Search, Trash2 } from "lucide-react";
import type { PromptItemType } from "types/app";
import { TemplateBookmarkButton } from "./TemplateBookmarkButton";
import { cn } from "utils/common";

type ImagePromptBookmarkManagerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & ImagePromptBookmarkManagerPanelProps;

type ImagePromptBookmarkManagerPanelProps = {
  promptType?: "image" | "content";
  items: PromptItemType[];
  pendingByKey?: Record<string, boolean>;
  onOpenTemplate: (item: PromptItemType) => void;
  onToggleBookmark: (templateKey: string, bookmarked: boolean) => void;
  onClearAll: () => void;
  className?: string;
};

function getPreviewImage(item: PromptItemType) {
  const defaultPreview = String(item.defaultParams?.previewImage || "").trim();
  if (defaultPreview) return defaultPreview;

  const samples = item.defaultParams?.modelSamples;
  if (!samples || typeof samples !== "object") return "";

  for (const value of Object.values(samples)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const sample = String(value[0] || "").trim();
    if (sample) return sample;
  }

  return "";
}

export function ImagePromptBookmarkManagerPanel({
  promptType = "image",
  items,
  pendingByKey,
  onOpenTemplate,
  onToggleBookmark,
  onClearAll,
  className,
}: ImagePromptBookmarkManagerPanelProps) {
  const [q, setQ] = useState("");

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) => {
      return [item.key, item.title, ...(item.categories || []), ...(item.tags || [])].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );
    });
  }, [items, q]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b px-4 py-4 text-left">
        <h3 className="text-base font-semibold">
          <Lang
            text={
              promptType === "content"
                ? { ko: "콘텐츠 템플릿 북마크", en: "Content Template Bookmarks" }
                : { ko: "이미지 템플릿 북마크", en: "Image Template Bookmarks" }
            }
          />
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">
          <Lang
            text={{
              ko:
                promptType === "content"
                  ? "자주 쓰는 콘텐츠 템플릿을 다시 열거나 바로 정리할 수 있습니다."
                  : "자주 쓰는 이미지 템플릿을 다시 열거나 바로 정리할 수 있습니다.",
              en:
                promptType === "content"
                  ? "Reopen or clean up your frequently used content templates."
                  : "Reopen or clean up your frequently used image templates.",
            }}
          />
        </p>
      </div>

      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={lang({
              ko: promptType === "content" ? "콘텐츠 템플릿 검색" : "이미지 템플릿 검색",
              en: promptType === "content" ? "Search content templates" : "Search image templates",
            })}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClearAll}
          disabled={items.length === 0}
          className="shrink-0 gap-1.5"
        >
          <Trash2 className="h-4 w-4" />
          <Lang text={{ ko: "전체 해제", en: "Clear all" }} />
        </Button>
      </div>

      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span>
          <Lang text={{ ko: "저장된 템플릿", en: "Saved templates" }} />
        </span>
        <Badge variant="outline" size="xs" className="font-mono">
          {items.length}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              <Lang
                text={{
                  ko:
                    items.length === 0
                      ? "아직 저장한 템플릿이 없습니다."
                      : "검색 조건에 맞는 템플릿 북마크가 없습니다.",
                  en:
                    items.length === 0
                      ? "You have not saved any templates yet."
                      : "No template bookmarks match your search.",
                }}
              />
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const preview = getPreviewImage(item);
              const isPending = Boolean(pendingByKey?.[item.key]);

              return (
                <div
                  key={item.key}
                  className="rounded-2xl border border-border/80 bg-card/80 p-3 shadow-sm transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenTemplate(item)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                        {preview ? (
                          <ImageBox src={preview} alt={item.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xxs text-muted-foreground">
                            <Lang text={{ ko: "미리보기 없음", en: "No preview" }} />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="truncate font-mono text-xxs text-muted-foreground">{item.key}</p>

                        <div className="flex flex-wrap gap-1 pt-1">
                          {(item.categories || []).slice(0, 2).map((category) => (
                            <Badge
                              key={category}
                              variant="outline"
                              size="xs"
                              className="border-none bg-primary/10 text-primary"
                            >
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </button>

                    <TemplateBookmarkButton
                      active
                      loading={isPending}
                      onClick={() => onToggleBookmark(item.key, false)}
                      className="mt-0.5"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ImagePromptBookmarkManagerSheet({
  open,
  onOpenChange,
  ...panelProps
}: ImagePromptBookmarkManagerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-none p-0 sm:max-w-[28rem]">
        <ImagePromptBookmarkManagerPanel {...panelProps} />
      </SheetContent>
    </Sheet>
  );
}
