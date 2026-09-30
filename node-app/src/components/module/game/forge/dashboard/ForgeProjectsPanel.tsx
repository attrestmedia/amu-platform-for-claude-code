"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Box, ChevronRight, Map, Plus, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import type { ForgeRecentWorkItem, ForgeSummary } from "libs/api/game/forgeSummaryClient";
import type { ForgeLocalizedText } from "../model/forgeGlossary";

type FilterKind = "all" | "character" | "asset" | "map";

const FILTERS: Array<{ key: FilterKind; label: ForgeLocalizedText }> = [
  { key: "all", label: { ko: "전체", en: "All" } },
  { key: "character", label: { ko: "캐릭터", en: "Characters" } },
  { key: "asset", label: { ko: "에셋", en: "Assets" } },
  { key: "map", label: { ko: "맵", en: "Maps" } },
];

const KIND_ICON: Record<Exclude<FilterKind, "all">, LucideIcon> = {
  character: User,
  asset: Box,
  map: Map,
};

const KIND_LABEL: Record<Exclude<FilterKind, "all">, ForgeLocalizedText> = {
  character: { ko: "캐릭터", en: "Character" },
  asset: { ko: "에셋", en: "Asset" },
  map: { ko: "맵", en: "Map" },
};

const ITEM_HREF: Record<Exclude<FilterKind, "all">, string> = {
  character: "/assets-studio/character",
  asset: "/assets-studio/world",
  map: "/assets-studio/map",
};

function relativeTime(value?: string): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return minutes <= 0 ? "방금 전" : `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

/** 내 프로젝트 패널 — recentWork 병합 목록 + 칩 필터 + '+' 타일 + 빈 상태(Q4). */
export function ForgeProjectsPanel({ summary }: { summary: ForgeSummary | undefined }) {
  const [filter, setFilter] = useState<FilterKind>("all");
  const recentWork = summary?.recentWork || [];
  const filtered = filter === "all" ? recentWork : recentWork.filter((item) => item.kind === filter);
  const visible = filtered.slice(0, 3);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-primary-text">
          <Lang text={{ ko: "내 프로젝트", en: "My projects" }} />
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  filter === f.key ? "bg-surface-2 text-primary-text" : "text-secondary-text hover:text-primary-text",
                )}
              >
                <Lang text={f.label} />
              </button>
            ))}
          </div>
          <Link
            href="/assets-studio/library/characters"
            className="hidden items-center gap-0.5 text-[11px] font-medium text-secondary-text hover:text-primary-text sm:flex"
          >
            <Lang text={{ ko: "모두 보기", en: "View all" }} />
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {recentWork.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-hover px-4 py-8 text-center">
          <p className="text-sm text-secondary-text">
            <Lang
              text={{
                ko: "아직 만든 것이 없어요. 캐릭터 등록부터 시작해 보세요.",
                en: "Nothing yet. Start by registering a character.",
              }}
            />
          </p>
          <Link
            href="/assets-studio/character"
            className="inline-flex h-10 items-center rounded-[10px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
          >
            <Lang text={{ ko: "캐릭터 등록하기", en: "Register a character" }} />
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {visible.map((item) => (
            <WorkTile key={`${item.kind}:${item.id}`} item={item} />
          ))}
          <Link
            href="/assets-studio/character"
            className="flex min-h-[7rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-hover text-secondary-text hover:border-primary/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">
              <Plus className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-xs">
              <Lang text={{ ko: "새 프로젝트 만들기", en: "New project" }} />
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}

function WorkTile({ item }: { item: ForgeRecentWorkItem }) {
  const kind = item.kind as Exclude<FilterKind, "all">;
  const Icon = KIND_ICON[kind];
  const href = ITEM_HREF[kind];

  return (
    <Link href={href} className="overflow-hidden rounded-xl border border-border hover:border-border-hover">
      <div className="relative aspect-[16/11] bg-surface-2">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt="" fill sizes="160px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-text">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[13px] font-semibold text-primary-text">{item.name}</p>
        <p className="truncate text-[11px] text-muted-text">
          <Lang text={KIND_LABEL[kind]} />
          {item.updatedAt ? ` · ${relativeTime(item.updatedAt)}` : ""}
        </p>
      </div>
    </Link>
  );
}
