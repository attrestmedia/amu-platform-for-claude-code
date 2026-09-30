"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  RefreshCcw,
  Sparkles,
  Search,
  CircleCheck,
  Folder,
  Trash2,
  X,
  RotateCcw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Checkbox, Input, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IScrapeLinkCategory, IScrapeLinkItem } from "libs/api/mini-app/scrapeLinks";
import { LinkRow } from "./LinkRow";
import { UNCATEGORIZED_CATEGORY_VALUE } from "./categoryConstants";
import { cn } from "src/utils/common";

const BULK_OPEN_LIMIT = 20;

type CheckedFilter = "all" | "todo" | "done";

interface Props {
  items: IScrapeLinkItem[];
  loading: boolean;
  filter: CheckedFilter;
  query: string;
  onFilterChange: (next: CheckedFilter) => void;
  onQueryChange: (next: string) => void;
  onReload: () => void;
  onToggleChecked: (item: IScrapeLinkItem, next: boolean) => void;
  onSaveLabel: (item: IScrapeLinkItem, label: string) => void;
  onDelete: (item: IScrapeLinkItem) => void;
  onFetchOg: (items: IScrapeLinkItem[]) => void;
  categories: IScrapeLinkCategory[];
  onChangeCategory: (item: IScrapeLinkItem, categoryId: string) => void;
  onDownload: () => void;
  selectedIds: string[];
  onToggleSelected: (id: string, next: boolean) => void;
  onSelectAll: (next: boolean) => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkChangeCategory: (categoryId: string) => void;
  onBulkToggleChecked: (next: boolean) => void;
  marketingUniverses: Array<{ id: string; name: string }>;
  marketingMaxBatchSize: number;
  marketingBusy: boolean;
  onEnqueueMarketing: (ids: string[], options: { universeId: string; queueCategory: string }) => void;
}

const FILTERS: Array<{ value: CheckedFilter; label: { ko: string; en: string } }> = [
  { value: "all", label: { ko: "전체", en: "All" } },
  { value: "todo", label: { ko: "미확인", en: "Unread" } },
  { value: "done", label: { ko: "확인 완료", en: "Done" } },
];

