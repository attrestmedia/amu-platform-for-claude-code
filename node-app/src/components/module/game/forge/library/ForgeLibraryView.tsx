"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Box, Image as ImageIcon, LayoutGrid, RefreshCw, Star, User, type LucideIcon } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import { listMyGameCharacters, listStages, listWorldAssets } from "libs/api/game";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { toErrorMessage } from "utils/common";
import { ForgeEmptyState } from "../shared/ForgeEmptyState";
import {
  ASSET_CATEGORY_OPTIONS,
  FORGE_LIBRARY_KINDS,
  type ForgeLibraryItem,
  type ForgeLibraryKind,
  isForgeLibraryAsset,
  toAssetLibraryItem,
  toCharacterLibraryItem,
  toMapLibraryItem,
} from "./forgeLibraryModel";

type LibraryResult = {
  items: ForgeLibraryItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const PAGE_SIZE = 12;
const KIND_META: Record<ForgeLibraryKind, { title: { ko: string; en: string }; description: { ko: string; en: string } }> = {
  characters: {
    title: { ko: "내 캐릭터", en: "My characters" },
    description: { ko: "등록한 캐릭터를 확인하고 마지막으로 작업한 단계에서 이어가세요.", en: "Review your characters and continue from the last step." },
  },
  assets: {
    title: { ko: "내 에셋", en: "My assets" },
    description: { ko: "내가 만든 월드 에셋과 발행된 공용 에셋을 한곳에서 확인하세요.", en: "Browse your world assets and published shared assets in one place." },
  },
  maps: {
    title: { ko: "내 맵", en: "My maps" },
    description: { ko: "맵 스튜디오에서 작업한 맵을 다시 열어 배치를 이어가세요.", en: "Reopen maps from Map studio and continue placing assets." },
  },
  favorites: {
    title: { ko: "즐겨찾기", en: "Favorites" },
    description: { ko: "자주 쓰는 캐릭터·에셋·맵을 모아보는 공간입니다.", en: "A place for characters, assets, and maps you use often." },
  },
};

const KIND_ICONS = { characters: User, assets: ImageIcon, maps: LayoutGrid, favorites: Star } satisfies Record<ForgeLibraryKind, LucideIcon>;

async function loadLibrary(kind: ForgeLibraryKind, page: number, category: string, isAdministrator: boolean): Promise<LibraryResult> {
  if (kind === "characters") {
    const data = await listMyGameCharacters({ universeId: DEFAULT_PLAY_UNIVERSE, limit: 50 });
    return {
      items: data.map(toCharacterLibraryItem),
      pagination: { page: 1, pageSize: data.length || 50, total: data.length, totalPages: 1 },
    };
  }

  if (kind === "assets") {
    const result = await listWorldAssets({
      universeId: DEFAULT_PLAY_UNIVERSE,
      category: category === "all" ? undefined : category,
      page,
      pageSize: PAGE_SIZE,
    });
    return {
      items: result.data.filter(isForgeLibraryAsset).map(toAssetLibraryItem),
      pagination: result.pagination,
    };
  }

  if (kind === "maps") {
    if (!isAdministrator) return { items: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 } };
    const result = await listStages({ domain: "stage", page, pageSize: PAGE_SIZE });
    return {
      items: (result.data || []).map((stage) => toMapLibraryItem(stage as typeof stage & { _id?: string })),
      pagination: result.pagination,
    };
  }

  return { items: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 } };
}

