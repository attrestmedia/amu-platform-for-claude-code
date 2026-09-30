"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getPromptFieldText,
  loadStudioContentPromptItems,
  loadStudioContentPromptItemsPage,
  mergeStudioPromptPageItems,
  createStudioTemplatePreferenceRanker,
  filterStudioRecommendedTemplateItems,
  filterStudioTemplateItemsByAllowList,
  normalizeStudioRecommendedTemplateProps,
  normalizeStudioTemplateKeyList,
} from "utils/app";
import { dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY, OPEN_GEN_STUDIO_MANAGEMENT_EVENT } from "consts/app";
import type {
  ContentStudioApplyContentArgsType,
  ContentPromptProps,
  PromptItemType,
  PromptSearchFieldType,
  PromptVisibilityType,
} from "types/app";
import { PresetCard } from "./modules/PresetCard";
import { STUDIO_TEMPLATE_GALLERY_PAGE_SIZE, StudioTemplateGallery } from "./modules/StudioTemplateGallery";
import { ContentStudioEditorAdapter } from "./modules/ContentStudioEditorAdapter";
import { logger } from "utils/log";
import { useAuthStore } from "store/auth";
import {
  createCanonicalGenStudioTemplateSearchParams,
  getGenStudioTemplateSearchParam,
} from "utils/app/genStudioTemplateQuery";
import {
  buildGenStudioCustomUrl,
  buildGenStudioTemplateUrl,
  resolveGenStudioCloseUrl,
} from "utils/app/genStudioRouteContract";
import { getContentPrompt, getGenStudioTemplateGroup } from "libs/api/lab";
import { isPublicGenStudioSurface, trackGaEvent, trackTemplateKeyClick } from "utils/analytics/ga4";
import { runAfterCurrentRender } from "utils/common";
import { useUserData } from "hooks/auth";
import { TemplateGroupSelectionBar } from "./modules/TemplateGroupSelectionBar";
import { TemplateBookmarkButton } from "./modules/TemplateBookmarkButton";
import { useContentPromptBookmarks } from "hooks/app/useImagePromptBookmarks";
import { useContentTemplatePreviews } from "./hooks/useContentTemplatePreviews";
import {
  RecentGeneratedContents,
  type ContentAssetCardItem,
} from "./modules/RecentGeneratedContents";
import { ContentAssetViewer } from "./modules/ContentAssetViewer";
import { ContentPreviewLoadNotice } from "./modules/ContentPreviewLoadNotice";
import { useStudioTemplateCatalog } from "./hooks/useStudioTemplateCatalog";
import type { StudioRecommendedTemplateValue } from "utils/app/genStudioTemplateCatalog";

type ContentItem = PromptItemType;

type ContentStudioEditorProps = ContentPromptProps & {
  surface?: "default" | "embedded";
  articleContext?: { title: string; question: string; intent: string };
  embedSessionId?: string;
  allowedTemplateKeys?: readonly string[];
  allowedTemplateVariableKeys?: readonly string[];
  requiredTemplateVariableKeys?: readonly string[];
  lockedTemplateVariableKeys?: readonly string[];
  initialTemplateVariables?: Readonly<Record<string, string>>;
  initialOutputVisibility?: PromptVisibilityType;
  allowCustomPrompt?: boolean;
  enableTemplateGroupManagement?: boolean;
  detailPresentation?: "page" | "sheet" | "embedded";
  detailNavigationMode?: "state" | "url" | "route";
  navigationBasePath?: string;
  initialQuery?: string;
  initialTemplateKey?: string;
  routeTemplateKey?: string;
  routeDetailMode?: "template" | "custom";
  preferredTemplateKeys?: string[];
  preferredTemplateTags?: string[];
  preferredTemplateCategories?: string[];
  templateGroupKey?: string;
  recommendedTemplateKeys?: readonly string[];
  /** @deprecated recommendedTemplateKeys로 전환 중인 호환 alias */
  recommendedTemplates?: readonly StudioRecommendedTemplateValue[];
  recommendedTemplateDescription?: { ko: string; en: string };
  onApplyContent?: (args: ContentStudioApplyContentArgsType) => Promise<void> | void;
};

