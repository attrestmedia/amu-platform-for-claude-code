"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGenStudioModelCatalog } from "hooks/app/useGenStudioModelCatalog";
import { Lang } from "components/module/i18n";
import { LoginDialog } from "components/module/auth";
import { logger } from "utils/log";
import { runAfterCurrentRender, toUnknownRecord } from "utils/common";
import {
  getImagePrompt,
  getServiceInternalImagePrompt,
  listStudioImageMetasPage,
  listStudioImageTemplatePreviewMetas,
  setStudioImageTemplateKey,
} from "libs/api/lab";
import {
  mergeStudioRecentMetaRows,
  loadStudioImagePromptItemsPage,
  mergeStudioPromptPageItems,
  createStudioTemplatePreferenceRanker,
  filterStudioRecommendedTemplateItems,
  filterStudioTemplateItemsByAllowList,
  normalizeStudioRecommendedTemplateProps,
  normalizeStudioTemplateKeyList,
  sortStudioTemplateItemsByKeyOrder,
} from "utils/app";
import {
  createCanonicalGenStudioTemplateSearchParams,
  getGenStudioTemplateSearchParam,
} from "utils/app/genStudioTemplateQuery";
import {
  buildGenStudioCustomUrl,
  buildGenStudioTemplateUrl,
  resolveGenStudioCloseUrl,
} from "utils/app/genStudioRouteContract";
import { DEFAULT_IMAGE_MODEL_BY_PROVIDER } from "consts/ai";
import {
  GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY,
  GEN_STUDIO_REALISTIC_CHARACTER_REFERENCE_TEMPLATE_KEY,
  GEN_STUDIO_REALISTIC_CHARACTER_REQUIRED_VARIABLE_KEYS,
  HOME_TEMPLATE_PREVIEW_IMG_LIMIT,
  STUDIO_IMAGE_SEARCH_FIELD_OPTIONS,
} from "consts/app";
import { FloatingToast } from "@amu-labs/ui";
import type {
  BaseImageType,
  PromptItemType,
  PromptSearchFieldType,
  StudioImageSearchFieldType,
  ImageStudioDoneMetaType,
  PersonaArtifactContextType,
} from "types/app";
import { getCatalogDefaultModelByProvider } from "utils/app/genStudioCatalogClient";
import { PresetCard } from "./modules/PresetCard";
import { ImageStudioEditorAdapter } from "./modules/ImageStudioEditorAdapter";
import { RecentGeneratedImages } from "./modules/RecentGeneratedImages";
import { TemplateBookmarkButton } from "./modules/TemplateBookmarkButton";
import { FixedImageViewer } from "./modules/FixedImageViewer";
import { GenStudioPromptToolbar } from "./modules/GenStudioPromptToolbar";
import { STUDIO_TEMPLATE_GALLERY_PAGE_SIZE, StudioTemplateGallery } from "./modules/StudioTemplateGallery";
import { StudioImageGallery } from "./modules/StudioImageGallery";
import {
  getGenStudioThemePreset,
  isGenStudioThemeKey,
  matchesStudioQuery,
  matchesStudioTheme,
  normalizeStudioSearchValue,
} from "./modules/genStudioThemeSearch";
import type { PromptProps, ImagePromptMetaType, PromptVisibilityType } from "types/app";
import { useAuthStore } from "store/auth";
import { isPublicGenStudioSurface, trackGaEvent, trackTemplateKeyClick } from "utils/analytics/ga4";
import { useImagePromptBookmarks } from "hooks/app/useImagePromptBookmarks";
import { useUserData } from "hooks/auth";
import { getGenStudioTemplateGroup, listPublicGenStudioTemplateGroups } from "libs/api/lab";
import { Wand } from "lucide-react";
import { TemplateGroupSelectionBar } from "./modules/TemplateGroupSelectionBar";
import { useStudioTemplateCatalog } from "./hooks/useStudioTemplateCatalog";
import type { StudioRecommendedTemplateValue } from "utils/app/genStudioTemplateCatalog";

type ImageStudioEditorProps = PromptProps & {
  surface?: "default" | "embedded";
  enableTemplateGroupManagement?: boolean;
  initialQuery?: string;
  initialReferenceImages?: Array<BaseImageType & { preview?: string; name?: string }>;
  initialModelImages?: Array<BaseImageType & { preview?: string; name?: string }>;
  allowedTemplateKeys?: readonly string[];
  initialTemplateKey?: string;
  allowedTemplateVariableKeys?: readonly string[];
  allowCustomPrompt?: boolean;
  templateGroupKey?: string;
  preferredTemplateKeys?: readonly string[];
  preferredTemplateTags?: readonly string[];
  preferredTemplateCategories?: readonly string[];
  /** canonical prop */
  recommendedTemplateKeys?: readonly string[];
  /** @deprecated recommendedTemplateKeys로 전환 중인 호환 alias */
  recommendedTemplates?: readonly ImageStudioRecommendedTemplateType[];
  recommendedTemplateDescription?: { ko: string; en: string };
  initialTemplateVariables?: Readonly<Record<string, string>>;
  /** 진입 surface가 권장하는 시작 비율(사용자 변경 가능). 템플릿 defaultParams보다 우선한다. */
  initialAspectRatio?: string;
  /** 생성 멱등 seed. 같은 조건 재요청이 재과금되지 않게 한다 (SSM-203). */
  generationIdempotencySeed?: string;
  initialOutputVisibility?: PromptVisibilityType;
  requiredTemplateVariableKeys?: readonly string[];
  lockedTemplateVariableKeys?: readonly string[];
  detailPresentation?: "page" | "sheet" | "embedded";
  detailNavigationMode?: "state" | "url" | "route";
  navigationBasePath?: string;
  routeTemplateKey?: string;
  routeDetailMode?: "template" | "custom";
  personaArtifactContext?: PersonaArtifactContextType;
};

