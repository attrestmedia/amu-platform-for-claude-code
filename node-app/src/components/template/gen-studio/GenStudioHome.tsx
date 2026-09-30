"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Crown,
  Image as ImageIcon,
  Layers,
  MessageSquareText,
  Search,
  ShoppingBag,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { Button, Preloader, ScrollArea } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { TopBar, ServiceManagementAddon, SiteFooter } from "components/module/layout";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { listPublicGenStudioTemplateGroups, listStudioImageTemplatePreviewMetas } from "libs/api/lab";
import { GenStudioLogo } from "./modules/GenStudioLogo";
import { FixedImageViewer } from "./modules/FixedImageViewer";
import type { SpatialGalleryItem } from "./modules/spatial-gallery/types";
import {
  GEN_STUDIO_THEME_SEARCH_PRESETS,
  getStudioThemeMatchScore,
  matchesStudioTheme,
  type GenStudioThemeKey,
} from "./modules/genStudioThemeSearch";
import { loadStudioImagePromptItems, mergeStudioRecentMetaRows } from "utils/app";
import { trackTemplateKeyClick } from "utils/analytics/ga4";
import { buildGenStudioTemplateUrl } from "utils/app/genStudioRouteContract";
import { logger } from "utils/log";
import { cn } from "utils/common";
import type { GenStudioTemplateGroupType, ImagePromptMetaType, PromptItemType } from "types/app";

const TEMPLATE_BROWSER_PATH = "/gen-studio/templates";
const HERO_PREVIEW_TEMPLATE_LIMIT = 16;
const HERO_PREVIEW_PER_TEMPLATE = 4;
const SPOTLIGHT_FEATURED_LIMIT = 1;
const SPOTLIGHT_GRID_LIMIT = 4;
const ALL_TEMPLATES_LIMIT = 12;
const PUBLIC_GROUP_ACCENTS = [
  "from-rose-400/30 via-pink-300/10 to-transparent",
  "from-indigo-400/30 via-blue-300/10 to-transparent",
  "from-teal-400/30 via-cyan-300/10 to-transparent",
  "from-orange-400/30 via-amber-300/10 to-transparent",
] as const;

const GenStudioSpatialGallery = dynamic(
  () => import("./modules/spatial-gallery/GenStudioSpatialGallery"),
  { ssr: false },
);

type LocalizedText = { ko: string; en: string };
type ThemeCategory = {
  key: GenStudioThemeKey;
  icon: typeof ShoppingBag;
  title: LocalizedText;
  pitch: LocalizedText;
  query: string;
  accent: string;
};

const STEP_GUIDES = [
  {
    key: "01",
    icon: Search,
    title: { ko: "템플릿 선택", en: "Pick a template" },
    body: {
      ko: "마케팅·커머스 목적별로 큐레이션된 템플릿 라이브러리에서 출발점을 정합니다.",
      en: "Start from a library curated by marketing and commerce purpose.",
    },
  },
  {
    key: "02",
    icon: Wand2,
    title: { ko: "아이디어 입력", en: "Drop your idea" },
    body: {
      ko: "한 줄 메모만으로도 템플릿이 키워드와 구도를 자동 보완합니다.",
      en: "A single line of intent is enough — the template fills in the rest.",
    },
  },
  {
    key: "03",
    icon: Sparkles,
    title: { ko: "즉시 생성", en: "Generate instantly" },
    body: {
      ko: "코인 기반 AI 파이프라인이 결과물을 빠르게 마무리합니다.",
      en: "The coin-powered AI pipeline finishes the artwork in seconds.",
    },
  },
] as const;

