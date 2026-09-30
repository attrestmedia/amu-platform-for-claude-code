"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  ExternalLink,
  Pencil,
  Sparkles,
  Trash2,
  Check,
  X,
  Folder,
  CircleCheck,
  RotateCcw,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IScrapeLinkCategory, IScrapeLinkItem } from "libs/api/mini-app/scrapeLinks";
import { scrapeWebContent } from "libs/api/thirdparty/scraper";
import type { IWebScrapeContentResponse } from "types/thirdparty";
import { toErrorMessage } from "utils/common";
import { UNCATEGORIZED_CATEGORY_VALUE } from "./categoryConstants";

interface Props {
  item: IScrapeLinkItem;
  selected: boolean;
  onToggleSelected: (next: boolean) => void;
  onToggleChecked: (next: boolean) => void;
  onSaveLabel: (label: string) => void;
  onDelete: () => void;
  onFetchOg: () => void;
  categories: IScrapeLinkCategory[];
  onChangeCategory: (categoryId: string) => void;
}

export function LinkRow({
  item,
  selected,
  onToggleSelected,
  onToggleChecked,
  onSaveLabel,
  onDelete,
  onFetchOg,
  categories,
  onChangeCategory,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const [contentOpen, setContentOpen] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [content, setContent] = useState<IWebScrapeContentResponse | null>(null);

  useEffect(
    function resyncDraftWhenEditingClosed() {
      // editing(외부 상태) 해제 시 draft를 prop label 값으로 되돌림
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!editing) setDraft(item.label);
    },
    [editing, item.label],
  );

  const displayLabel = item.label || item.ogTitle || item.domain || item.url;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      toast.success(lang({ ko: "복사됨", en: "Copied" }));
    } catch {
      toast.error(lang({ ko: "복사 실패", en: "Copy failed" }));
    }
  };

  const commitLabel = () => {
    const trimmed = draft.trim();
    if (trimmed !== item.label) onSaveLabel(trimmed);
    setEditing(false);
  };

  const cancelLabel = () => {
    setDraft(item.label);
    setEditing(false);
  };

  const openContent = async () => {
    setContentOpen(true);
    if (content || contentLoading) return;
    setContentLoading(true);
    try {
      const result = await scrapeWebContent({ url: item.url });
      setContent(result);
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, lang({ ko: "본문을 가져오지 못했습니다.", en: "Failed to fetch content." })));
      setContentOpen(false);
    } finally {
      setContentLoading(false);
    }
  };

  const handleCopyContent = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(`${content.title}\n${content.finalUrl}\n\n${content.text}`);
      toast.success(lang({ ko: "본문을 복사했습니다.", en: "Copied content." }));
    } catch {
      toast.error(lang({ ko: "복사 실패", en: "Copy failed" }));
    }
  };

  return (
    <li
      className={`flex items-start gap-3 rounded-xl border bg-surface p-3 transition ${
        selected ? "border-primary ring-1 ring-primary/40" : "border-border"
      } ${item.checked ? "opacity-60" : ""}`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(v) => onToggleSelected(Boolean(v))}
        className="mt-1"
        aria-label={lang({ ko: "선택", en: "Select" })}
      />

      {item.ogImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.ogImage} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xxs font-semibold uppercase text-primary">
          {(item.domain || "").replace(/^(?:www|m|mobile)\./i, "").slice(0, 2)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitLabel();
                    if (e.key === "Escape") cancelLabel();
                  }}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  placeholder={lang({ ko: "라벨 입력", en: "Enter label" })}
                  maxLength={240}
                />
                <Button size="icon-sm" variant="ghost" onClick={commitLabel} aria-label="save">
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={cancelLabel} aria-label="cancel">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`group flex w-full items-center gap-1 text-left text-sm font-semibold ${
                  item.checked ? "line-through" : ""
                }`}
              >
                <span className="truncate">{displayLabel}</span>
                <Pencil className="h-3 w-3 flex-shrink-0 text-secondary-text opacity-0 transition group-hover:opacity-100" />
              </button>
            )}

            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block truncate text-xs text-primary hover:underline"
            >
              {item.url}
            </a>

            {item.ogDescription ? (
              <p className="mt-1 line-clamp-2 text-xs text-secondary-text">{item.ogDescription}</p>
            ) : null}
          </div>

          <Select
            value={item.categoryId || UNCATEGORIZED_CATEGORY_VALUE}
            onValueChange={(value) => onChangeCategory(String(value || UNCATEGORIZED_CATEGORY_VALUE))}
          >
            <SelectTrigger
              size="xs"
              className="flex-shrink-0 gap-2 bg-background max-w-32 [&>span]:flex-1"
              aria-label={lang({ ko: "카테고리", en: "Category" })}
            >
              <Folder className="h-3 w-3 text-secondary-text" />
              <SelectValue placeholder={lang({ ko: "카테고리", en: "Category" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNCATEGORIZED_CATEGORY_VALUE}>
                <Lang text={{ ko: "미분류", en: "Uncategorized" }} />
              </SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button size="xs" variant="ghost" onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="mr-1 h-3 w-3" />
            <Lang text={{ ko: "열기", en: "Open" }} />
          </Button>
          <Button size="xs" variant="ghost" onClick={handleCopy}>
            <Copy className="mr-1 h-3 w-3" />
            <Lang text={{ ko: "복사", en: "Copy" }} />
          </Button>
          <Button size="xs" variant="ghost" onClick={openContent}>
            <FileText className="mr-1 h-3 w-3" />
            <Lang text={{ ko: "본문", en: "Content" }} />
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onToggleChecked(!item.checked)} aria-pressed={item.checked}>
            {item.checked ? (
              <>
                <RotateCcw className="mr-1 h-3 w-3" />
                <Lang text={{ ko: "미확인", en: "Unread" }} />
              </>
            ) : (
              <>
                <CircleCheck className="mr-1 h-3 w-3" />
                <Lang text={{ ko: "확인", en: "Done" }} />
              </>
            )}
          </Button>
          <Button size="xs" variant="ghost" onClick={onFetchOg} disabled={item.ogStatus === "pending"}>
            <Sparkles className="mr-1 h-3 w-3" />
            <Lang
              text={
                item.ogStatus === "success" ? { ko: "OG 다시", en: "OG refetch" } : { ko: "OG 라벨", en: "OG label" }
              }
            />
          </Button>
          <Button size="xs" variant="ghost" onClick={onDelete}>
            <Trash2 className="mr-1 h-3 w-3" />
            <Lang text={{ ko: "삭제", en: "Delete" }} />
          </Button>
        </div>
      </div>

      <Dialog open={contentOpen} onOpenChange={setContentOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate text-left">{content?.title || displayLabel}</DialogTitle>
          </DialogHeader>

          {contentLoading ? (
            <div className="flex items-center justify-center py-12">
              <Preloader />
            </div>
          ) : content ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <a
                  href={content.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-primary hover:underline"
                >
                  <span className="truncate">{content.finalUrl}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
                <Button size="xs" variant="ghost" onClick={handleCopyContent}>
                  <Copy className="mr-1 h-3 w-3" />
                  <Lang text={{ ko: "복사", en: "Copy" }} />
                </Button>
              </div>
              <pre className="max-h-[calc(100vh-20rem)] overflow-auto scrollbar-ghost whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-6 text-primary-text">
                {content.text}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}