export function ContentStudioEditor(props: ContentStudioEditorProps) {
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { isAdministrator } = useUserData();
  const [templatePage, setTemplatePage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetInitialMode, setSheetInitialMode] = useState<"template" | "custom">("template");
  const [q, setQ] = useState(props.initialQuery || "");
  const [searchField, setSearchField] = useState<PromptSearchFieldType>("all");
  const [isGroupEditMode, setIsGroupEditMode] = useState(false);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([]);
  const [visiblePreviewKeys, setVisiblePreviewKeys] = useState<string[]>([]);
  const [viewerAsset, setViewerAsset] = useState<ContentAssetCardItem | null>(null);
  const detailPresentation = props.detailPresentation ?? "page";
  const allowedTemplateKeys = useMemo(
    () => normalizeStudioTemplateKeyList(props.allowedTemplateKeys),
    [props.allowedTemplateKeys],
  );
  const allowedTemplateKeySet = useMemo(
    () => (allowedTemplateKeys.length ? new Set(allowedTemplateKeys) : null),
    [allowedTemplateKeys],
  );

  // 콘텐츠 템플릿 그룹(중앙 관리 원장) — 그룹이 있으면 목록 제한 + 추천 큐레이션을 그룹 문서가 담당
  const requestedTemplateGroupKey = String(props.templateGroupKey || "").trim();
  const [resolvedTemplateGroup, setResolvedTemplateGroup] = useState<{
    key: string;
    templateKeys: string[];
    recommendedTemplateKeys: string[];
    recommendedDescription: { ko: string; en: string } | null;
  }>({ key: "", templateKeys: [], recommendedTemplateKeys: [], recommendedDescription: null });

  useEffect(
    function resolveContentTemplateGroup() {
      if (!requestedTemplateGroupKey) return;
      let cancelled = false;
      void getGenStudioTemplateGroup(requestedTemplateGroupKey)
        .then((group) => {
          if (cancelled) return;
          const isContentGroup = group?.promptType === "content";
          setResolvedTemplateGroup({
            key: requestedTemplateGroupKey,
            templateKeys: isContentGroup ? normalizeStudioTemplateKeyList(group?.templateKeys) : [],
            recommendedTemplateKeys: isContentGroup
              ? normalizeStudioTemplateKeyList(group?.recommendedTemplateKeys)
              : [],
            recommendedDescription: isContentGroup ? group?.recommendedDescription || null : null,
          });
        })
        .catch((error) => {
          logger.warn(error);
          if (cancelled) return;
          setResolvedTemplateGroup({
            key: requestedTemplateGroupKey,
            templateKeys: [],
            recommendedTemplateKeys: [],
            recommendedDescription: null,
          });
        });
      return () => {
        cancelled = true;
      };
    },
    [requestedTemplateGroupKey],
  );

  const isResolvedGroupActive =
    Boolean(requestedTemplateGroupKey) && resolvedTemplateGroup.key === requestedTemplateGroupKey;
  // 그룹 미존재/미로드/비콘텐츠 그룹이면 제한하지 않음 (fail-soft: 전체 목록 유지)
  const groupAllowedKeySet = useMemo(
    () =>
      isResolvedGroupActive && resolvedTemplateGroup.templateKeys.length > 0
        ? new Set(resolvedTemplateGroup.templateKeys)
        : null,
    [isResolvedGroupActive, resolvedTemplateGroup.templateKeys],
  );
  const groupAllowedTemplateKeys = useMemo(
    () => (groupAllowedKeySet ? Array.from(groupAllowedKeySet) : []),
    [groupAllowedKeySet],
  );
  const detailNavigationMode = props.detailNavigationMode ?? "state";
  const navigationBasePath = props.navigationBasePath || "/gen-studio";
  const router = useRouter();
  const handleRequireLogin = useCallback(() => {
    const current = typeof window === "undefined" ? navigationBasePath : `${window.location.pathname}${window.location.search}`;
    router.push(`/login?next=${encodeURIComponent(current)}`);
  }, [navigationBasePath, router]);
  const handleBookmarkLogout = useCallback(() => {
    setShowBookmarkedOnly(false);
  }, []);
  const { bookmarkedKeys, bookmarkPendingKeys, bookmarkedKeySet, bookmarkOrderMap, handleToggleBookmark } =
    useContentPromptBookmarks({
      isLoggedIn,
      onRequireLogin: handleRequireLogin,
      onLogout: handleBookmarkLogout,
    });
  const searchParams = useSearchParams();
  const canonicalSearchParams = useMemo(() => createCanonicalGenStudioTemplateSearchParams(searchParams), [searchParams]);
  const searchParamString = canonicalSearchParams.toString();
  const initialTemplateKey = String(props.initialTemplateKey || "").trim();
  const shouldUseUrlNavigation = detailPresentation === "page" && detailNavigationMode !== "state";
  const isUrlDetailIntent =
    shouldUseUrlNavigation &&
    (detailNavigationMode === "route" || getGenStudioTemplateSearchParam(canonicalSearchParams, "view") === "detail");
  const urlDetailMode = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "detailMode") || "").trim();
  const routeTemplateKey = String(props.routeTemplateKey || "").trim();
  const isRouteCustomIntent = detailNavigationMode === "route" && props.routeDetailMode === "custom";
  const deepLinkedTemplateKey = String(
    routeTemplateKey ||
      getGenStudioTemplateSearchParam(canonicalSearchParams, "templateKey") ||
      getGenStudioTemplateSearchParam(canonicalSearchParams, "template") ||
      "",
  ).trim();
  const getPreferredTemplateRank = useMemo(
    () =>
      createStudioTemplatePreferenceRanker({
        preferredTemplateKeys: props.preferredTemplateKeys,
        preferredTemplateTags: props.preferredTemplateTags,
        preferredTemplateCategories: props.preferredTemplateCategories,
      }),
    [props.preferredTemplateCategories, props.preferredTemplateKeys, props.preferredTemplateTags],
  );
  const hasLegacyRecommendedTemplates = props.recommendedTemplates !== undefined;

  useEffect(() => {
    if (!hasLegacyRecommendedTemplates) return;
    logger.warn("[GenStudio] recommendedTemplates is deprecated; use recommendedTemplateKeys instead.");
  }, [hasLegacyRecommendedTemplates]);

  const handleQueryChange = useCallback((value: string) => {
    setQ(value);
    setTemplatePage(1);
  }, []);

  const handleSearchFieldChange = useCallback((value: string) => {
    setSearchField(value as PromptSearchFieldType);
    setTemplatePage(1);
  }, []);

  const closeDetail = useCallback(() => {
    setIsSheetOpen(false);
    if (!shouldUseUrlNavigation) return;

    router.replace(
      resolveGenStudioCloseUrl({
        basePath: navigationBasePath,
        mode: "content",
        currentSearchParams: searchParamString,
        returnUrl: getGenStudioTemplateSearchParam(canonicalSearchParams, "returnUrl"),
      }),
    );
  }, [canonicalSearchParams, navigationBasePath, router, searchParamString, shouldUseUrlNavigation]);

  const handleDetailOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setIsSheetOpen(true);
        return;
      }
      closeDetail();
    },
    [closeDetail],
  );

  const pushContentDetailUrl = useCallback(
    (args: { item?: ContentItem | null; initialMode: "template" | "custom" }) => {
      if (!shouldUseUrlNavigation) return;

      const href =
        args.initialMode === "custom" || !args.item?.key
          ? buildGenStudioCustomUrl({ mode: "content", currentSearchParams: searchParamString })
          : buildGenStudioTemplateUrl({ mode: "content", templateKey: args.item.key, currentSearchParams: searchParamString });
      if (!href) return;
      router.push(href);
    },
    [router, searchParamString, shouldUseUrlNavigation],
  );

  const openDetail = useCallback(
    (args: { item: ContentItem | null; initialMode: "template" | "custom" }) => {
      setSelectedItem(args.item);
      setSheetInitialMode(args.initialMode);
      setIsSheetOpen(true);
      pushContentDetailUrl(args);
    },
    [pushContentDetailUrl],
  );

  const fetchContentPromptByKey = useCallback(
    async (templateKey: string) => {
      const key = String(templateKey || "").trim();
      if (!key) return null;

      const systemItem = await getContentPrompt(key).catch(() => null);
      if (systemItem) return systemItem as ContentItem;
      if (!isLoggedIn) return null;

      const userItem = await getContentPrompt(key, { scope: "user" }).catch(() => null);
      return userItem ? ({ ...userItem, templateScope: "user" } as ContentItem) : null;
    },
    [isLoggedIn],
  );

  const fetchContentPromptPage = useCallback(
    async (args: { q?: string; limit: number; skip: number }) => {
      if (showBookmarkedOnly) {
        const allItems = await loadStudioContentPromptItems({ enabled: true, isLoggedIn });
        const itemMap = new Map(allItems.map((item) => [item.key, item] as const));
        const nextItems = bookmarkedKeys.map((key) => itemMap.get(key)).filter(Boolean) as ContentItem[];
        return { items: nextItems, total: nextItems.length };
      }

      return loadStudioContentPromptItemsPage({
        ...args,
        enabled: true,
        isLoggedIn,
      });
    },
    [bookmarkedKeys, isLoggedIn, showBookmarkedOnly],
  );

  const normalizeContentTemplateItem = useCallback(
    (item: ContentItem) => ({ ...item, templateScope: item.templateScope || "system" }),
    [],
  );

  const {
    items,
    setItems,
    isLoadingItems,
    templateTotal,
  } = useStudioTemplateCatalog({
    kind: "content",
    query: q,
    page: templatePage,
    pageSize: STUDIO_TEMPLATE_GALLERY_PAGE_SIZE,
    preferredTemplateKeys: showBookmarkedOnly ? [] : props.preferredTemplateKeys,
    fetchPage: fetchContentPromptPage,
    fetchByKey: fetchContentPromptByKey,
    normalizeItem: normalizeContentTemplateItem,
  });

  useEffect(() => {
    let cancelled = false;

    if (!initialTemplateKey || (allowedTemplateKeySet && !allowedTemplateKeySet.has(initialTemplateKey))) return;
    if (isSheetOpen && selectedItem?.key === initialTemplateKey) return;

    const matched = items.find((item) => item.key === initialTemplateKey);
    if (matched) {
      runAfterCurrentRender(() => {
        if (cancelled) return;
        openDetail({ item: matched, initialMode: "template" });
      });
      return () => {
        cancelled = true;
      };
    }

    if (!isLoadingItems) {
      void fetchContentPromptByKey(initialTemplateKey).then((item) => {
        if (cancelled || !item) return;
        setItems((prev) => mergeStudioPromptPageItems(prev, [item]));
        openDetail({ item, initialMode: "template" });
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    allowedTemplateKeySet,
    detailPresentation,
    fetchContentPromptByKey,
    initialTemplateKey,
    isLoadingItems,
    isSheetOpen,
    items,
    openDetail,
    selectedItem?.key,
    setItems,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!shouldUseUrlNavigation) return;
    if (!isUrlDetailIntent) {
      runAfterCurrentRender(() => {
        if (cancelled) return;
        setIsSheetOpen((prev) => (prev ? false : prev));
      });

      return () => {
        cancelled = true;
      };
    }

    if (isRouteCustomIntent || urlDetailMode === "custom") {
      runAfterCurrentRender(() => {
        if (cancelled) return;
        setSelectedItem(null);
        setSheetInitialMode("custom");
        setIsSheetOpen(true);
      });

      return () => {
        cancelled = true;
      };
    }

    if (!deepLinkedTemplateKey) return;
    const matched = items.find((item) => item.key === deepLinkedTemplateKey);
    if (matched) {
      runAfterCurrentRender(() => {
        if (cancelled) return;
        setSelectedItem(matched);
        setSheetInitialMode("template");
        setIsSheetOpen(true);
      });
    } else if (!isLoadingItems) {
      void fetchContentPromptByKey(deepLinkedTemplateKey).then((item) => {
        if (cancelled) return;
        if (!item) {
          router.replace(
            resolveGenStudioCloseUrl({
              basePath: navigationBasePath,
              mode: "content",
              currentSearchParams: searchParamString,
              returnUrl: getGenStudioTemplateSearchParam(canonicalSearchParams, "returnUrl"),
            }),
          );
          return;
        }
        setItems((prev) => mergeStudioPromptPageItems(prev, [item]));
        setSelectedItem(item);
        setSheetInitialMode("template");
        setIsSheetOpen(true);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    deepLinkedTemplateKey,
    fetchContentPromptByKey,
    isLoadingItems,
    isUrlDetailIntent,
    items,
    navigationBasePath,
    router,
    searchParamString,
    canonicalSearchParams,
    setItems,
    shouldUseUrlNavigation,
    isRouteCustomIntent,
    urlDetailMode,
  ]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const fields: PromptSearchFieldType[] = ["key", "title", "categories", "tags"];
    const scopedItems = filterStudioTemplateItemsByAllowList(
      filterStudioTemplateItemsByAllowList(items, groupAllowedTemplateKeys),
      allowedTemplateKeys,
    );
    return scopedItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (!qq) return true;
        if (searchField === "all") {
          return fields.some((field) => getPromptFieldText(item, field).toLowerCase().includes(qq));
        }
        return getPromptFieldText(item, searchField).toLowerCase().includes(qq);
      })
      .filter(({ item }) => !showBookmarkedOnly || bookmarkedKeySet.has(item.key))
      .sort((a, b) => {
        const aPreferred = getPreferredTemplateRank(a.item);
        const bPreferred = getPreferredTemplateRank(b.item);
        if (aPreferred !== bPreferred) return aPreferred - bPreferred;
        const aBookmarked = bookmarkedKeySet.has(a.item.key);
        const bBookmarked = bookmarkedKeySet.has(b.item.key);
        if (aBookmarked !== bBookmarked) return Number(bBookmarked) - Number(aBookmarked);
        if (aBookmarked && bBookmarked) {
          return (bookmarkOrderMap.get(a.item.key) ?? 9999) - (bookmarkOrderMap.get(b.item.key) ?? 9999);
        }
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }, [
    allowedTemplateKeys,
    groupAllowedTemplateKeys,
    items,
    getPreferredTemplateRank,
    q,
    searchField,
    showBookmarkedOnly,
    bookmarkedKeySet,
    bookmarkOrderMap,
  ]);
  // 그룹 문서의 추천 큐레이션(중앙 관리)이 있으면 우선, props는 그룹 미설정 시 fallback
  const recommendedTemplateKeys = useMemo(() => {
    const source =
      isResolvedGroupActive && resolvedTemplateGroup.recommendedTemplateKeys.length > 0
        ? resolvedTemplateGroup.recommendedTemplateKeys
        : normalizeStudioRecommendedTemplateProps({
            recommendedTemplateKeys: props.recommendedTemplateKeys,
            recommendedTemplates: props.recommendedTemplates,
          });
    return normalizeStudioTemplateKeyList(source);
  }, [
    isResolvedGroupActive,
    props.recommendedTemplateKeys,
    props.recommendedTemplates,
    resolvedTemplateGroup.recommendedTemplateKeys,
  ]);

  const groupRecommendedDescription =
    isResolvedGroupActive &&
    resolvedTemplateGroup.recommendedDescription &&
    (resolvedTemplateGroup.recommendedDescription.ko || resolvedTemplateGroup.recommendedDescription.en)
      ? {
          ko: resolvedTemplateGroup.recommendedDescription.ko || resolvedTemplateGroup.recommendedDescription.en,
          en: resolvedTemplateGroup.recommendedDescription.en || resolvedTemplateGroup.recommendedDescription.ko,
        }
      : null;

  // 추천 항목은 검색/필터(filtered) 통과분에서만 매칭 — 검색 중에는 검색 결과와 함께 자연스럽게 축소된다
  const recommendedItems = useMemo(() => {
    return filterStudioRecommendedTemplateItems(filtered, recommendedTemplateKeys);
  }, [filtered, recommendedTemplateKeys]);

  const galleryItems = useMemo(() => {
    const baseItems = filtered;
    if (showBookmarkedOnly || !recommendedItems.length) return baseItems;
    const recommendedKeySet = new Set(recommendedItems.map((item) => item.key));
    return baseItems.filter((item) => !recommendedKeySet.has(item.key));
  }, [filtered, recommendedItems, showBookmarkedOnly]);

  const previewTemplateKeys = useMemo(
    () => Array.from(new Set([...visiblePreviewKeys, ...recommendedItems.map((item) => item.key)])),
    [recommendedItems, visiblePreviewKeys],
  );
  const {
    previewsByTemplate,
    loading: previewsLoading,
    loadErrors: previewLoadErrors,
    reload: reloadPreviews,
  } = useContentTemplatePreviews(previewTemplateKeys, undefined, {
    isLoggedIn,
    scope: props.mode,
    universeId: props.mode === "universe" ? props.universeId : undefined,
  });
  const templateTitleByKey = useMemo(
    () => Object.fromEntries(items.map((item) => [item.key, item.title])),
    [items],
  );

  const templateMetaByKey = useMemo(
    () =>
      Object.fromEntries(filtered.map((item) => [item.key, { title: item.title, thumb: "" }])) as Record<
        string,
        { title: string; thumb: string }
      >,
    [filtered],
  );

  const handleTemplateSelectionChange = useCallback((templateKey: string, selected: boolean) => {
    setSelectedTemplateKeys((current) =>
      selected
        ? Array.from(new Set([...current, templateKey]))
        : current.filter((key) => key !== templateKey),
    );
  }, []);

  const handleCloseGroupEditMode = useCallback(() => {
    setIsGroupEditMode(false);
    setSelectedTemplateKeys([]);
  }, []);

  const handleVisiblePreviewItemsChange = useCallback((visibleItems: PromptItemType[]) => {
    const keys = visibleItems.map((item) => item.key).filter(Boolean);
    setVisiblePreviewKeys((current) =>
      current.length === keys.length && current.every((key, index) => key === keys[index]) ? current : keys,
    );
  }, []);

  const handleSelectPreset = useCallback(
    (item: ContentItem) => {
      if (isPublicGenStudioSurface()) {
        trackTemplateKeyClick({
          cta_location: "preset_card",
          destination_url: typeof window !== "undefined" ? window.location.href : "",
          template_key: item.key,
          template_title: item.title,
          studio_scope: props.mode,
          entry_mode: "content",
        });
      }

      openDetail({ item, initialMode: "template" });
    },
    [openDetail, props.mode],
  );

  const handleOpenCustomPrompt = useCallback(() => {
    if (props.allowCustomPrompt === false) return;
    if (isPublicGenStudioSurface()) {
      trackGaEvent("gen_studio_custom_prompt_open", {
        cta_location: "content_template_gallery_secondary",
        destination_url: typeof window !== "undefined" ? window.location.href : "",
        template_key: GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY,
        template_title: "맞춤 프롬프트",
        studio_scope: props.mode,
        entry_mode: "content",
      });
    }
    openDetail({ item: null, initialMode: "custom" });
  }, [openDetail, props.allowCustomPrompt, props.mode]);

  const handleUseTemplateFromViewer = useCallback(
    async (templateKey: string) => {
      const item = items.find((candidate) => candidate.key === templateKey) || (await fetchContentPromptByKey(templateKey));
      if (!item) return;
      setViewerAsset(null);
      handleSelectPreset(item);
    },
    [fetchContentPromptByKey, handleSelectPreset, items],
  );

  const handleOpenContentPromptManager = useCallback(() => {
    if (!isLoggedIn) {
      void dialog.alert(lang({ ko: "로그인 후 이용할 수 있습니다.", en: "Please log in to use this feature." }));
      return;
    }

    window.dispatchEvent(
      new CustomEvent(OPEN_GEN_STUDIO_MANAGEMENT_EVENT, {
        detail: { tab: "content" },
      }),
    );
  }, [isLoggedIn]);

  const galleryContent = (
    <div className="w-full space-y-4">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-center leading-tight text-gradient-from-primary text-2xl sm:text-3xl lg:text-4xl font-extrabold">
          <Lang
            text={{
              ko: (
                <>
                  프롬프트 템플릿으로
                  <br />
                  콘텐츠를 빠르게 생성하세요.
                </>
              ),
              en: (
                <>
                  Create content quickly
                  <br />
                  with prompt templates.
                </>
              ),
            }}
          />
        </h1>
      </div>

      <StudioTemplateGallery
        items={galleryItems}
        recommendedItems={showBookmarkedOnly ? [] : recommendedItems}
        recommendedTitle={{ ko: "추천 템플릿", en: "Recommended templates" }}
        recommendedDescription={
          groupRecommendedDescription ||
          props.recommendedTemplateDescription || {
            ko: "이 작업에 가장 적합한 템플릿부터 시작해 보세요.",
            en: "Start with the templates best suited for this task.",
          }
        }
        searchField={searchField}
        onSearchFieldChange={handleSearchFieldChange}
        query={q}
        onQueryChange={handleQueryChange}
        emptyText={
          showBookmarkedOnly
            ? { ko: "북마크한 콘텐츠 템플릿이 없습니다.", en: "No bookmarked content templates." }
            : { ko: "등록된 콘텐츠 프롬프트가 없습니다.", en: "No content prompts registered." }
        }
        loading={isLoadingItems && items.length === 0}
        loadingText={{ ko: "콘텐츠 템플릿을 불러오는 중입니다.", en: "Loading content templates." }}
        page={showBookmarkedOnly ? undefined : templatePage}
        totalItems={showBookmarkedOnly ? filtered.length : templateTotal}
        onPageChange={showBookmarkedOnly ? undefined : setTemplatePage}
        templateGuideKind="content"
        resetKey={[q, searchField, showBookmarkedOnly ? "bookmarks" : "all", recommendedTemplateKeys.join(",")].join("\u0000")}
        onTemplateSelect={isGroupEditMode ? undefined : handleSelectPreset}
        onVisibleItemsChange={handleVisiblePreviewItemsChange}
        customPrompt={
          !groupAllowedKeySet && !allowedTemplateKeySet && props.allowCustomPrompt !== false && !isGroupEditMode && !showBookmarkedOnly
            ? {
                text: { ko: "직접 프롬프트 작성", en: "Write a custom prompt" },
                onClick: handleOpenCustomPrompt,
              }
            : undefined
        }
        bookmark={
          isGroupEditMode
            ? undefined
            : {
                text: { ko: "템플릿 북마크", en: "Template bookmarks" },
                active: showBookmarkedOnly,
                onClick: () => {
                  if (!isLoggedIn) {
                    handleRequireLogin();
                    return;
                  }
                  setTemplatePage(1);
                  setShowBookmarkedOnly((current) => !current);
                },
              }
        }
        manage={{
          text: { ko: "프롬프트 관리", en: "Manage prompts" },
          onClick: handleOpenContentPromptManager,
        }}
        groupManage={
          isAdministrator && props.enableTemplateGroupManagement
            ? {
                text: {
                  ko: isGroupEditMode ? "그룹 편집 종료" : "그룹 편집",
                  en: isGroupEditMode ? "Finish group editing" : "Edit groups",
                },
                active: isGroupEditMode,
                onClick: () => {
                  if (isGroupEditMode) {
                    handleCloseGroupEditMode();
                    return;
                  }
                  setShowBookmarkedOnly(false);
                  setSelectedTemplateKeys([]);
                  setIsGroupEditMode(true);
                },
              }
            : undefined
        }
        selectionBar={
          isGroupEditMode ? (
            <TemplateGroupSelectionBar
              promptType="content"
              selectedTemplateKeys={selectedTemplateKeys}
              templateMetaByKey={templateMetaByKey}
              onClear={() => setSelectedTemplateKeys([])}
              onDone={handleCloseGroupEditMode}
            />
          ) : undefined
        }
        notice={
          <ContentPreviewLoadNotice
            errors={previewLoadErrors}
            isLoggedIn={isLoggedIn}
            loading={previewsLoading}
            onRetry={reloadPreviews}
            className="my-4"
          />
        }
        renderItem={(item) => (
          <>
            {!isGroupEditMode && item.key !== GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY ? (
              <TemplateBookmarkButton
                active={bookmarkedKeySet.has(item.key)}
                loading={Boolean(bookmarkPendingKeys[item.key])}
                onClick={() => handleToggleBookmark(item.key)}
                className="absolute right-1.5 top-1.5 z-10"
              />
            ) : null}
            <div className="space-y-2 py-3">
              {!isGroupEditMode ? (
                <RecentGeneratedContents
                  items={previewsByTemplate[item.key] || []}
                  loading={previewsLoading}
                  templateTitleByKey={templateTitleByKey}
                  onSelect={setViewerAsset}
                />
              ) : null}
              <PresetCard
                item={item}
                modelName=""
                onSelect={() =>
                  isGroupEditMode
                    ? handleTemplateSelectionChange(item.key, !selectedTemplateKeys.includes(item.key))
                    : handleSelectPreset(item)
                }
                highlightQuery={q}
                highlightField={searchField}
                contentOnly
                selectionMode={isGroupEditMode}
                selected={selectedTemplateKeys.includes(item.key)}
                onSelectionChange={(selected) => handleTemplateSelectionChange(item.key, selected)}
              />
            </div>
          </>
        )}
      />

      <ContentAssetViewer
        key={viewerAsset?.assetId || "content-asset-viewer"}
        asset={viewerAsset}
        templateTitle={viewerAsset ? templateTitleByKey[viewerAsset.templateKey] : undefined}
        onClose={() => setViewerAsset(null)}
        onUseTemplate={(templateKey) => void handleUseTemplateFromViewer(templateKey)}
      />
    </div>
  );

  return (
    <ContentStudioEditorAdapter
      key={`${isSheetOpen ? "open" : "closed"}:${sheetInitialMode}:${selectedItem?.key || "custom"}`}
      fallback={galleryContent}
      pending={
        detailPresentation === "page" && isUrlDetailIntent ? (
          <section className="flex h-[100vh] min-h-[42rem] w-full items-center justify-center bg-background text-sm text-secondary-text supports-[height:100dvh]:h-[100dvh]">
            <Lang text={{ ko: "콘텐츠 생성 화면을 준비하고 있습니다.", en: "Preparing content generation." }} />
          </section>
        ) : undefined
      }
      open={isSheetOpen}
      onOpenChange={handleDetailOpenChange}
      presentation={detailPresentation}
      selectedItem={selectedItem}
      initialMode={sheetInitialMode}
      mode={props.mode}
      universeId={props.mode === "universe" ? props.universeId : undefined}
      articleContext={props.articleContext}
      surface={props.surface}
      embedSessionId={props.embedSessionId}
      allowedTemplateVariableKeys={props.allowedTemplateVariableKeys}
      requiredTemplateVariableKeys={props.requiredTemplateVariableKeys}
      lockedTemplateVariableKeys={props.lockedTemplateVariableKeys}
      initialTemplateVariables={props.initialTemplateVariables}
      initialOutputVisibility={props.initialOutputVisibility}
      allowCustomPrompt={props.allowCustomPrompt}
      isBookmarked={selectedItem ? bookmarkedKeySet.has(selectedItem.key) : false}
      bookmarkDisabled={selectedItem ? Boolean(bookmarkPendingKeys[selectedItem.key]) : false}
      onToggleBookmark={
        selectedItem?.key ? () => handleToggleBookmark(selectedItem.key) : undefined
      }
      onRecentContentsChanged={reloadPreviews}
      onDone={props.onDone}
      onApplyContent={props.onApplyContent}
      onGenerationStarted={props.onGenerationStarted}
      onGenerationFailed={props.onGenerationFailed}
    />
  );
}
