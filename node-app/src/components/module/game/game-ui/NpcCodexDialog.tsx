"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, Lock, RefreshCw, Sparkles, User } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Preloader } from "@amu-labs/ui";
import { AvatarThumbnail } from "components/module/image";
import { Lang } from "components/module/i18n";
import { getNpcCodex } from "libs/api/game/npcCodexClient";
import type { IntimacyLevelType } from "consts/game/gameEntities";
import { cn } from "utils/common";

/**
 * @docHint
 * @purpose Play NPC 도감의 미발견 그림자·발견 프로필·친밀도 단계 표시
 * @process dialog open 시 owner codex 조회  progress 표시  redacted/discovered 카드 렌더  오류 재시도
 * @domain game.npc-codex
 * @scope client
 */

const LEVEL_META: Record<IntimacyLevelType, { ko: string; en: string; className: string }> = {
  stranger: { ko: "낯선 사이", en: "Stranger", className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  familiar_face: { ko: "익숙한 얼굴", en: "Familiar", className: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  acquaintance: { ko: "지인", en: "Acquaintance", className: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  friend: { ko: "친구", en: "Friend", className: "bg-green-500/15 text-green-700 dark:text-green-300" },
  close_friend: { ko: "가까운 친구", en: "Close friend", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  best_friend: { ko: "절친", en: "Best friend", className: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  soulmate: { ko: "소울메이트", en: "Soulmate", className: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
};

export function NpcCodexDialog({
  open,
  onOpenChange,
  universeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universeId: string;
}) {
  const codexQuery = useQuery({
    queryKey: ["npc-codex", universeId],
    queryFn: () => getNpcCodex(universeId),
    enabled: open && Boolean(universeId),
    staleTime: 15_000,
  });
  const codex = codexQuery.data;
  const total = codex?.summary.total || 0;
  const discovered = codex?.summary.discovered || 0;
  const progress = total > 0 ? Math.round((discovered / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[120]"
        overlayClassName="z-[110]"
        innerWrapClassName="w-[calc(100vw-1rem)] max-w-4xl max-h-[calc(100dvh-1rem)] gap-0 overflow-hidden p-0 [&>button]:h-11 [&>button]:w-11"
      >
        <DialogHeader className="border-b border-border px-4 py-4 pr-14 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <Lang text={{ ko: "NPC 도감", en: "NPC Codex" }} />
          </DialogTitle>
          <div className="pt-3" data-testid="npc-codex-progress">
            <div className="mb-1 flex items-center justify-between text-xs text-secondary-text">
              <span>
                <Lang text={{ ko: "발견한 친구", en: "Discovered" }} />
              </span>
              <span>{discovered} / {total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-64 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {codexQuery.isLoading ? (
            <Preloader container variant="spin" size="md" />
          ) : codexQuery.isError ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-secondary-text">
                <Lang text={{ ko: "도감을 불러오지 못했습니다.", en: "Could not load the codex." }} />
              </p>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => codexQuery.refetch()}
                disabled={codexQuery.isFetching}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", codexQuery.isFetching && "animate-spin")} />
                <Lang text={{ ko: "다시 시도", en: "Try again" }} />
              </Button>
            </div>
          ) : !codex?.items.length ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center text-secondary-text">
              <BookOpen className="h-10 w-10 opacity-50" />
              <Lang text={{ ko: "아직 등록된 NPC가 없습니다.", en: "No NPCs are registered yet." }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="npc-codex-grid">
              {codex.items.map((item) =>
                item.discovered ? (
                  <article
                    key={item.codexId}
                    data-testid="npc-codex-discovered"
                    className="min-w-0 rounded-2xl border border-primary/20 bg-card p-3 shadow-sm"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      {item.portraitUrl ? (
                        <AvatarThumbnail
                          src={item.portraitUrl}
                          alt={item.name}
                          size="lg"
                          className="shrink-0 border-primary/30"
                        />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <User className="h-6 w-6" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-primary-text">{item.name}</h3>
                        <p className="truncate text-xs text-secondary-text">
                          {item.subtitle || (item.personaType === "monster" ? "Monster" : "NPC")}
                        </p>
                      </div>
                    </div>
                    <div className={cn("inline-flex rounded-full px-2 py-1 text-[11px] font-medium", LEVEL_META[item.intimacyLevel].className)}>
                      <Lang text={{ ko: LEVEL_META[item.intimacyLevel].ko, en: LEVEL_META[item.intimacyLevel].en }} />
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{item.intimacy} / 999</span>
                    </div>
                    {item.summary && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-secondary-text">{item.summary}</p>
                    )}
                  </article>
                ) : (
                  <article
                    key={item.codexId}
                    data-testid="npc-codex-hidden"
                    className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-gradient-to-b from-surface-2 to-background p-3 text-center"
                  >
                    <span className="relative mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-slate-500 shadow-inner">
                      <User className="h-10 w-10 opacity-40 blur-[1px]" />
                      <Lock className="absolute bottom-1 right-1 h-4 w-4 text-slate-300" />
                    </span>
                    <h3 className="text-base font-bold tracking-[0.2em] text-secondary-text">{item.name}</h3>
                    <p className="mt-1 text-[11px] text-secondary-text">
                      <Lang text={{ ko: "대화로 발견하세요", en: "Discover through chat" }} />
                    </p>
                  </article>
                ),
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NpcCodexDialog;
