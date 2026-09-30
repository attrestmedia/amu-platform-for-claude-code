"use client";

import Link from "next/link";
import { Box, Map, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import { cn } from "utils/common";
import type { ForgeSummary } from "libs/api/game/forgeSummaryClient";
import type { ForgeLocalizedText } from "../model/forgeGlossary";

type QuickAction = {
  href: string;
  icon: LucideIcon;
  bg: string;
  label: ForgeLocalizedText;
  disabled?: boolean;
  reason?: ForgeLocalizedText;
};

/** 빠른 액션 3버튼 — 선행조건 미충족/권한 없음 시 숨기지 않고 비활성 사유를 노출한다. */
export function ForgeQuickActions({ summary }: { summary: ForgeSummary | undefined }) {
  const { isAdministrator } = useUserData();
  const hasCharacter = (summary?.characters.total || 0) > 0;

  const actions: QuickAction[] = [
    {
      href: "/assets-studio/direction-sheet",
      icon: UserPlus,
      bg: "bg-primary text-primary-foreground",
      label: { ko: "캐릭터 방향 시트 새로 만들기", en: "New character direction sheet" },
      disabled: !hasCharacter,
      reason: { ko: "먼저 캐릭터를 등록해 주세요.", en: "Register a character first." },
    },
    {
      href: "/assets-studio/world",
      icon: Box,
      bg: "bg-accent text-accent-foreground",
      label: { ko: "월드 에셋 생성하기", en: "Generate world assets" },
    },
    {
      href: "/assets-studio/map",
      icon: Map,
      bg: "bg-secondary text-secondary-foreground",
      label: { ko: "새 맵 만들기", en: "Create a new map" },
      disabled: !isAdministrator,
      reason: { ko: "맵 편집 권한이 필요합니다.", en: "Map editing permission is required." },
    },
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-[15px] font-bold text-primary-text">
        <Lang text={{ ko: "빠른 액션", en: "Quick actions" }} />
      </h2>
      <div className="mt-3 flex flex-col gap-2.5">
        {actions.map((action) => {
          const content = (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
                <action.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold">
                  <Lang text={action.label} />
                </span>
                {action.disabled && action.reason ? (
                  <span className="truncate text-[11px] font-normal opacity-85">
                    <Lang text={action.reason} />
                  </span>
                ) : null}
              </span>
            </>
          );

          const className = cn(
            "flex h-14 items-center gap-3 rounded-xl px-3",
            action.bg,
            action.disabled && "cursor-not-allowed opacity-50",
          );

          return action.disabled ? (
            <div key={action.href} aria-disabled="true" className={className}>
              {content}
            </div>
          ) : (
            <Link
              key={action.href}
              href={action.href}
              className={cn(className, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60")}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