export function ForgeLibraryView({ kind }: { kind: ForgeLibraryKind }) {
  const { isAdministrator } = useUserData();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("all");
  const meta = KIND_META[kind];
  const locked = kind === "maps" && !isAdministrator;
  const query = useQuery({
    queryKey: ["forge-library", kind, page, category, isAdministrator],
    queryFn: () => loadLibrary(kind, page, category, Boolean(isAdministrator)),
    enabled: kind !== "favorites" && !locked,
    staleTime: 15_000,
    retry: 1,
  });

  if (locked) return <LockedLibrary />;

  const Icon = KIND_ICONS[kind];
  const items = query.data?.items || [];
  const pagination = query.data?.pagination;
  const error = query.error ? toErrorMessage(query.error, lang({ ko: "라이브러리를 불러오지 못했습니다.", en: "Failed to load the library." })) : "";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">MY LIBRARY</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-primary-text sm:text-3xl">
            <Icon className="size-6 text-primary" aria-hidden />
            <Lang text={meta.title} />
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text"><Lang text={meta.description} /></p>
        </div>
        <Link href="/assets-studio" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline focus-visible-ring">
          <Lang text={{ ko: "대시보드로 돌아가기", en: "Back to dashboard" }} />
        </Link>
      </header>

      {kind === "assets" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
          <p className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "에셋 카테고리", en: "Asset category" }} /></p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span className="sr-only"><Lang text={{ ko: "에셋 카테고리 필터", en: "Asset category filter" }} /></span>
            <select
              value={category}
              onChange={(event) => { setCategory(event.target.value); setPage(1); }}
              className="min-h-11 rounded-lg border border-border bg-background px-3 font-medium focus-visible-ring"
            >
              {ASSET_CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{lang(option.label)}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {kind === "favorites" ? (
        <ForgeEmptyState
          icon={Star}
          title={{ ko: "즐겨찾기를 준비하고 있습니다", en: "Favorites are coming soon" }}
          description={{ ko: "즐겨찾기 저장 방식을 정리하는 동안 다른 라이브러리에서 작업을 이어갈 수 있습니다.", en: "While favorite storage is being prepared, continue working from another library." }}
          actionHref="/assets-studio/library/characters"
          actionLabel={{ ko: "내 캐릭터 보기", en: "View my characters" }}
        />
      ) : query.isLoading ? (
        <LibraryLoading />
      ) : error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-4 min-h-11" onClick={() => void query.refetch()}>
            <RefreshCw className="mr-2 size-4" aria-hidden />
            <Lang text={{ ko: "다시 불러오기", en: "Try again" }} />
          </Button>
        </section>
      ) : items.length === 0 ? (
        <ForgeEmptyState {...emptyStateFor(kind)} />
      ) : (
        <>
          <section aria-labelledby="forge-library-list-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="forge-library-list-title" className="text-sm font-semibold text-primary-text">
                <Lang text={{ ko: "목록", en: "Library items" }} />
                <span className="ml-2 text-xs font-normal text-secondary-text">{pagination?.total || items.length}</span>
              </h2>
              {query.isFetching ? <span className="text-xs text-secondary-text"><Lang text={{ ko: "새로 고치는 중…", en: "Refreshing…" }} /></span> : null}
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => <LibraryCard key={`${item.kind}:${item.id}`} item={item} />)}
            </ul>
          </section>
          {pagination && pagination.totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3" aria-label={lang({ ko: "라이브러리 페이지 이동", en: "Library pagination" })}>
              <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <Lang text={{ ko: "이전", en: "Previous" }} />
              </Button>
              <span className="text-sm text-secondary-text">{page} / {pagination.totalPages}</span>
              <Button variant="outline" className="min-h-11" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}>
                <Lang text={{ ko: "다음", en: "Next" }} />
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function LibraryCard({ item }: { item: ForgeLibraryItem }) {
  const toneClass = {
    progress: "bg-accent/10 text-primary",
    success: "bg-primary/10 text-primary",
    muted: "bg-muted text-secondary-text",
    shared: "bg-primary/10 text-primary",
  }[item.status.key];

  return (
    <li>
      <article className="overflow-hidden rounded-2xl border border-border bg-surface transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-hover motion-reduce:transform-none">
        <Link href={item.href} className="group block cursor-pointer focus-visible-ring">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 및 사용자 이미지 라이브러리 URL을 공통 카드에서 렌더
              <img src={item.imageUrl} alt={item.alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transform-none" />
            ) : (
              <div className="flex h-full items-center justify-center text-secondary-text"><Box className="size-9" aria-hidden /></div>
            )}
            <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
              <Lang text={item.status.label} />
            </span>
          </div>
          <div className="p-4">
            <h3 className="truncate text-base font-semibold text-primary-text">{item.name}</h3>
            <p className="mt-1 text-sm text-secondary-text"><Lang text={item.detail} /></p>
          </div>
        </Link>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="truncate text-xs text-secondary-text">{formatUpdatedAt(item.updatedAt)}</span>
          <Link href={item.href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary hover:underline focus-visible-ring">
            <Lang text={item.actionLabel} />
          </Link>
        </div>
      </article>
    </li>
  );
}

function LibraryLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={lang({ ko: "라이브러리 불러오는 중", en: "Loading library" })}>
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-72 animate-pulse rounded-2xl border border-border bg-surface-2 motion-reduce:animate-none" />)}
    </div>
  );
}

function LockedLibrary() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
      <div className="relative mx-auto flex min-h-[320px] max-w-xl flex-col items-center justify-center text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-surface-2 text-secondary-text"><LayoutGrid className="size-7" aria-hidden /></div>
        <h1 className="mt-5 text-2xl font-bold text-primary-text"><Lang text={{ ko: "맵 라이브러리는 권한이 필요합니다", en: "Map library access is restricted" }} /></h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-secondary-text"><Lang text={{ ko: "현재 맵 목록은 맵 저작 권한이 있는 사용자에게만 제공됩니다. 대시보드에서 다른 제작 단계를 이어갈 수 있습니다.", en: "Maps are currently available only to users with map authoring permission. Continue another creation step from the dashboard." }} /></p>
        <Button asChild variant="outline" className="mt-6 min-h-11">
          <Link href="/assets-studio" className="cursor-pointer"><Lang text={{ ko: "대시보드로 돌아가기", en: "Back to dashboard" }} /></Link>
        </Button>
      </div>
    </section>
  );
}

function emptyStateFor(kind: Exclude<ForgeLibraryKind, "favorites">) {
  if (kind === "characters") {
    return {
      icon: User,
      title: { ko: "아직 캐릭터가 없습니다", en: "No characters yet" },
      description: { ko: "캐릭터 등록에서 첫 캐릭터를 만들고 이곳에서 작업을 이어가세요.", en: "Create your first character and continue your work here." },
      actionHref: "/assets-studio/character",
      actionLabel: { ko: "캐릭터 등록하기", en: "Register a character" },
    } as const;
  }
  if (kind === "assets") {
    return {
      icon: ImageIcon,
      title: { ko: "아직 에셋이 없습니다", en: "No assets yet" },
      description: { ko: "월드 에셋 단계에서 만들거나 발행된 공용 에셋을 확인해 보세요.", en: "Create an asset in the World assets step or check published shared assets." },
      actionHref: "/assets-studio/world",
      actionLabel: { ko: "월드 에셋으로 이동", en: "Open world assets" },
    } as const;
  }
  return {
    icon: LayoutGrid,
    title: { ko: "아직 맵이 없습니다", en: "No maps yet" },
    description: { ko: "맵 스튜디오에서 첫 맵을 만들고 배치를 시작하세요.", en: "Create your first map in Map studio and start placing assets." },
    actionHref: "/assets-studio/map",
    actionLabel: { ko: "맵 스튜디오로 이동", en: "Open Map studio" },
  } as const;
}

function formatUpdatedAt(value?: string | Date) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "";
}

export { FORGE_LIBRARY_KINDS };
