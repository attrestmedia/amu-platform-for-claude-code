"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { LoginDialog } from "components/module/auth";
import { Lang, lang } from "components/module/i18n";
import { Preloader } from "@amu-labs/ui";
import { useAuthStore } from "store/auth";
import { toErrorMessage } from "utils/common";
import {
  type IScrapeLinkCategory,
  type IScrapeLinkItem,
  createCategory,
  deleteCategory,
  deleteLink,
  enqueueScrapeLinksToMarketingQueue,
  fetchOg,
  getScrapeLinksMarketingOptions,
  listCategories,
  listLinks,
  patchCategory,
  patchLink,
  saveLinks,
  type ScrapeLinksMarketingUniverseOption,
} from "libs/api/mini-app/scrapeLinks";
import { LandingSection } from "./modules/LandingSection";
import { InputPanel } from "./modules/InputPanel";
import { LinkList } from "./modules/LinkList";
import { CategoryManager } from "./modules/CategoryManager";
import { ALL_CATEGORY_VALUE, UNCATEGORIZED_CATEGORY_VALUE } from "./modules/categoryConstants";

type CheckedFilter = "all" | "todo" | "done";

export default function ScrapeLinksApp() {
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const [showTool, setShowTool] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [items, setItems] = useState<IScrapeLinkItem[]>([]);
  const [categories, setCategories] = useState<IScrapeLinkCategory[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<CheckedFilter>("all");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_VALUE);
  const [saveCategoryId, setSaveCategoryId] = useState(UNCATEGORIZED_CATEGORY_VALUE);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marketingUniverses, setMarketingUniverses] = useState<ScrapeLinksMarketingUniverseOption[]>([]);
  const [marketingMaxBatchSize, setMarketingMaxBatchSize] = useState(50);
  const [marketingBusy, setMarketingBusy] = useState(false);
  const requireLogin = useCallback(() => {
    if (isLoggedIn) return true;
    setShowLogin(true);
    return false;
  }, [isLoggedIn]);

  const reload = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await listLinks({ checked: filter, query, category: activeCategory, limit: 100 });
      setItems(res.items);
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, lang({ ko: "불러오기에 실패했습니다.", en: "Failed to load." })));
    } finally {
      setLoading(false);
    }
  }, [activeCategory, filter, isLoggedIn, query]);

  const reloadCategories = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await listCategories();
      setCategories(res.items);
      setTotalCount(res.total);
      setUncategorizedCount(res.uncategorized);
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, lang({ ko: "카테고리 불러오기 실패", en: "Failed to load categories." })));
    }
  }, [isLoggedIn]);

  useEffect(function autoShowToolAfterHydrate() {
    if (!hasHydrated) return;
    // 외부 인증 상태(isLoggedIn)에 따라 툴 가시성 동기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLoggedIn) setShowTool(true);
  }, [hasHydrated, isLoggedIn]);

  useEffect(function reloadItemsOnLoginOrShow() {
    if (!showTool || !isLoggedIn) return;
    // 외부 API에서 링크 목록 reload — 내부에서 items/total 동기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [isLoggedIn, reload, showTool]);

  useEffect(function reloadCategoriesOnLoginOrShow() {
    if (!showTool || !isLoggedIn) return;
    // 외부 API에서 카테고리 목록 reload
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadCategories();
  }, [isLoggedIn, reloadCategories, showTool]);

  useEffect(function loadMarketingOptions() {
    if (!showTool || !isLoggedIn) return;
    getScrapeLinksMarketingOptions()
      .then((options) => {
        // 외부 API 결과를 폼 옵션 state에 동기화
        setMarketingUniverses(options.universes || []);
        setMarketingMaxBatchSize(Math.max(1, Math.min(50, Number(options.maxBatchSize || 50))));
      })
      .catch(() => setMarketingUniverses([]));
  }, [isLoggedIn, showTool]);

  useEffect(function showLoginWhenToolBlocked() {
    // 외부 인증 상태가 비로그인일 때 로그인 다이얼로그를 열어준다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasHydrated && showTool && !isLoggedIn) setShowLogin(true);
  }, [hasHydrated, isLoggedIn, showTool]);

  useEffect(function pruneSelectedIdsByVisibleItems() {
    // items(외부 데이터) 변경 시 화면에 없는 선택값 제거
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds((prev) => {
      if (prev.length === 0) return prev;
      const visibleIds = new Set(items.map((it) => it.id));
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [items]);

  const handleStart = useCallback(() => {
    if (!requireLogin()) return;
    setShowTool(true);
  }, [requireLogin]);

  const handleFetchOg = useCallback(async (targets: IScrapeLinkItem[]) => {
    if (!targets.length) return;
    const ids = targets.map((it) => it.id);
    setItems((prev) =>
      prev.map((it) => (ids.includes(it.id) ? { ...it, ogStatus: "pending" as const } : it)),
    );
    try {
      const results = await fetchOg(ids);
      setItems((prev) =>
        prev.map((it) => {
          const r = results.find((row) => row.id === it.id);
          if (!r) return it;
          return {
            ...it,
            ogTitle: r.ogTitle ?? it.ogTitle,
            ogDescription: r.ogDescription ?? it.ogDescription,
            ogImage: r.ogImage ?? it.ogImage,
            ogSiteName: r.ogSiteName ?? it.ogSiteName,
            ogStatus: r.status,
            ogFetchedAt: new Date().toISOString(),
            label: it.label || (r.ogTitle ?? ""),
          };
        }),
      );
      toast.success(lang({ ko: "OG 라벨 업데이트 완료", en: "OG labels updated" }));
    } catch (err: unknown) {
      setItems((prev) =>
        prev.map((it) => (ids.includes(it.id) ? { ...it, ogStatus: "failed" as const } : it)),
      );
      toast.error(toErrorMessage(err, lang({ ko: "OG 수집 실패", en: "OG fetch failed." })));
    }
  }, []);

  const handleSubmit = useCallback(
    async (payload: {
      text?: string;
      urls?: string[];
      source: "paste" | "manual" | "text-extract";
      baseDomain?: string | null;
    }) => {
      if (!requireLogin()) return;
      setSaving(true);
      try {
        const categoryId =
          saveCategoryId === UNCATEGORIZED_CATEGORY_VALUE || saveCategoryId === ALL_CATEGORY_VALUE
            ? null
            : saveCategoryId;
        const res = await saveLinks({ ...payload, categoryId });
        const createdCount = res.created.length;
        const skipped = res.skipped;
        if (createdCount > 0) {
          toast.success(
            lang({
              ko: `${createdCount}건 저장${skipped ? `, ${skipped}건 중복 제외` : ""}`,
              en: `Saved ${createdCount}${skipped ? `, skipped ${skipped} duplicates` : ""}`,
            }),
          );
        } else if (skipped > 0) {
          toast.message(
            lang({
              ko: "이미 저장된 링크입니다.",
              en: "All links already saved.",
            }),
          );
        } else {
          toast.message(lang({ ko: "유효한 URL이 없습니다.", en: "No valid URL found." }));
        }
        await reload();
        await reloadCategories();
        if (res.created.length > 0) {
          void handleFetchOg(res.created.slice(0, 20));
        }
      } catch (err: unknown) {
        toast.error(toErrorMessage(err, lang({ ko: "저장에 실패했습니다.", en: "Save failed." })));
      } finally {
        setSaving(false);
      }
    },
    [handleFetchOg, reload, reloadCategories, requireLogin, saveCategoryId],
  );

  const handleToggleChecked = useCallback(async (item: IScrapeLinkItem, next: boolean) => {
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, checked: next } : it)));
    try {
      await patchLink(item.id, { checked: next });
    } catch (err: unknown) {
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, checked: item.checked } : it)));
      toast.error(toErrorMessage(err, lang({ ko: "체크 업데이트 실패", en: "Failed to update." })));
    }
  }, []);

  const handleSaveLabel = useCallback(async (item: IScrapeLinkItem, label: string) => {
    const trimmed = label.trim();
    if (trimmed === item.label) return;
    try {
      const updated = await patchLink(item.id, { label: trimmed });
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, lang({ ko: "라벨 저장 실패", en: "Failed to save label." })));
    }
  }, []);

  const handleDelete = useCallback(
    async (item: IScrapeLinkItem) => {
      const prev = items;
      setItems((list) => list.filter((it) => it.id !== item.id));
      try {
        await deleteLink(item.id);
        void reloadCategories();
      } catch (err: unknown) {
        setItems(prev);
        toast.error(toErrorMessage(err, lang({ ko: "삭제 실패", en: "Delete failed." })));
      }
    },
    [items, reloadCategories],
  );

  const handleCreateCategory = useCallback(async (name: string) => {
    try {
      const created = await createCategory(name);
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSaveCategoryId(created.id);
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, lang({ ko: "카테고리 생성 실패", en: "Failed to create category." })));
    }
  }, []);

  const handleRenameCategory = useCallback(
    async (id: string, name: string) => {
      try {
        const updated = await patchCategory(id, { name });
        setCategories((prev) =>
          prev.map((it) => (it.id === id ? updated : it)).sort((a, b) => a.name.localeCompare(b.name)),
        );
        await reload();
      } catch (err: unknown) {
        toast.error(toErrorMessage(err, lang({ ko: "카테고리 이름 변경 실패", en: "Failed to rename category." })));
      }
    },
    [reload],
  );

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      try {
        await deleteCategory(id);
        setCategories((prev) => prev.filter((it) => it.id !== id));
        if (activeCategory === id) setActiveCategory(ALL_CATEGORY_VALUE);
        if (saveCategoryId === id) setSaveCategoryId(UNCATEGORIZED_CATEGORY_VALUE);
        await reload();
      } catch (err: unknown) {
        toast.error(toErrorMessage(err, lang({ ko: "카테고리 삭제 실패", en: "Failed to delete category." })));
      }
    },
    [activeCategory, reload, saveCategoryId],
  );

  const handleChangeItemCategory = useCallback(
    async (item: IScrapeLinkItem, categoryId: string) => {
      try {
        const nextCategoryId = categoryId === UNCATEGORIZED_CATEGORY_VALUE ? null : categoryId;
        await patchLink(item.id, { categoryId: nextCategoryId });
        await reload();
        void reloadCategories();
      } catch (err: unknown) {
        toast.error(toErrorMessage(err, lang({ ko: "카테고리 변경 실패", en: "Failed to update category." })));
      }
    },
    [reload, reloadCategories],
  );

  const handleToggleSelected = useCallback((id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (next) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  }, []);

  const handleSelectAll = useCallback(
    (next: boolean) => {
      setSelectedIds(next ? items.map((it) => it.id) : []);
    },
    [items],
  );

  const handleClearSelection = useCallback(() => setSelectedIds([]), []);

  const handleBulkDelete = useCallback(async () => {
    const visibleIds = new Set(items.map((it) => it.id));
    const ids = selectedIds.filter((id) => visibleIds.has(id));
    if (!ids.length) return;
    const prev = items;
    setItems((list) => list.filter((it) => !ids.includes(it.id)));
    setSelectedIds([]);
    try {
      await Promise.all(ids.map((id) => deleteLink(id)));
      void reloadCategories();
      toast.success(lang({ ko: `${ids.length}건 삭제됨`, en: `Deleted ${ids.length} items` }));
    } catch (err: unknown) {
      setItems(prev);
      toast.error(toErrorMessage(err, lang({ ko: "일괄 삭제 실패", en: "Bulk delete failed." })));
    }
  }, [items, reloadCategories, selectedIds]);

  const handleBulkChangeCategory = useCallback(
    async (categoryId: string) => {
      const visibleIds = new Set(items.map((it) => it.id));
      const ids = selectedIds.filter((id) => visibleIds.has(id));
      if (!ids.length) return;
      const nextCategoryId = categoryId === UNCATEGORIZED_CATEGORY_VALUE ? null : categoryId;
      try {
        await Promise.all(ids.map((id) => patchLink(id, { categoryId: nextCategoryId })));
        setSelectedIds([]);
        await reload();
        void reloadCategories();
        toast.success(
          lang({ ko: `${ids.length}건 카테고리 변경`, en: `Updated category for ${ids.length}` }),
        );
      } catch (err: unknown) {
        toast.error(toErrorMessage(err, lang({ ko: "일괄 변경 실패", en: "Bulk change failed." })));
      }
    },
    [items, reload, reloadCategories, selectedIds],
  );

  const handleBulkToggleChecked = useCallback(
    async (next: boolean) => {
      const visibleIds = new Set(items.map((it) => it.id));
      const ids = selectedIds.filter((id) => visibleIds.has(id));
      if (!ids.length) return;
      const prev = items;
      setItems((list) =>
        list.map((it) => (ids.includes(it.id) ? { ...it, checked: next } : it)),
      );
      try {
        await Promise.all(ids.map((id) => patchLink(id, { checked: next })));
        setSelectedIds([]);
        toast.success(
          lang({
            ko: `${ids.length}건 ${next ? "확인" : "미확인"} 처리`,
            en: `${next ? "Checked" : "Unchecked"} ${ids.length}`,
          }),
        );
      } catch (err: unknown) {
        setItems(prev);
        toast.error(toErrorMessage(err, lang({ ko: "일괄 처리 실패", en: "Bulk update failed." })));
      }
    },
    [items, selectedIds],
  );

  const handleEnqueueMarketing = useCallback(
    async (ids: string[], options: { universeId: string; queueCategory: string }) => {
      if (!ids.length) return;
      const batchSize = Math.max(1, Math.min(50, Number(marketingMaxBatchSize || 50)));
      const chunks: string[][] = [];
      for (let index = 0; index < ids.length; index += batchSize) {
        chunks.push(ids.slice(index, index + batchSize));
      }
      if (chunks.length > 1) {
        toast.warning(
          lang({
            ko: `${ids.length}건을 ${chunks.length}개 묶음으로 나누어 마케팅 queue에 등록합니다.`,
            en: `Submitting ${ids.length} links to marketing queue in ${chunks.length} chunks.`,
          }),
        );
      }
      setMarketingBusy(true);
      try {
        const results = [];
        for (const chunk of chunks) {
          results.push(
            await enqueueScrapeLinksToMarketingQueue({
              ids: chunk,
              universeId: options.universeId,
              queueCategory: options.queueCategory,
              priority: "normal",
              reviewMode: "review_required",
            }),
          );
        }
        const enqueued = results.reduce((acc, result) => acc + Number(result.enqueued?.length || 0), 0);
        const skipped = results.reduce((acc, result) => acc + Number(result.skipped?.length || 0), 0);
        const failed = results.reduce((acc, result) => acc + Number(result.failed?.length || 0), 0);
        toast.success(
          lang({
            ko: `마케팅 queue 등록 ${enqueued}건, 중복 ${skipped}건, 실패 ${failed}건`,
            en: `Marketing queue: ${enqueued} enqueued, ${skipped} skipped, ${failed} failed`,
          }),
        );
        setSelectedIds([]);
      } catch (err: unknown) {
        const errorMessage = toErrorMessage(err);
        const message =
          errorMessage === "uncategorized_queue_category_required"
            ? lang({
                ko: "미분류 링크는 마케팅 queue 카테고리를 지정해야 등록할 수 있습니다.",
                en: "Uncategorized links require a marketing queue category.",
              })
            : errorMessage === "batch_limit_exceeded"
              ? lang({
                  ko: `한 번에 ${batchSize}건 이하만 등록할 수 있습니다. 다시 시도해주세요.`,
                  en: `Only ${batchSize} links can be submitted at once. Try again.`,
                })
              : errorMessage || lang({ ko: "마케팅 queue 등록 실패", en: "Marketing enqueue failed." });
        toast.error(message);
      } finally {
        setMarketingBusy(false);
      }
    },
    [marketingMaxBatchSize],
  );

  const handleDownload = useCallback(() => {
    if (!items.length) {
      toast.message(lang({ ko: "다운로드할 링크가 없습니다.", en: "No links to download." }));
      return;
    }
    const categoryName = (() => {
      if (activeCategory === ALL_CATEGORY_VALUE) return lang({ ko: "전체", en: "All" });
      if (activeCategory === UNCATEGORIZED_CATEGORY_VALUE)
        return lang({ ko: "미분류", en: "Uncategorized" });
      return (
        categories.find((c) => c.id === activeCategory)?.name ||
        lang({ ko: "카테고리", en: "Category" })
      );
    })();
    const filterLabel = filter === "todo" ? "unread" : filter === "done" ? "done" : "all";
    const now = new Date();
    const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 19);
    const lines: string[] = [
      `# ${categoryName}`,
      `# generated: ${now.toISOString()}`,
      `# filter: ${filterLabel}`,
      `# total: ${items.length} links`,
      "",
    ];
    items.forEach((it, idx) => {
      const label = it.label || it.ogTitle || it.domain || it.url;
      lines.push(`[${idx + 1}] ${label}`);
      lines.push(it.url);
      if (it.ogDescription) lines.push(it.ogDescription);
      if (it.categoryName) lines.push(`category: ${it.categoryName}`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeName = categoryName.replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ-]+/g, "_") || "links";
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrape-links_${safeName}_${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(lang({ ko: `${items.length}건 다운로드`, en: `Downloaded ${items.length}` }));
  }, [activeCategory, categories, filter, items]);

  const counts = useMemo(
    () => ({
      total: items.length,
      done: items.filter((it) => it.checked).length,
    }),
    [items],
  );

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Preloader />
      </div>
    );
  }

  if (!showTool) {
    return (
      <>
        <LandingSection onStart={handleStart} />
        <LoginDialog open={showLogin} onOpenChange={setShowLogin} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[50rem] px-5 py-8 sm:px-8">
      <header className="mb-6 flex items-center gap-3">
        <Link2 className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">
          <Lang text={{ ko: "내 링크 보관함", en: "My Link Vault" }} />
        </h1>
        <span className="ml-auto text-xs text-secondary-text">
          {counts.done}/{counts.total}
        </span>
      </header>

      <InputPanel
        onSubmit={handleSubmit}
        saving={saving}
        categories={categories}
        selectedCategoryId={saveCategoryId}
        onCategoryChange={setSaveCategoryId}
      />

      <CategoryManager
        categories={categories}
        totalCount={totalCount}
        uncategorizedCount={uncategorizedCount}
        activeCategory={activeCategory}
        onActiveCategoryChange={setActiveCategory}
        onCreate={handleCreateCategory}
        onRename={handleRenameCategory}
        onDelete={handleDeleteCategory}
      />

      <LinkList
        items={items}
        loading={loading}
        filter={filter}
        query={query}
        onFilterChange={setFilter}
        onQueryChange={setQuery}
        onReload={() => void reload()}
        onToggleChecked={handleToggleChecked}
        onSaveLabel={handleSaveLabel}
        onDelete={handleDelete}
        onFetchOg={handleFetchOg}
        categories={categories}
        onChangeCategory={handleChangeItemCategory}
        onDownload={handleDownload}
        selectedIds={selectedIds}
        onToggleSelected={handleToggleSelected}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkChangeCategory={handleBulkChangeCategory}
        onBulkToggleChecked={handleBulkToggleChecked}
        marketingUniverses={marketingUniverses}
        marketingMaxBatchSize={marketingMaxBatchSize}
        marketingBusy={marketingBusy}
        onEnqueueMarketing={handleEnqueueMarketing}
      />

      <LoginDialog open={showLogin} onOpenChange={setShowLogin} />
    </div>
  );
}