async function writeUrlsToClipboard(urls: string[]) {
  const text = urls.join("\n");
  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getUniqueUrls(items: IScrapeLinkItem[]) {
  return Array.from(new Set(items.map((it) => it.url).filter(Boolean)));
}

export function LinkList(props: Props) {
  const {
    items,
    loading,
    filter,
    query,
    onFilterChange,
    onQueryChange,
    onReload,
    selectedIds,
    onSelectAll,
    onClearSelection,
    onBulkDelete,
    onBulkChangeCategory,
    onBulkToggleChecked,
  } = props;

  const needsOg = useMemo(() => items.filter((it) => it.ogStatus !== "success"), [items]);
  const unreadCount = useMemo(() => items.filter((it) => !it.checked).length, [items]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectedCount = useMemo(
    () => items.reduce((acc, it) => acc + (selectedSet.has(it.id) ? 1 : 0), 0),
    [items, selectedSet],
  );
  const allChecked = items.length > 0 && visibleSelectedCount === items.length;
  const someChecked = visibleSelectedCount > 0 && visibleSelectedCount < items.length;
  const [bulkCategoryKey, setBulkCategoryKey] = useState(0);
  const selectedItems = useMemo(() => items.filter((it) => selectedSet.has(it.id)), [items, selectedSet]);
  const selectedNeedsOg = useMemo(() => selectedItems.filter((it) => it.ogStatus !== "pending"), [selectedItems]);
  const [marketingUniverseId, setMarketingUniverseId] = useState("");
  const [marketingQueueCategory, setMarketingQueueCategory] = useState("");
  const selectedUncategorizedCount = useMemo(
    () => selectedItems.filter((item) => !item.categoryId && !item.categoryName).length,
    [selectedItems],
  );

  const openUrlsInTabs = async (urls: string[]) => {
    const targets = Array.from(new Set(urls.filter(Boolean)));
    const blocked: string[] = [];
    const openBaseName = `scrape_links_${Date.now()}`;

    targets.forEach((url, index) => {
      const tab = window.open("about:blank", `${openBaseName}_${index}`);
      if (!tab) {
        blocked.push(url);
        return;
      }

      tab.opener = null;
      tab.location.replace(url);
    });

    const openedCount = targets.length - blocked.length;
    if (openedCount > 0) {
      toast.success(lang({ ko: `${openedCount}건 새 탭 열기 요청됨`, en: `Requested ${openedCount} new tabs` }));
    }

    if (blocked.length > 0) {
      const copied = await writeUrlsToClipboard(blocked);
      toast.warning(
        lang({
          ko: copied
            ? `${blocked.length}건이 브라우저에서 차단되어 URL을 복사했습니다. 팝업 허용 후 다시 시도하세요.`
            : `${blocked.length}건이 브라우저에서 차단되었습니다. 팝업 허용 후 다시 시도하세요.`,
          en: copied
            ? `${blocked.length} were blocked by the browser and copied. Allow pop-ups and try again.`
            : `${blocked.length} were blocked by the browser. Allow pop-ups and try again.`,
        }),
      );
    }
  };

  const bulkOpenSelected = () => {
    const targets = getUniqueUrls(selectedItems).slice(0, BULK_OPEN_LIMIT);
    if (!targets.length) return;
    void openUrlsInTabs(targets);
    if (selectedItems.length > BULK_OPEN_LIMIT) {
      toast.message(
        lang({
          ko: `상위 ${BULK_OPEN_LIMIT}건만 열렸습니다.`,
          en: `Opened top ${BULK_OPEN_LIMIT} only.`,
        }),
      );
    }
  };

  const bulkCopySelected = async () => {
    const urls = getUniqueUrls(selectedItems);
    if (!urls.length) return;
    try {
      await navigator.clipboard.writeText(urls.join("\n"));
      toast.success(
        lang({
          ko: `${urls.length}건 URL 복사됨`,
          en: `Copied ${urls.length} URLs`,
        }),
      );
    } catch {
      toast.error(lang({ ko: "복사 실패", en: "Copy failed" }));
    }
  };

  const bulkRefetchOg = () => {
    const targets = selectedNeedsOg.slice(0, BULK_OPEN_LIMIT);
    if (!targets.length) {
      toast.message(lang({ ko: "갱신할 항목이 없습니다.", en: "Nothing to refetch." }));
      return;
    }
    props.onFetchOg(targets);
  };

  const enqueueSelectedMarketing = () => {
    if (!selectedItems.length || !marketingUniverseId) return;
    if (selectedUncategorizedCount > 0 && !marketingQueueCategory.trim()) {
      toast.warning(
        lang({
          ko: `미분류 링크 ${selectedUncategorizedCount}건은 마케팅 queue 카테고리를 먼저 지정해야 합니다.`,
          en: `${selectedUncategorizedCount} uncategorized link(s) need a marketing queue category first.`,
        }),
      );
      return;
    }
    if (selectedItems.length > props.marketingMaxBatchSize) {
      toast.warning(
        lang({
          ko: `${selectedItems.length}건을 ${props.marketingMaxBatchSize}건 이하 묶음으로 나누어 등록합니다.`,
          en: `Submitting ${selectedItems.length} links in chunks of ${props.marketingMaxBatchSize}.`,
        }),
      );
    }
    props.onEnqueueMarketing(
      selectedItems.map((item) => item.id),
      {
        universeId: marketingUniverseId,
        queueCategory: marketingQueueCategory.trim(),
      },
    );
  };

  const openAll = () => {
    const urls = getUniqueUrls(items.filter((it) => !it.checked)).slice(0, BULK_OPEN_LIMIT);
    void openUrlsInTabs(urls);
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === f.value ? "bg-primary text-white" : "text-secondary-text"
              }`}
              onClick={() => onFilterChange(f.value)}
            >
              <Lang text={f.label} />
            </button>
          ))}
        </div>

        <div className="relative ml-auto max-w-48 pl-8">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-text" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={lang({ ko: "라벨/URL 검색", en: "Search label/URL" })}
            size="sm"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1">
        <Button size="xs" variant="ghost" onClick={onReload}>
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          <Lang text={{ ko: "새로고침", en: "Reload" }} />
        </Button>
        <Button size="xs" variant="ghost" onClick={openAll} disabled={unreadCount === 0}>
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          <Lang text={{ ko: "미확인 모두 열기", en: "Open all unread" }} />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={props.onDownload}
          disabled={items.length === 0}
          aria-label={lang({ ko: "텍스트로 다운로드", en: "Download as text" })}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          <Lang
            text={{
              ko: `다운로드 (${items.length})`,
              en: `Download (${items.length})`,
            }}
          />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => props.onFetchOg(needsOg.slice(0, 20))}
          disabled={needsOg.length === 0}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          <Lang
            text={{
              ko: `OG 자동 라벨 (${Math.min(needsOg.length, 20)})`,
              en: `Auto OG (${Math.min(needsOg.length, 20)})`,
            }}
          />
        </Button>
      </div>

      {items.length > 0 && visibleSelectedCount > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="flex items-center justify-between gap-4 w-full">
            <span className="inline-flex items-center gap-2">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={(v) => onSelectAll(Boolean(v))}
                aria-label={lang({ ko: "전체 선택", en: "Select all" })}
              />
              <span className="text-xs font-medium text-primary">
                <Lang
                  text={{
                    ko: `전체 선택(${visibleSelectedCount})`,
                    en: `Select All(${visibleSelectedCount})`,
                  }}
                />
              </span>
            </span>

            <span className="inline-flex items-center">
              <Select
                key={`bulk-category-${bulkCategoryKey}`}
                onValueChange={(v) => {
                  if (!v) return;
                  onBulkChangeCategory(String(v));
                  setBulkCategoryKey((k) => k + 1);
                }}
              >
                <SelectTrigger
                  size="xs"
                  className="bg-surface"
                  aria-label={lang({ ko: "카테고리 일괄 변경", en: "Bulk change category" })}
                >
                  <Folder className="h-3 w-3 flex-shrink-0 text-secondary-text mr-1" />
                  <SelectValue placeholder={lang({ ko: "카테고리 변경", en: "Change category" })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNCATEGORIZED_CATEGORY_VALUE}>
                    <Lang text={{ ko: "미분류", en: "Uncategorized" }} />
                  </SelectItem>
                  {props.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onClearSelection}
                aria-label={lang({ ko: "선택 해제", en: "Clear selection" })}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          </div>

          <div className="ml-auto flex flex-wrap items-center">
            {props.marketingUniverses.length > 0 ? (
              <div
                className={cn(
                  "flex items-center justify-between w-full rounded-lg border border-border/70 bg-surface px-1.5 py-1 mb-1",
                  selectedUncategorizedCount > 0 && "flex-wrap",
                )}
              >
                <div className="flex gap-1">
                  <Select value={marketingUniverseId} onValueChange={(v) => setMarketingUniverseId(String(v || ""))}>
                    <SelectTrigger
                      size="xs"
                      className="w-36 bg-background"
                      aria-label={lang({ ko: "마케팅 대상 유니버스", en: "Marketing target universe" })}
                    >
                      <SelectValue placeholder={lang({ ko: "유니버스", en: "Universe" })} />
                    </SelectTrigger>
                    <SelectContent>
                      {props.marketingUniverses.map((universe) => (
                        <SelectItem key={universe.id} value={universe.id}>
                          {universe.name || universe.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    size="xs"
                    value={marketingQueueCategory}
                    onChange={(event) => setMarketingQueueCategory(event.target.value)}
                    className="bg-background"
                    inputContainerClassName="w-auto"
                    placeholder={lang({ ko: "미분류용", en: "Uncategorized" })}
                    aria-label={lang({ ko: "마케팅 queue 카테고리", en: "Marketing queue category" })}
                  />
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={enqueueSelectedMarketing}
                  disabled={!marketingUniverseId || props.marketingBusy}
                >
                  <Send className="h-3.5 w-3.5" />
                  <Lang text={{ ko: "마케팅 Queue로 등록", en: "Add to Marketing queue" }} />
                </Button>
                {selectedUncategorizedCount > 0 && (
                  <span className="w-full px-1 text-xxs leading-5 text-amber-700 mt-1">
                    <Lang
                      text={{
                        ko: `미분류 ${selectedUncategorizedCount}건은 입력한 queue 카테고리로 등록됩니다.`,
                        en: `${selectedUncategorizedCount} uncategorized item(s) use the entered queue category.`,
                      }}
                    />
                  </span>
                )}
              </div>
            ) : null}
            <Button size="xs" variant="ghost" onClick={bulkOpenSelected}>
              <ExternalLink className="h-3.5 w-3.5" />
              <Lang
                text={{
                  ko: `열기 (${Math.min(visibleSelectedCount, BULK_OPEN_LIMIT)})`,
                  en: `Open (${Math.min(visibleSelectedCount, BULK_OPEN_LIMIT)})`,
                }}
              />
            </Button>
            <Button size="xs" variant="ghost" onClick={bulkCopySelected}>
              <Copy className="h-3.5 w-3.5" />
              <Lang text={{ ko: "복사", en: "Copy" }} />
            </Button>
            <Button size="xs" variant="ghost" onClick={() => onBulkToggleChecked(true)}>
              <CircleCheck className="h-3.5 w-3.5" />
              <Lang text={{ ko: "확인", en: "Mark done" }} />
            </Button>
            <Button size="xs" variant="ghost" onClick={() => onBulkToggleChecked(false)}>
              <RotateCcw className="h-3.5 w-3.5" />
              <Lang text={{ ko: "미확인", en: "Mark unread" }} />
            </Button>
            <Button size="xs" variant="ghost" onClick={bulkRefetchOg} disabled={selectedNeedsOg.length === 0}>
              <Sparkles className="h-3.5 w-3.5" />
              <Lang
                text={{
                  ko: `OG 다시 (${Math.min(selectedNeedsOg.length, BULK_OPEN_LIMIT)})`,
                  en: `OG refetch (${Math.min(selectedNeedsOg.length, BULK_OPEN_LIMIT)})`,
                }}
              />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                if (
                  await dialog.confirm({
                    variant: "danger",
                    message: lang({
                      ko: `선택한 ${visibleSelectedCount}건을 삭제할까요?`,
                      en: `Delete ${visibleSelectedCount} selected items?`,
                    }),
                  })
                ) {
                  onBulkDelete();
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-error" />
              <Lang text={{ ko: "삭제", en: "Delete" }} />
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Preloader />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-surface/40 px-6 py-10 text-center text-sm text-secondary-text">
          <Lang
            text={{
              ko: "보관된 링크가 없습니다. 위에 텍스트나 URL을 붙여넣고 저장해보세요.",
              en: "No saved links yet. Paste text or URLs above to get started.",
            }}
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <LinkRow
              key={item.id}
              item={item}
              selected={selectedSet.has(item.id)}
              onToggleSelected={(next) => props.onToggleSelected(item.id, next)}
              onToggleChecked={(next) => props.onToggleChecked(item, next)}
              onSaveLabel={(label) => props.onSaveLabel(item, label)}
              onDelete={() => props.onDelete(item)}
              onFetchOg={() => props.onFetchOg([item])}
              categories={props.categories}
              onChangeCategory={(categoryId) => props.onChangeCategory(item, categoryId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