const THEME_CATEGORIES: ThemeCategory[] = [
  {
    key: "commerce",
    icon: ShoppingBag,
    title: { ko: "이커머스 이미지 생성", en: "E-commerce visuals" },
    pitch: {
      ko: "상품 컷, 배경 합성, 썸네일·배너까지 판매 화면에 바로 쓰는 이미지를 한 번에",
      en: "Product shots, composites, thumbnails, and banners ready for the storefront.",
    },
    query: GEN_STUDIO_THEME_SEARCH_PRESETS.commerce.query,
    accent: "from-emerald-400/30 via-emerald-300/10 to-transparent",
  },
  {
    key: "brand",
    icon: Crown,
    title: { ko: "브랜드 비주얼", en: "Brand visuals" },
    pitch: {
      ko: "키 비주얼·아이덴티티·시즌 캠페인까지 일관된 브랜드 톤으로 마무리",
      en: "Key visuals, identity, and seasonal campaigns kept on brand.",
    },
    query: GEN_STUDIO_THEME_SEARCH_PRESETS.brand.query,
    accent: "from-violet-400/30 via-fuchsia-300/10 to-transparent",
  },
  {
    key: "social",
    icon: MessageSquareText,
    title: { ko: "SNS · 광고 콘텐츠", en: "Social & ad content" },
    pitch: {
      ko: "인스타·스레드·유튜브 썸네일까지 채널별 톤에 맞춘 콘텐츠를 빠르게",
      en: "Instagram, Threads, YouTube thumbnails — tuned per channel.",
    },
    query: GEN_STUDIO_THEME_SEARCH_PRESETS.social.query,
    accent: "from-amber-400/30 via-orange-300/10 to-transparent",
  },
  {
    key: "lifestyle",
    icon: Camera,
    title: { ko: "라이프스타일 · 무드", en: "Lifestyle & mood" },
    pitch: {
      ko: "감성 무드, 인물·풍경·일상 컷으로 매거진형 콘텐츠와 룩북 제작에 최적",
      en: "Mood, lifestyle, and editorial visuals for magazine and lookbook flows.",
    },
    query: GEN_STUDIO_THEME_SEARCH_PRESETS.lifestyle.query,
    accent: "from-sky-400/30 via-cyan-300/10 to-transparent",
  },
];

function getTemplateHref(item: PromptItemType) {
  return buildGenStudioTemplateUrl({ mode: "image", templateKey: item.key }) || `${TEMPLATE_BROWSER_PATH}?mode=image`;
}

function getThemeSearchHref(theme: ThemeCategory) {
  const params = new URLSearchParams({
    mode: "image",
    theme: theme.key,
    q: theme.query,
  });

  return `${TEMPLATE_BROWSER_PATH}?${params.toString()}`;
}

function getPublicGroupHref(groupKey: string) {
  const params = new URLSearchParams({ mode: "image", group: groupKey });
  return `${TEMPLATE_BROWSER_PATH}?${params.toString()}`;
}