const IMAGE_PROVIDER_VALUES = ["google", "openai", "xai"] as const;
type ImageProvider = (typeof IMAGE_PROVIDER_VALUES)[number];
type ImageStudioRecommendedTemplateType = string | { templateKey: string };

function isImageProvider(value: unknown): value is ImageProvider {
  return typeof value === "string" && IMAGE_PROVIDER_VALUES.includes(value as ImageProvider);
}

export function ImageStudioEditor(props: ImageStudioEditorProps) {
  const {
    catalog: imageCatalog,
    source: imageCatalogSource,
    loading: imageCatalogLoading,
  } = useGenStudioModelCatalog("image");
  const [selectedItem, setSelectedItem] = useState<PromptItemType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [showPresetGuide, setShowPresetGuide] = useState(true);
  const [q, setQ] = useState(props.initialQuery || "");
  const [searchField, setSearchField] = useState<PromptSearchFieldType>("all");
  const [searchMode, setSearchMode] = useState<"template" | "image">("template");
  const [imageSearchField, setImageSearchField] = useState<StudioImageSearchFieldType>("all");
  const [templatePage, setTemplatePage] = useState(1);
  const [imagePage, setImagePage] = useState(1);
  const [imageTotal, setImageTotal] = useState(0);
  const [imageResults, setImageResults] = useState<ImagePromptMetaType[]>([]);
  const [isLoadingImageResults, setIsLoadingImageResults] = useState(false);
  const [recentImagesByPrompt, setRecentImagesByPrompt] = useState<Record<string, string[]>>({});
  const [recentMetaByPrompt, setRecentMetaByPrompt] = useState<Record<string, Record<string, ImagePromptMetaType>>>({});
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerMetaBySrc, setViewerMetaBySrc] = useState<Record<string, ImagePromptMetaType>>({});
  const [sheetInitialMode, setSheetInitialMode] = useState<"template" | "custom">("template");
  const [sheetEntrySessionKey, setSheetEntrySessionKey] = useState(0);
  const [visiblePreviewKeys, setVisiblePreviewKeys] = useState<string[]>([]);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [isLoginDrawerOpen, setIsLoginDrawerOpen] = useState(false);
  const isEmbedded = props.surface === "embedded";
  const detailPresentation = props.detailPresentation ?? "page";
  const detailNavigationMode = props.detailNavigationMode ?? "state";
  const navigationBasePath = props.navigationBasePath || "/gen-studio";
  const router = useRouter();
  const searchParams = useSearchParams();
  const canonicalSearchParams = useMemo(
    () => createCanonicalGenStudioTemplateSearchParams(searchParams),
    [searchParams],
  );
  const searchParamString = canonicalSearchParams.toString();
  const shouldUseUrlNavigation = detailPresentation === "page" && detailNavigationMode !== "state";
  const urlQuery = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "q") || "").trim();
  const activeThemeKeyParam = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "theme") || "").trim();
  const activeThemeKey = isGenStudioThemeKey(activeThemeKeyParam) ? activeThemeKeyParam : null;
  const activeThemePreset = getGenStudioThemePreset(activeThemeKey);
  const explicitAllowedTemplateKeys = useMemo(
    () => normalizeStudioTemplateKeyList(props.allowedTemplateKeys),
    [props.allowedTemplateKeys],
  );
  const urlTemplateGroupKey = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "group") || "").trim();
  const requestedTemplateGroupKey = String(props.templateGroupKey || urlTemplateGroupKey).trim();

  // 현재 적용 중인 allow-list를 식별한다.
  // 그룹뿐 아니라 props.allowedTemplateKeys 변경도 별도 allow-list로 취급한다.
  const allowListIdentity = requestedTemplateGroupKey
    ? `group:${requestedTemplateGroupKey}`
    : explicitAllowedTemplateKeys.length > 0
      ? `explicit:${explicitAllowedTemplateKeys.join("\u0000")}`
      : "";

  const [resolvedTemplateGroup, setResolvedTemplateGroup] = useState<{
    key: string;
    templateKeys: string[];
    recommendedTemplateKeys: string[];
    recommendedDescription: { ko: string; en: string } | null;
  }>({
    key: "",
    templateKeys: [],
    recommendedTemplateKeys: [],
    recommendedDescription: null,
  });
  const isTemplateGroupLoading =
    Boolean(requestedTemplateGroupKey) && resolvedTemplateGroup.key !== requestedTemplateGroupKey;
  const allowedTemplateKeys = useMemo(
    () =>
      requestedTemplateGroupKey
        ? resolvedTemplateGroup.key === requestedTemplateGroupKey
          ? resolvedTemplateGroup.templateKeys
          : []
        : explicitAllowedTemplateKeys,
    [explicitAllowedTemplateKeys, requestedTemplateGroupKey, resolvedTemplateGroup],
  );
  const allowedTemplateKeySet = useMemo(() => new Set(allowedTemplateKeys), [allowedTemplateKeys]);
  // 그룹 미존재·조회 실패·빈 그룹이면 전체 목록을 유지한다(content editor와 동일한 fail-soft 정책).
  const hasTemplateAllowList = requestedTemplateGroupKey
    ? resolvedTemplateGroup.key === requestedTemplateGroupKey && allowedTemplateKeys.length > 0
    : allowedTemplateKeys.length > 0;
  const isResolvedGroupActive =
    Boolean(requestedTemplateGroupKey) && resolvedTemplateGroup.key === requestedTemplateGroupKey;
  // 그룹 문서의 추천 큐레이션(중앙 관리)이 있으면 우선, props는 그룹 미설정 시 fallback
  const recommendedTemplateKeys = useMemo(
    () =>
      isResolvedGroupActive && resolvedTemplateGroup.recommendedTemplateKeys.length > 0
        ? resolvedTemplateGroup.recommendedTemplateKeys
        : normalizeStudioRecommendedTemplateProps({
            recommendedTemplateKeys: props.recommendedTemplateKeys,
            recommendedTemplates: props.recommendedTemplates as readonly StudioRecommendedTemplateValue[] | undefined,
          }),
    [
      isResolvedGroupActive,
      props.recommendedTemplateKeys,
      props.recommendedTemplates,
      resolvedTemplateGroup.recommendedTemplateKeys,
    ],
  );
  const recommendedTemplateKeySet = useMemo(() => new Set(recommendedTemplateKeys), [recommendedTemplateKeys]);
  const groupRecommendedDescription =
    isResolvedGroupActive &&
    resolvedTemplateGroup.recommendedDescription &&
    (resolvedTemplateGroup.recommendedDescription.ko || resolvedTemplateGroup.recommendedDescription.en)
      ? {
          ko: resolvedTemplateGroup.recommendedDescription.ko || resolvedTemplateGroup.recommendedDescription.en,
          en: resolvedTemplateGroup.recommendedDescription.en || resolvedTemplateGroup.recommendedDescription.ko,
        }
      : null;
  const requiredTemplateVariableKeys = useMemo(() => {
    const keys = new Set((props.requiredTemplateVariableKeys || []).map((key) => String(key || "").trim()));
    if (selectedItem?.key === GEN_STUDIO_REALISTIC_CHARACTER_REFERENCE_TEMPLATE_KEY) {
      GEN_STUDIO_REALISTIC_CHARACTER_REQUIRED_VARIABLE_KEYS.forEach((key) => keys.add(key));
    }
    return Array.from(keys).filter(Boolean);
  }, [props.requiredTemplateVariableKeys, selectedItem?.key]);
  const getPreferredTemplateRank = useMemo(
    () =>
      createStudioTemplatePreferenceRanker({
        preferredTemplateKeys: props.preferredTemplateKeys,
        preferredTemplateTags: props.preferredTemplateTags,
        preferredTemplateCategories: props.preferredTemplateCategories,
      }),
    [props.preferredTemplateCategories, props.preferredTemplateKeys, props.preferredTemplateTags],
  );

  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { isAdministrator } = useUserData();
  const [isGroupEditMode, setIsGroupEditMode] = useState(false);
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([]);
  const handleRequireLogin = useCallback(() => {
    setIsLoginDrawerOpen(true);
  }, []);
  const handleBookmarkLogout = useCallback(() => {
    setShowBookmarkedOnly(false);
  }, []);
  const { bookmarkedKeys, bookmarkPendingKeys, bookmarkedKeySet, bookmarkOrderMap, handleToggleBookmark } =
    useImagePromptBookmarks({
      isLoggedIn,
      onRequireLogin: handleRequireLogin,
      onLogout: handleBookmarkLogout,
    });

  const routeTemplateKey = String(props.routeTemplateKey || "").trim();
  const deepLinkedTemplateKey = useMemo(() => {
    const primary = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "templateKey") || "").trim();
    const legacy = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "template") || "").trim();
    return routeTemplateKey || primary || legacy;
  }, [canonicalSearchParams, routeTemplateKey]);
  const urlDetailMode = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "detailMode") || "").trim();
  const isRouteCustomIntent = detailNavigationMode === "route" && props.routeDetailMode === "custom";
  const isUrlDetailIntent =
    shouldUseUrlNavigation &&
    (detailNavigationMode === "route" || getGenStudioTemplateSearchParam(canonicalSearchParams, "view") === "detail");

  const lastHandledDeepLinkRef = useRef<string>("");
  const initialTemplateKeyRef = useRef<string>("");
  const lastAppliedUrlQueryRef = useRef<string>("");
  const hasLegacyRecommendedTemplates = props.recommendedTemplates !== undefined;

  useEffect(() => {
    if (!hasLegacyRecommendedTemplates) return;
    logger.warn("[GenStudio] recommendedTemplates is deprecated; use recommendedTemplateKeys instead.");
  }, [hasLegacyRecommendedTemplates]);

  useEffect(() => {
    if (!requestedTemplateGroupKey) return;

    let cancelled = false;
    const request = props.templateGroupKey
      ? getGenStudioTemplateGroup(requestedTemplateGroupKey)
      : listPublicGenStudioTemplateGroups().then(
          (groups) => groups.find((group) => group.key === requestedTemplateGroupKey) || null,
        );

    void request
      .then((group) => {
        if (cancelled) return;
        setResolvedTemplateGroup({
          key: requestedTemplateGroupKey,
          templateKeys: normalizeStudioTemplateKeyList(group?.templateKeys),
          recommendedTemplateKeys: normalizeStudioTemplateKeyList(group?.recommendedTemplateKeys),
          recommendedDescription: group?.recommendedDescription || null,
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
  }, [props.templateGroupKey, requestedTemplateGroupKey]);

  useEffect(() => {
    if (urlQuery === lastAppliedUrlQueryRef.current) return;

    lastAppliedUrlQueryRef.current = urlQuery;
    setQ(urlQuery || props.initialQuery || "");
  }, [props.initialQuery, urlQuery]);

  const pushImageDetailUrl = useCallback(
    (args: { item?: PromptItemType | null; initialMode: "template" | "custom" }) => {
      if (!shouldUseUrlNavigation) return;

      const href =
        args.initialMode === "custom" || !args.item?.key
          ? buildGenStudioCustomUrl({ mode: "image", currentSearchParams: searchParamString })
          : buildGenStudioTemplateUrl({ mode: "image", templateKey: args.item.key, currentSearchParams: searchParamString });
      if (!href) return;
      router.push(href);
    },
    [router, searchParamString, shouldUseUrlNavigation],
  );

  const fetchImagePromptByKey = useCallback(
    async (templateKey: string) => {
      const key = String(templateKey || "").trim();
      if (!key) return null;
      if (hasTemplateAllowList && !allowedTemplateKeySet.has(key)) return null;

      const systemItem = await getImagePrompt(key).catch(() => null);
      if (systemItem) return systemItem as PromptItemType;
      if (!isLoggedIn) return null;

      const serviceItem = await getServiceInternalImagePrompt(key).catch(() => null);
      if (serviceItem) return serviceItem as PromptItemType;

      const userItem = await getImagePrompt(key, { scope: "user" }).catch(() => null);
      return userItem ? ({ ...userItem, templateScope: "user" } as PromptItemType) : null;
    },
    [allowedTemplateKeySet, hasTemplateAllowList, isLoggedIn],
  );

  const fetchImagePromptPage = useCallback(
    (args: { q?: string; limit: number; skip: number }) =>
      loadStudioImagePromptItemsPage({
        ...args,
        enabled: true,
        isLoggedIn,
      }),
    [isLoggedIn],
  );

  const normalizeImageTemplateItem = useCallback(
    (item: PromptItemType) => ({ ...item, templateScope: item.templateScope || "system" }),
    [],
  );
  const sortImageAllowListItems = useCallback(
    (nextItems: PromptItemType[], keys: string[]) => sortStudioTemplateItemsByKeyOrder(nextItems, keys),
    [],
  );

  const {
    items,
    setItems,
    isLoadingItems,
    templateTotal,
    allowListExhausted: allowListExhausted,
  } = useStudioTemplateCatalog({
    kind: "image",
    query: q,
    page: templatePage,
    pageSize: STUDIO_TEMPLATE_GALLERY_PAGE_SIZE,
    defer: isTemplateGroupLoading,
    allowListEnabled: hasTemplateAllowList,
    allowListKeys: allowedTemplateKeys,
    allowListIdentity,
    preferredTemplateKeys: props.preferredTemplateKeys,
    fetchPage: fetchImagePromptPage,
    fetchByKey: fetchImagePromptByKey,
    normalizeItem: normalizeImageTemplateItem,
    sortAllowListItems: sortImageAllowListItems,
  });

  const templateMetaByKey = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => {
          const dp = item.defaultParams;
          const firstSample = Object.values(dp?.modelSamples || {}).find((arr) => arr?.length)?.[0] || "";
          return [item.key, { title: item.title || item.key, thumb: dp?.previewImage || firstSample }];
        }),
      ) as Record<string, { title: string; thumb: string }>,
    [items],
  );

  const handleOpenDetail = useCallback(
    (args: { item: PromptItemType | null; initialMode: "template" | "custom" }) => {
      setSheetInitialMode(args.initialMode);
      setSelectedItem(args.item);
      setSheetEntrySessionKey((prev) => prev + 1);
      setIsSheetOpen(true);
      pushImageDetailUrl(args);
    },
    [pushImageDetailUrl],
  );

  const handleDetailOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsSheetOpen(nextOpen);

      if (nextOpen) return;

      lastHandledDeepLinkRef.current = "";

      if (!shouldUseUrlNavigation) return;
      router.replace(
        resolveGenStudioCloseUrl({
          basePath: navigationBasePath,
          mode: "image",
          currentSearchParams: searchParamString,
          returnUrl: getGenStudioTemplateSearchParam(canonicalSearchParams, "returnUrl"),
        }),
      );
    },
    [canonicalSearchParams, navigationBasePath, router, searchParamString, shouldUseUrlNavigation],
  );

  // items 로드 완료 시 자동 오픈
  useEffect(() => {
    let cancelled = false;

    if (!shouldUseUrlNavigation || !isUrlDetailIntent) return;
    if (!deepLinkedTemplateKey) return;
    if (lastHandledDeepLinkRef.current === deepLinkedTemplateKey) return;

    const matched = items.find((item) => item.key === deepLinkedTemplateKey);
    if (matched) {
      lastHandledDeepLinkRef.current = deepLinkedTemplateKey;
      runAfterCurrentRender(() => {
        if (cancelled) return;
        setSheetInitialMode("template");
        setSelectedItem(matched);
        setSheetEntrySessionKey((prev) => prev + 1);
        setIsSheetOpen(true);
      });
    } else if (!isLoadingItems) {
      void fetchImagePromptByKey(deepLinkedTemplateKey).then((item) => {
        if (cancelled) return;
        if (!item) {
          lastHandledDeepLinkRef.current = deepLinkedTemplateKey;
          router.replace(
            resolveGenStudioCloseUrl({
              basePath: navigationBasePath,
              mode: "image",
              currentSearchParams: searchParamString,
              returnUrl: getGenStudioTemplateSearchParam(canonicalSearchParams, "returnUrl"),
            }),
          );
          return;
        }
        lastHandledDeepLinkRef.current = deepLinkedTemplateKey;
        setItems((prev) => mergeStudioPromptPageItems(prev, [item]));
        setSheetInitialMode("template");
        setSelectedItem(item);
        setSheetEntrySessionKey((prev) => prev + 1);
        setIsSheetOpen(true);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    deepLinkedTemplateKey,
    fetchImagePromptByKey,
    isLoadingItems,
    isUrlDetailIntent,
    items,
    navigationBasePath,
    router,
    searchParamString,
    canonicalSearchParams,
    shouldUseUrlNavigation,
    setItems,
  ]);

  useEffect(() => {
    const initialTemplateKey = String(props.initialTemplateKey || "").trim();
    if (!isEmbedded || !initialTemplateKey || initialTemplateKeyRef.current === initialTemplateKey) return;

    let cancelled = false;
    const openItem = (item: PromptItemType) => {
      if (cancelled) return;
      initialTemplateKeyRef.current = initialTemplateKey;
      runAfterCurrentRender(() => {
        if (!cancelled) handleOpenDetail({ item, initialMode: "template" });
      });
    };
    const matched = items.find((item) => item.key === initialTemplateKey);
    if (matched) {
      openItem(matched);
    } else if (!isLoadingItems) {
      void fetchImagePromptByKey(initialTemplateKey).then((item) => {
        if (!item || cancelled) return;
        setItems((prev) => mergeStudioPromptPageItems(prev, [item]));
        openItem(item);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [fetchImagePromptByKey, handleOpenDetail, isEmbedded, isLoadingItems, items, props.initialTemplateKey, setItems]);

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
    if (!isRouteCustomIntent && urlDetailMode !== "custom") return;
    if (hasTemplateAllowList) return;
    if (lastHandledDeepLinkRef.current === "custom") return;

    runAfterCurrentRender(() => {
      if (cancelled) return;
      if (lastHandledDeepLinkRef.current === "custom") return;

      lastHandledDeepLinkRef.current = "custom";
      setSheetInitialMode("custom");
      setSelectedItem(null);
      setSheetEntrySessionKey((prev) => prev + 1);
      setIsSheetOpen(true);
    });

    return () => {
      cancelled = true;
    };
  }, [hasTemplateAllowList, isRouteCustomIntent, isUrlDetailIntent, shouldUseUrlNavigation, urlDetailMode]);

  const handleQueryChange = useCallback((value: string) => {
    setQ(value);
    setTemplatePage(1);
    setImagePage(1);
  }, []);

  const handleSearchModeChange = useCallback((mode: "template" | "image") => {
    setSearchMode(mode);
    setTemplatePage(1);
    setImagePage(1);
  }, []);

  const handleTemplateSearchFieldChange = useCallback((value: string) => {
    setSearchField(value as PromptSearchFieldType);
    setTemplatePage(1);
  }, []);

  const handleImageSearchFieldChange = useCallback((value: string) => {
    setImageSearchField(value as StudioImageSearchFieldType);
    setImagePage(1);
  }, []);

  const loadImageResults = useCallback(async () => {
    const skip = (imagePage - 1) * STUDIO_TEMPLATE_GALLERY_PAGE_SIZE;
    const commonParams = {
      q: q.trim() || undefined,
      searchField: imageSearchField,
      limit: STUDIO_TEMPLATE_GALLERY_PAGE_SIZE,
      skip,
    };

    setIsLoadingImageResults(true);
    try {
      const [publicResult, privateResult] = await Promise.allSettled([
        listStudioImageMetasPage({
          ...commonParams,
          scope: "all",
          visibility: "public",
        }),
        isLoggedIn
          ? listStudioImageMetasPage({
              ...commonParams,
              scope: "user",
              visibility: "private",
            })
          : Promise.resolve(null),
      ]);

      const publicPage = publicResult.status === "fulfilled" ? publicResult.value : null;
      const privatePage = privateResult.status === "fulfilled" ? privateResult.value : null;
      const rows = [...(publicPage?.items || []), ...(privatePage?.items || [])]
        .filter((item) => Boolean(item?.url))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      const seen = new Set<string>();
      const mergedRows = rows.filter((item) => {
        const key = item.assetId || item.url;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setImageResults(mergedRows.slice(0, STUDIO_TEMPLATE_GALLERY_PAGE_SIZE));
      setImageTotal((publicPage?.total || 0) + (privatePage?.total || 0));
    } catch (error) {
      logger.warn(error);
      setImageResults([]);
      setImageTotal(0);
    } finally {
      setIsLoadingImageResults(false);
    }
  }, [imagePage, imageSearchField, isLoggedIn, q]);

  useEffect(() => {
    if (searchMode !== "image") return;
    let cancelled = false;
    runAfterCurrentRender(() => {
      if (cancelled) return;
      void loadImageResults();
    });
    return () => {
      cancelled = true;
    };
  }, [loadImageResults, searchMode]);

  const bookmarkedItems = useMemo(() => {
    const itemMap = new Map(items.map((item) => [item.key, item] as const));
    return bookmarkedKeys.map((key) => itemMap.get(key)).filter(Boolean) as PromptItemType[];
  }, [items, bookmarkedKeys]);

  const applyTemplatePreviewRows = useCallback(
    (templateKeys: string[], groupedRows: Record<string, ImagePromptMetaType[]>, replaceAll = false) => {
      const nextImagesByPrompt = templateKeys.reduce<Record<string, string[]>>((acc, key) => {
        const rows = Array.isArray(groupedRows[key]) ? groupedRows[key] : [];
        const { images } = mergeStudioRecentMetaRows({ publicRows: rows });
        acc[key] = images;
        return acc;
      }, {});

      const nextMetaByPrompt = templateKeys.reduce<Record<string, Record<string, ImagePromptMetaType>>>((acc, key) => {
        const rows = Array.isArray(groupedRows[key]) ? groupedRows[key] : [];
        const { metaBySrc } = mergeStudioRecentMetaRows({ publicRows: rows });
        acc[key] = metaBySrc;
        return acc;
      }, {});

      setRecentImagesByPrompt((prev) => (replaceAll ? nextImagesByPrompt : { ...prev, ...nextImagesByPrompt }));
      setRecentMetaByPrompt((prev) => (replaceAll ? nextMetaByPrompt : { ...prev, ...nextMetaByPrompt }));
    },
    [],
  );

  const loadRecentPreviewBatch = useCallback(
    async (templateKeys: string[], replaceAll = false) => {
      const keys = Array.from(new Set((templateKeys || []).map((key) => String(key || "").trim()).filter(Boolean)));
      if (!keys.length) {
        if (replaceAll) {
          setRecentImagesByPrompt({});
          setRecentMetaByPrompt({});
        }
        return;
      }

      try {
        const groupedRows = await listStudioImageTemplatePreviewMetas({
          templateKeys: keys,
          perTemplate: HOME_TEMPLATE_PREVIEW_IMG_LIMIT,
        });
        applyTemplatePreviewRows(keys, groupedRows, replaceAll);
      } catch {
        applyTemplatePreviewRows(
          keys,
          keys.reduce<Record<string, ImagePromptMetaType[]>>((acc, key) => {
            acc[key] = [];
            return acc;
          }, {}),
          replaceAll,
        );
      }
    },
    [applyTemplatePreviewRows],
  );

  const loadRecentByPrompt = useCallback(
    async (templateKey: string) => {
      if (!templateKey) return;
      await loadRecentPreviewBatch([templateKey], false);
    },
    [loadRecentPreviewBatch],
  );

  const handleVisibleItemsChange = useCallback((visibleItems: PromptItemType[]) => {
    const keys = visibleItems.map((item) => item.key).filter(Boolean);
    setVisiblePreviewKeys((prev) => {
      if (prev.length === keys.length && prev.every((key, index) => key === keys[index])) return prev;
      return keys;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const keys = visiblePreviewKeys;
    runAfterCurrentRender(() => {
      if (cancelled) return;
      void loadRecentPreviewBatch(keys, true);
    });
    return () => {
      cancelled = true;
    };
  }, [visiblePreviewKeys, loadRecentPreviewBatch]);

  // 카드 선택 핸들러
  const handleSelectPreset = useCallback(
    (item: PromptItemType) => {
      if (isPublicGenStudioSurface()) {
        trackTemplateKeyClick({
          cta_location: "preset_card",
          destination_url: typeof window !== "undefined" ? window.location.href : "",
          template_key: item.key,
          template_title: item.title,
          studio_scope: props.mode,
        });
      }

      handleOpenDetail({ item, initialMode: "template" });
    },
    [handleOpenDetail, props.mode],
  );

  const handleOpenCustomPrompt = useCallback(() => {
    if (isPublicGenStudioSurface()) {
      trackGaEvent("gen_studio_custom_prompt_open", {
        cta_location: "image_template_gallery_secondary",
        destination_url: typeof window !== "undefined" ? window.location.href : "",
        template_key: GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY,
        template_title: "맞춤 프롬프트",
        studio_scope: props.mode,
      });
    }
    handleOpenDetail({ item: null, initialMode: "custom" });
  }, [handleOpenDetail, props.mode]);

  const handleToggleTemplateSelection = useCallback((templateKey: string, selected?: boolean) => {
    setSelectedTemplateKeys((prev) => {
      const nextSelected = selected ?? !prev.includes(templateKey);
      if (nextSelected) return prev.includes(templateKey) ? prev : [...prev, templateKey];
      return prev.filter((key) => key !== templateKey);
    });
  }, []);

  const handleCloseGroupEditMode = useCallback(() => {
    setIsGroupEditMode(false);
    setSelectedTemplateKeys([]);
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim();
    const shouldApplyQuery =
      Boolean(qq) && normalizeStudioSearchValue(qq) !== normalizeStudioSearchValue(activeThemePreset?.query || "");

    const scopedItems = filterStudioTemplateItemsByAllowList(
      items,
      hasTemplateAllowList && !allowListExhausted ? allowedTemplateKeys : undefined,
    );
    const searched = scopedItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (activeThemeKey && !matchesStudioTheme(item, activeThemeKey)) {
          return false;
        }

        if (!shouldApplyQuery) return true;

        return matchesStudioQuery(item, qq, searchField);
      })
      .filter(({ item }) => !showBookmarkedOnly || bookmarkedKeySet.has(item.key));

    return searched
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
    items,
    q,
    searchField,
    activeThemeKey,
    activeThemePreset,
    allowedTemplateKeys,
    allowListExhausted,
    getPreferredTemplateRank,
    hasTemplateAllowList,
    showBookmarkedOnly,
    bookmarkedKeySet,
    bookmarkOrderMap,
  ]);

  const recommendedItems = useMemo(() => {
    return filterStudioRecommendedTemplateItems(filtered, recommendedTemplateKeys);
  }, [filtered, recommendedTemplateKeys]);
  const recommendedItemKey = useMemo(() => recommendedItems.map((item) => item.key).join("\u0000"), [recommendedItems]);
  const galleryItems = useMemo(() => {
    if (!recommendedItems.length) return filtered;
    return filtered.filter((item) => !recommendedTemplateKeySet.has(item.key));
  }, [filtered, recommendedItems.length, recommendedTemplateKeySet]);
  const canShowCustomPromptAction =
    (!hasTemplateAllowList || allowListExhausted) && !isGroupEditMode && !showBookmarkedOnly;

  useEffect(() => {
    let cancelled = false;
    const keys = recommendedItemKey.split("\u0000").filter(Boolean);
    if (!keys.length) return;

    runAfterCurrentRender(() => {
      if (cancelled) return;
      void loadRecentPreviewBatch(keys, false);
    });

    return () => {
      cancelled = true;
    };
  }, [loadRecentPreviewBatch, recommendedItemKey]);

  const handleSheetDone = useCallback(
    (images: string[], coins?: number, meta?: ImageStudioDoneMetaType) => {
      props.onDone?.(images, coins, meta);

      const reloadKey = String(meta?.templateKey || "").trim();
      if (images?.length && reloadKey) void loadRecentByPrompt(reloadKey);
    },
    [props, loadRecentByPrompt],
  );

  const handleViewerTemplateKeyChange = useCallback(
    async (src: string, nextTemplateKey: string) => {
      const row = viewerMetaBySrc[src];
      if (!row?.assetId) throw new Error("asset_id_not_found");

      await setStudioImageTemplateKey(row.assetId, nextTemplateKey);
      const nextTemplateTitle = items.find((item) => item.key === String(nextTemplateKey || "").trim())?.title || "";
      setViewerMetaBySrc((prev) => ({
        ...prev,
        [src]: {
          ...prev[src],
          templateKey: String(nextTemplateKey || "").trim(),
          templateTitle: nextTemplateTitle,
        },
      }));

      const keys = visiblePreviewKeys.length ? visiblePreviewKeys : items.map((item) => item.key).filter(Boolean);
      await loadRecentPreviewBatch(keys, true);
    },
    [viewerMetaBySrc, visiblePreviewKeys, items, loadRecentPreviewBatch],
  );

  const highlightQuery =
    activeThemePreset && normalizeStudioSearchValue(q) === normalizeStudioSearchValue(activeThemePreset.query) ? "" : q;

  const emptyStateText =
    items.length === 0
      ? {
          ko: "등록된 이미지 프롬프트가 없습니다.",
          en: "No image prompts registered.",
        }
      : showBookmarkedOnly
        ? {
            ko:
              bookmarkedItems.length === 0
                ? "북마크한 템플릿이 없습니다."
                : "북마크한 템플릿에서 검색 결과가 없습니다.",
            en:
              bookmarkedItems.length === 0
                ? "No bookmarked templates yet."
                : "No bookmarked templates match your search.",
          }
        : {
            ko: "검색 결과가 없습니다.",
            en: "No matching results.",
          };
  const imageCatalogSection = imageCatalog?.image || null;
  const defaultImageModelByProvider = useMemo<Record<ImageProvider, string>>(
    () =>
      ({
        ...DEFAULT_IMAGE_MODEL_BY_PROVIDER,
        ...getCatalogDefaultModelByProvider(imageCatalogSection),
      }) as Record<ImageProvider, string>,
    [imageCatalogSection],
  );


  const galleryContent = (
    <div className="w-full">
      {/* Hero 섹션 */}
      {!isEmbedded ? (
        <div className="mb-8 flex flex-col items-center gap-2 sm:gap-3">
          <h1 className="text-center leading-tight text-gradient-from-primary">
            <span className="block text-2xl sm:text-3xl lg:text-4xl font-extrabold">
              <Lang
                text={{
                  ko: (
                    <>
                      원하는 AI로 다양한 이미지를
                      <br />
                      생성하고, 편집하세요.
                    </>
                  ),
                  en: (
                    <>
                      Create and edit images
                      <br />
                      with the AI you want.
                    </>
                  ),
                }}
              />
            </span>
          </h1>

          {/* 서브 카피 */}
          <p className="text-xs sm:text-sm text-secondary-text text-center max-w-md">
            {isLoggedIn ? (
              <Lang
                text={{
                  ko: "프로페셔널한 프롬프트 템플릿으로 쉽고 빠르게 고퀄리티 이미지를 만드세요.",
                  en: "Create high-quality images quickly and easily with professional prompt templates.",
                }}
              />
            ) : (
              <Lang
                text={{
                  ko: "로그인 후 이용하세요. 서비스를 이용할 때 코인이 필요해요.",
                  en: "Please log in to use the service. Coins are required to use the service.",
                }}
              />
            )}
          </p>
        </div>
      ) : null}

      {!imageCatalogLoading && imageCatalogSource === "fallback" ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          <Lang
            text={{
              ko: "서버 모델 catalog를 불러오지 못해 기본 이미지 모델 목록으로 동작 중입니다.",
              en: "The server model catalog is unavailable, so fallback image models are in use.",
            }}
          />
        </div>
      ) : null}

      {searchMode === "image" ? (
        <>
          <GenStudioPromptToolbar
            searchMode={searchMode}
            onSearchModeChange={handleSearchModeChange}
            searchField={imageSearchField}
            onSearchFieldChange={handleImageSearchFieldChange}
            searchFieldOptions={STUDIO_IMAGE_SEARCH_FIELD_OPTIONS}
            query={q}
            onQueryChange={handleQueryChange}
            searchPlaceholder={{ ko: "이미지를 검색하세요", en: "Search images" }}
            manage={
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
                      setIsGroupEditMode(true);
                      setSearchMode("template");
                    },
                  }
                : undefined
            }
          />
          <StudioImageGallery
            items={imageResults}
            loading={isLoadingImageResults}
            emptyText={{ ko: "검색된 이미지가 없습니다.", en: "No images found." }}
            page={imagePage}
            pageSize={STUDIO_TEMPLATE_GALLERY_PAGE_SIZE}
            totalItems={imageTotal}
            onPageChange={setImagePage}
            onSelect={(item, index) => {
              const images = imageResults.map((row) => row.url).filter(Boolean);
              setViewerImages(images);
              setViewerMetaBySrc(Object.fromEntries(imageResults.map((row) => [row.url, row])));
              setViewerIndex(index);
              setViewerSrc(item.url);
            }}
          />
        </>
      ) : (
        <StudioTemplateGallery
          items={galleryItems}
          searchField={searchField}
          onSearchFieldChange={handleTemplateSearchFieldChange}
          query={q}
          onQueryChange={handleQueryChange}
          emptyText={emptyStateText}
          recommendedItems={recommendedItems}
          recommendedTitle={{ ko: "추천 템플릿", en: "Recommended templates" }}
          recommendedDescription={
            groupRecommendedDescription ||
            props.recommendedTemplateDescription || {
              ko: "이 작업에 가장 적합한 템플릿부터 시작해 보세요.",
              en: "Start with the templates best suited for this task.",
            }
          }
          loading={(isLoadingItems || isTemplateGroupLoading) && items.length === 0}
          loadingText={{ ko: "이미지 템플릿을 불러오는 중입니다.", en: "Loading image templates." }}
          page={templatePage}
          totalItems={templateTotal}
          onPageChange={setTemplatePage}
          resetKey={[
            q,
            searchField,
            activeThemeKey || "",
            showBookmarkedOnly ? "bookmarks" : "all",
            allowedTemplateKeys.join(","),
            requestedTemplateGroupKey,
            recommendedTemplateKeys.join(","),
          ].join("\u0000")}
          searchMode={searchMode}
          onSearchModeChange={handleSearchModeChange}
          onVisibleItemsChange={handleVisibleItemsChange}
          onTemplateSelect={isGroupEditMode ? undefined : handleSelectPreset}
          customPrompt={
            canShowCustomPromptAction
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
                    setShowBookmarkedOnly((prev) => !prev);
                  },
                }
          }
          manage={
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
                    setIsGroupEditMode(true);
                  },
                }
              : undefined
          }
          selectionBar={
            isGroupEditMode ? (
              <TemplateGroupSelectionBar
                selectedTemplateKeys={selectedTemplateKeys}
                templateMetaByKey={templateMetaByKey}
                onClear={() => setSelectedTemplateKeys([])}
                onDone={handleCloseGroupEditMode}
              />
            ) : undefined
          }
          renderItem={(item) => {
            const itemRecent = recentImagesByPrompt[item.key] || [];
            const itemMetaBySrc = recentMetaByPrompt[item.key] || {};
            const dp = toUnknownRecord(item.defaultParams);
            const dpProvider = isImageProvider(dp.provider) ? dp.provider : "google";
            const cardModelName = String(defaultImageModelByProvider[dpProvider] || defaultImageModelByProvider.google);

            return (
              <>
                {!isGroupEditMode ? (
                  <TemplateBookmarkButton
                    active={bookmarkedKeySet.has(item.key)}
                    loading={Boolean(bookmarkPendingKeys[item.key])}
                    onClick={() => handleToggleBookmark(item.key)}
                    className="absolute right-1.5 top-1.5 z-10"
                  />
                ) : null}
                <div className="space-y-2 py-3">
                  {itemRecent.length > 0 && (
                    <RecentGeneratedImages
                      variant="slide-only"
                      images={itemRecent}
                      metaBySrc={itemMetaBySrc}
                      onSelect={(src, i) => {
                        const selectedIndex = itemRecent.findIndex((itemSrc) => itemSrc === src);
                        setViewerImages(itemRecent);
                        setViewerMetaBySrc(itemMetaBySrc);
                        setViewerIndex(selectedIndex >= 0 ? selectedIndex : i);
                        setViewerSrc(src);
                      }}
                    />
                  )}

                  <PresetCard
                    item={item}
                    modelName={cardModelName}
                    onSelect={() =>
                      isGroupEditMode ? handleToggleTemplateSelection(item.key) : handleSelectPreset(item)
                    }
                    highlightQuery={highlightQuery}
                    highlightField={searchField}
                    contentOnly={true}
                    showMatchedTagsOnly
                    selectionMode={isGroupEditMode}
                    selected={selectedTemplateKeys.includes(item.key)}
                    onSelectionChange={(selected) => handleToggleTemplateSelection(item.key, selected)}
                  />
                </div>
              </>
            );
          }}
        />
      )}


      {/* 최근 이미지 뷰어 */}
      <FixedImageViewer
        open={Boolean(viewerSrc)}
        src={viewerSrc}
        images={viewerImages}
        initialIndex={viewerIndex}
        metaBySrc={viewerMetaBySrc}
        templateOptions={items.map((item) => ({ key: item.key, title: item.title }))}
        onTemplateKeyChange={handleViewerTemplateKeyChange}
        onOpenChange={(v) => !v && setViewerSrc(null)}
      />

      <FloatingToast
        open={!isEmbedded && showPresetGuide}
        onOpenChange={setShowPresetGuide}
        variant="accent"
        position="bottom-center"
        size="md"
        icon={<Wand className="w-6 h-6" />}
        textClassName="flex items-center gap-2 text-sm"
      >
        <Lang
          text={{
            ko: "미리 준비된 프롬프트 템플릿으로 빠르고 쉽게 이미지를 생성할 수 있어요.",
            en: "Quickly and easily generate images with pre-made prompt templates.",
          }}
        />
      </FloatingToast>

      <LoginDialog open={isLoginDrawerOpen} onOpenChange={setIsLoginDrawerOpen} />
    </div>
  );

  return (
    <ImageStudioEditorAdapter
      fallback={galleryContent}
      pending={
        detailPresentation === "page" && isUrlDetailIntent ? (
          <section className="flex h-[100vh] min-h-[42rem] w-full items-center justify-center bg-background text-sm text-secondary-text supports-[height:100dvh]:h-[100dvh]">
            <Lang text={{ ko: "이미지 생성 화면을 준비하고 있습니다.", en: "Preparing image generation." }} />
          </section>
        ) : undefined
      }
      open={isSheetOpen}
      onOpenChange={handleDetailOpenChange}
      presentation={detailPresentation}
      detail={selectedItem}
      mode={props.mode}
      universeId={props.mode === "universe" ? props.universeId : undefined}
      initialMode={sheetInitialMode}
      customTemplateKey={GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY}
      entrySessionKey={sheetEntrySessionKey}
      onDone={handleSheetDone}
      onGenerationStarted={props.onGenerationStarted}
      onGenerationFailed={props.onGenerationFailed}
      imageCatalogSection={imageCatalogSection}
      defaultImageModelByProvider={defaultImageModelByProvider}
      initialReferenceImages={props.initialReferenceImages}
      initialModelImages={props.initialModelImages}
      initialTemplateVariables={props.initialTemplateVariables}
      initialAspectRatio={props.initialAspectRatio}
      generationIdempotencySeed={props.generationIdempotencySeed}
      initialOutputVisibility={props.initialOutputVisibility}
      allowedTemplateVariableKeys={props.allowedTemplateVariableKeys}
      allowCustomPrompt={props.allowCustomPrompt}
      requiredTemplateVariableKeys={requiredTemplateVariableKeys}
      lockedTemplateVariableKeys={props.lockedTemplateVariableKeys}
      personaArtifactContext={props.personaArtifactContext}
      isBookmarked={selectedItem ? bookmarkedKeySet.has(selectedItem.key) : false}
      onToggleBookmark={handleToggleBookmark}
      bookmarkDisabled={selectedItem ? Boolean(bookmarkPendingKeys[selectedItem.key]) : false}
    />
  );
}