export function GenStudioHome() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { userData, isAdministrator } = useUserData();
  const [items, setItems] = useState<PromptItemType[]>([]);
  const [publicGroups, setPublicGroups] = useState<GenStudioTemplateGroupType[]>([]);
  const [previewMap, setPreviewMap] = useState<Record<string, string[]>>({});
  const [metaMap, setMetaMap] = useState<Record<string, Record<string, ImagePromptMetaType>>>({});
  const [previewsLoaded, setPreviewsLoaded] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerMetaBySrc, setViewerMetaBySrc] = useState<Record<string, ImagePromptMetaType>>({});

  useEffect(() => {
    loadStudioImagePromptItems({ enabled: true, isLoggedIn })
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch(logger.warn);
  }, [isLoggedIn]);

  useEffect(() => {
    listPublicGenStudioTemplateGroups()
      .then((groups) => setPublicGroups(groups))
      .catch(logger.warn);
  }, []);

  const previewSourceItems = useMemo(() => {
    const keys = new Set(items.slice(0, HERO_PREVIEW_TEMPLATE_LIMIT).map((item) => item.key));
    publicGroups.forEach((group) => {
      if (group.coverTemplateKey) keys.add(group.coverTemplateKey);
    });
    return items.filter((item) => keys.has(item.key));
  }, [items, publicGroups]);

  useEffect(() => {
    const keys = previewSourceItems.map((item) => item.key).filter(Boolean);
    if (!keys.length) return;
    let cancelled = false;
    listStudioImageTemplatePreviewMetas({
      templateKeys: keys,
      perTemplate: HERO_PREVIEW_PER_TEMPLATE,
    })
      .then((groupedRows) => {
        if (cancelled) return;
        const nextImages: Record<string, string[]> = {};
        const nextMeta: Record<string, Record<string, ImagePromptMetaType>> = {};
        keys.forEach((key) => {
          const { images, metaBySrc } = mergeStudioRecentMetaRows({ publicRows: groupedRows[key] || [] });
          nextImages[key] = images;
          nextMeta[key] = metaBySrc;
        });
        setPreviewMap(nextImages);
        setMetaMap(nextMeta);
      })
      .catch(logger.warn)
      .finally(() => {
        if (!cancelled) setPreviewsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [previewSourceItems]);

  const spatialGalleryItems = useMemo(() => {
    const result: SpatialGalleryItem[] = [];
    const seen = new Set<string>();
    const templateByKey = new Map(items.map((item) => [item.key, item]));
    const templateKeys = Object.keys(previewMap);
    const maxPerTemplate = Math.max(0, ...templateKeys.map((key) => previewMap[key]?.length || 0));

    for (let imageIndex = 0; imageIndex < maxPerTemplate; imageIndex += 1) {
      templateKeys.forEach((key) => {
        const src = previewMap[key]?.[imageIndex];
        if (!src || seen.has(src)) return;
        seen.add(src);
        result.push({
          src,
          meta: metaMap[key]?.[src],
          templateKey: key,
          templateTitle: templateByKey.get(key)?.title || key,
        });
      });
    }

    return result;
  }, [previewMap, metaMap, items]);

  const themeCategories = useMemo(() => {
    return THEME_CATEGORIES.map((theme) => {
      const matched = items
        .map((item) => ({
          item,
          score: getStudioThemeMatchScore(item, theme.key),
        }))
        .filter(({ item, score }) => score > 0 && matchesStudioTheme(item, theme.key))
        .sort((a, b) => b.score - a.score);

      const cover = matched.map(({ item }) => (previewMap[item.key] || [])[0]).find(Boolean);

      return { theme, count: matched.length, cover };
    });
  }, [items, previewMap]);

  const publicGroupThemes = useMemo(
    () =>
      publicGroups.map((group, index) => {
        const coverItem = items.find((item) => item.key === group.coverTemplateKey);
        const cover =
          (previewMap[group.coverTemplateKey] || [])[0] || String(coverItem?.defaultParams?.previewImage || "");
        return {
          group,
          cover,
          accent: PUBLIC_GROUP_ACCENTS[index % PUBLIC_GROUP_ACCENTS.length],
        };
      }),
    [items, previewMap, publicGroups],
  );

  const spotlight = useMemo(() => {
    const candidates = items.filter((item) => (previewMap[item.key]?.length || 0) > 0);
    return {
      featured: candidates.slice(0, SPOTLIGHT_FEATURED_LIMIT),
      grid: candidates.slice(SPOTLIGHT_FEATURED_LIMIT, SPOTLIGHT_FEATURED_LIMIT + SPOTLIGHT_GRID_LIMIT),
    };
  }, [items, previewMap]);

  const allTemplates = useMemo(() => items.slice(0, ALL_TEMPLATES_LIMIT), [items]);

  const totalImages = useMemo(
    () => Object.values(previewMap).reduce((sum, list) => sum + (list?.length || 0), 0),
    [previewMap],
  );
  const heroEyebrowText = isLoggedIn
    ? { ko: "AI 이미지 자동 생성 스튜디오", en: "AI image generation studio" }
    : { ko: "AMU의 무료 AI 이미지 생성", en: "Free AI image generation by AMU" };

  const handleTemplateClick = useCallback((item: PromptItemType, ctaLocation: string) => {
    trackTemplateKeyClick({
      cta_location: ctaLocation,
      destination_url: getTemplateHref(item),
      template_key: item.key,
      template_title: item.title,
      studio_scope: "user",
      entry_mode: "image",
    });
  }, []);

  const openViewer = useCallback(
    (selected: SpatialGalleryItem) => {
      const list = spatialGalleryItems.map((item) => item.src);
      const meta = spatialGalleryItems.reduce<Record<string, ImagePromptMetaType>>((acc, item) => {
        if (item.meta) acc[item.src] = item.meta;
        return acc;
      }, {});
      const idx = Math.max(0, list.indexOf(selected.src));
      setViewerImages(list);
      setViewerMetaBySrc(meta);
      setViewerIndex(idx);
      setViewerSrc(selected.src);
    },
    [spatialGalleryItems],
  );

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background text-primary-text">
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.push(TEMPLATE_BROWSER_PATH)}
        logoutRedirectPage="/gen-studio"
        serviceAddon={<ServiceManagementAddon variant="genstudio" />}
        serviceName="gen-studio"
      >
        <Link href="/gen-studio">
          <GenStudioLogo />
        </Link>
      </TopBar>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-90"
            style={{
              backgroundImage:
                "radial-gradient(60% 50% at 18% 28%, hsl(var(--accent) / 0.18), transparent 70%), radial-gradient(50% 40% at 82% 70%, hsl(var(--primary) / 0.14), transparent 72%)",
            }}
          />
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.95fr)] lg:px-8 lg:py-20">
            <div className="flex flex-col justify-center">
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold text-accent-text">
                <Sparkles className="h-3.5 w-3.5" />
                <Lang text={heroEyebrowText} />
              </div>

              <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                <Lang
                  text={{
                    ko: (
                      <>
                        클릭 한 번으로
                        <br />
                        완성도 높은
                        <br />
                        <span className="text-accent-text dark:text-accent">이미지를 만드세요</span>
                      </>
                    ),
                    en: (
                      <>
                        One click,
                        <br />
                        polished AI
                        <br />
                        <span className="text-accent-text dark:text-accent">visuals shipped</span>
                      </>
                    ),
                  }}
                />
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-secondary-text sm:text-lg">
                <Lang
                  text={{
                    ko: "마케팅·커머스·브랜드를 위해 엄선된 템플릿으로 원하는 AI 모델을 사용해 매력적인 콘텐츠를 생성하세요.",
                    en: "Create content using preferred AI model with carefully selected templates for marketing, commerce, branding.",
                  }}
                />
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild rounded="xl" className="h-12 gap-2 px-5 text-base">
                  <Link href={TEMPLATE_BROWSER_PATH}>
                    <Zap className="icon-xs" />
                    <Lang text={{ ko: "시작하기", en: "Start" }} />
                  </Link>
                </Button>
                <Button asChild variant="outline" rounded="xl" className="h-12 gap-2 px-5 text-base">
                  <Link href={TEMPLATE_BROWSER_PATH}>
                    <Search className="icon-xs" />
                    <Lang text={{ ko: "템플릿 둘러보기", en: "Browse templates" }} />
                  </Link>
                </Button>
              </div>

              <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                <HeroStat
                  value={items.length ? `${items.length}+` : "—"}
                  label={{ ko: "활성 템플릿", en: "Active templates" }}
                />
                <HeroStat
                  value={totalImages ? `${totalImages}+` : "—"}
                  label={{ ko: "공개 결과물", en: "Public outputs" }}
                />
                <HeroStat value="Usability" label={{ ko: "쉽고 빠르게", en: "Easy & Fast" }} />
              </div>
            </div>

            <div className="relative min-h-[20rem] sm:min-h-[24rem]">
              {!previewsLoaded ? (
                <HeroMosaicLoading />
              ) : spatialGalleryItems.length > 0 ? (
                <GenStudioSpatialGallery items={spatialGalleryItems} onOpen={openViewer} />
              ) : (
                <HeroMosaicFallback />
              )}
            </div>
          </div>
        </section>

        {/* THEME CATEGORIES */}
        <section className="border-b border-border/60">
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <SectionHeader
              title={{ ko: "테마별 템플릿", en: "Themed Template" }}
              body={{
                ko: "테마로 필요한 템플릿을 찾아 빠르게 시작하세요.",
                en: "Find the templates with a theme and started quickly.",
              }}
              href={TEMPLATE_BROWSER_PATH}
              hrefLabel={{ ko: "모든 템플릿 보기", en: "Template browser" }}
            />

            <div className="min-w-0 -mx-4 sm:-mx-6">
              <ScrollArea dragOnScrollX={true} dragIgnoreInteractive={true}>
                <div className="flex gap-4 px-4 sm:px-6">
                  {themeCategories.map(({ theme, count, cover }) => {
                    const Icon = theme.icon;
                    return (
                      <Link
                        key={theme.key}
                        href={getThemeSearchHref(theme)}
                        className="min-w-[300px] group relative flex aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent/60"
                      >
                        {cover ? (
                          <CoverImage src={cover} alt={lang(theme.title)} className="absolute inset-0" />
                        ) : (
                          <div className="absolute inset-0 bg-muted" />
                        )}
                        <div aria-hidden className={cn("absolute inset-0 bg-gradient-to-t", theme.accent)} />
                        <div
                          aria-hidden
                          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10"
                        />
                        <div className="relative z-10 flex h-full w-full flex-col justify-between p-5">
                          <div className="flex items-center justify-between -mt-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-sm">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xxs font-semibold text-white backdrop-blur-sm">
                              {count > 0
                                ? lang({ ko: `템플릿 ${count}+`, en: `${count}+ templates` })
                                : lang({ ko: "준비 중", en: "Coming soon" })}
                            </span>
                          </div>
                          <div>
                            <p className="text-xl font-extrabold text-white sm:text-2xl">
                              <Lang text={theme.title} />
                            </p>
                            <p className="mt-2 text-sm leading-6 text-white/80">
                              <Lang text={theme.pitch} />
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                  {publicGroupThemes.map(({ group, cover, accent }) => (
                    <Link
                      key={group.key}
                      href={getPublicGroupHref(group.key)}
                      className="group relative flex aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent/60"
                    >
                      {cover ? (
                        <CoverImage src={cover} alt={group.title} className="absolute inset-0" />
                      ) : (
                        <div className="absolute inset-0 bg-muted" />
                      )}
                      <div aria-hidden className={cn("absolute inset-0 bg-gradient-to-t", accent)} />
                      <div
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10"
                      />
                      <div className="relative z-10 flex h-full w-full flex-col justify-between p-5">
                        <div className="-mt-2 flex items-center justify-between">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-sm">
                            <Layers className="h-4 w-4" />
                          </span>
                          <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xxs font-semibold text-white backdrop-blur-sm">
                            {lang({
                              ko: `템플릿 ${group.templateKeys.length}`,
                              en: `${group.templateKeys.length} templates`,
                            })}
                          </span>
                        </div>
                        <div>
                          <p className="text-xl font-extrabold text-white sm:text-2xl">
                            <Lang text={{ ko: group.title, en: group.title }} />
                          </p>
                          {group.description ? (
                            <p className="mt-2 text-sm leading-6 text-white/80">
                              <Lang text={{ ko: group.description, en: group.description }} />
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </section>

        {/* 3-STEP PROCESS */}
        <section className="border-b border-border/60 bg-surface/30">
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h2 className="text-2xl font-extrabold text-primary-text sm:text-3xl">
                <Lang text={{ ko: "3단계로 끝나는 AI 이미지 생성", en: "AI image generation in 3 steps" }} />
              </h2>
              <p className="mt-2 text-sm text-secondary-text">
                <Lang
                  text={{
                    ko: "템플릿을 고르고 아이디어 한 줄만 입력하면 결과물이 완성됩니다.",
                    en: "Pick a template, type a single idea, and your visuals are ready.",
                  }}
                />
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {STEP_GUIDES.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.key}
                    className="group relative overflow-hidden rounded-2xl border-2 border-accent bg-card p-6 transition-colors"
                  >
                    <span className="absolute top-4 right-4 text-xxs font-mono font-semibold uppercase tracking-[0.2em] text-accent-text dark:text-accent">
                      {step.key}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/30 text-accent-text dark:text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-base font-bold text-card-foreground">
                      <Lang text={step.title} />
                    </p>
                    <p className="mt-2 text-sm leading-6 text-secondary-text">
                      <Lang text={step.body} />
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SPOTLIGHT — 자연 비율 masonry */}
        {(spotlight.featured.length > 0 || spotlight.grid.length > 0) && (
          <section className="border-b border-border/60">
            <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <SectionHeader
                title={{ ko: "인기 템플릿", en: "Popular template" }}
                body={{
                  ko: "가장 많은 선택을 받은 템플릿 Best 5를 소개합니다.",
                  en: "Introducing the Top 5 Most Selected Templates.",
                }}
                href={TEMPLATE_BROWSER_PATH}
                hrefLabel={{ ko: "모든 템플릿 보기", en: "Template browser" }}
              />

              <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {spotlight.featured.map((item) => {
                  const cover = (previewMap[item.key] || [])[0];

                  return (
                    <Link
                      key={item.key}
                      href={getTemplateHref(item)}
                      onClick={() => handleTemplateClick(item, "home_spotlight_featured")}
                      className={cn(
                        "group relative flex aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-card",
                        "lg:h-full lg:aspect-auto lg:self-stretch",
                      )}
                    >
                      <div className="relative h-full w-full overflow-hidden bg-muted">
                        {cover ? (
                          <CoverImage src={cover} alt={item.title} className="absolute inset-0" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-10 w-10" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-5">
                          <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-white/70">
                            <Lang text={{ ko: "추천 템플릿", en: "Editor's pick" }} />
                          </p>
                          <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">{item.title}</p>
                          {item.categories?.length ? (
                            <p className="mt-1 text-xs text-white/80">{item.categories.slice(0, 3).join(" · ")}</p>
                          ) : null}
                          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                            <Lang text={{ ko: "이 템플릿으로 생성", en: "Use this template" }} />
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}

                {/* 고정 비율 2x2 grid — featured 높이 기준 */}
                <div className="grid grid-cols-2 gap-3">
                  {spotlight.grid.map((item) => {
                    const cover = (previewMap[item.key] || [])[0];

                    return (
                      <Link
                        key={item.key}
                        href={getTemplateHref(item)}
                        onClick={() => handleTemplateClick(item, "home_spotlight_grid")}
                        className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-accent/60"
                      >
                        <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
                          {cover ? (
                            <CoverImage src={cover} alt={item.title} className="absolute inset-0" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-7 w-7" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                          <div className="absolute inset-x-0 bottom-0 p-3 bg-background/30">
                            <p className="truncate text-sm font-bold text-white">{item.title}</p>
                            {item.categories?.length ? (
                              <p className="mt-0.5 truncate text-xxs text-white/80">{item.categories[0]}</p>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Recommended TEMPLATES */}
        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <SectionHeader
            title={{ ko: "최신 템플릿", en: "Recent templates" }}
            body={{
              ko: "최근 업데이트 된 템플릿을 소개합니다.",
              en: "Freshly Updated Templates Are Here.",
            }}
            href={TEMPLATE_BROWSER_PATH}
            hrefLabel={{ ko: "모든 템플릿 보기", en: "Template browser" }}
          />

          {allTemplates.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed p-10">
              <Preloader variant="spin" size="md" />
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {allTemplates.map((item) => {
                const images = previewMap[item.key] || [];
                const cover = images[0] || (item.defaultParams?.previewImage as string) || "";
                return (
                  <Link
                    key={item.key}
                    href={getTemplateHref(item)}
                    onClick={() => handleTemplateClick(item, "home_all_templates")}
                    className="relative group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-accent/60 group"
                  >
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
                      {cover ? (
                        <CoverImage
                          src={cover}
                          alt={item.title}
                          className="absolute inset-0 duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Layers className="h-7 w-7" />
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 flex flex-1 flex-col gap-1 p-4 duration-500 bg-background/30">
                      <p className="truncate text-sm font-bold text-foreground/80">{item.title}</p>
                      {item.categories?.length ? (
                        <p className="truncate text-xs text-foreground/60">{item.categories.slice(0, 3).join(" · ")}</p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <SiteFooter className="mt-4" layout="wide" />

      <FixedImageViewer
        open={Boolean(viewerSrc)}
        src={viewerSrc}
        images={viewerImages}
        initialIndex={viewerIndex}
        metaBySrc={viewerMetaBySrc}
        templateOptions={items.map((item) => ({ key: item.key, title: item.title }))}
        onOpenChange={(v) => !v && setViewerSrc(null)}
      />
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: LocalizedText }) {
  return (
    <div className="border-l border-border pl-4">
      <p className="text-xl font-bold text-primary-text">{value}</p>
      <p className="mt-1 text-xs text-secondary-text">
        <Lang text={label} />
      </p>
    </div>
  );
}

function SectionHeader({
  title,
  body,
  href,
  hrefLabel,
}: {
  title: LocalizedText;
  body: LocalizedText;
  href: string;
  hrefLabel: LocalizedText;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row">
      <div>
        <h2 className="text-2xl font-extrabold text-primary-text sm:text-3xl">
          <Lang text={title} />
        </h2>
        <p className="mt-2 text-sm text-secondary-text">
          <Lang text={body} />
        </p>
      </div>
      <Button asChild variant="link" className="w-fit gap-1 p-0">
        <Link href={href} className="inline-flex items-center">
          <Lang text={hrefLabel} />
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function CoverImage({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  return (
    <ImageBox
      src={src}
      alt={alt}
      width="100%"
      height="100%"
      objectFit="object-cover"
      allowUpscale
      className={cn("h-full w-full", className)}
    />
  );
}

function HeroMosaicLoading() {
  return (
    <div
      className="relative flex h-full min-h-[20rem] w-full items-center justify-center overflow-hidden sm:min-h-[24rem]"
      role="status"
      aria-live="polite"
    >
      <Preloader variant="spin" size="lg" />
      <span className="sr-only">
        <Lang text={{ ko: "공개 템플릿 결과물 불러오는 중", en: "Loading public template outputs" }} />
      </span>
    </div>
  );
}

function HeroMosaicFallback() {
  return (
    <div className="relative h-full min-h-[20rem] w-full overflow-hidden sm:min-h-[24rem]">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ImageIcon className="h-10 w-10 text-accent-text dark:text-accent" />
        <p className="text-sm font-bold text-primary-text">
          <Lang
            text={{
              ko: "공개 템플릿 결과물이 이 영역에 표시됩니다.",
              en: "Public template outputs appear here.",
            }}
          />
        </p>
        <p className="max-w-xs text-xs text-secondary-text">
          <Lang
            text={{
              ko: "템플릿에 공개 결과물이 생기면 자동으로 모자이크가 채워집니다.",
              en: "The mosaic auto-fills as templates accumulate public outputs.",
            }}
          />
        </p>
      </div>
    </div>
  );
}
