"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Lang } from "components/module/i18n";
import { Preloader } from "@amu-labs/ui";
import { getForgeSummary } from "libs/api/game/forgeSummaryClient";
import { trackPlayEvent } from "utils/analytics/play";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { ForgeJourneyRail } from "./ForgeJourneyRail";
import { ForgeProjectsPanel } from "./ForgeProjectsPanel";
import { ForgeQuickActions } from "./ForgeQuickActions";
import { ForgeTutorialPanel } from "./ForgeTutorialPanel";

/** Play·Forge 대시보드 — 5단계 여정 레일 + 하단 3열. summary 1회 조회로 그려진다. */
export function ForgeDashboard() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["forge-summary"],
    queryFn: getForgeSummary,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    trackPlayEvent("forge_dashboard_view", { universeId: DEFAULT_PLAY_UNIVERSE });
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 pb-5 pt-2">
        <h1 className="text-[22px] font-bold text-primary-text sm:text-[26px]">
          <Lang text={{ ko: "게임 세계를 만드는 5단계 여정", en: "Five steps to build your game world" }} />
        </h1>
        <Sparkles className="h-4 w-4 text-primary-sub" aria-hidden />
      </div>

      {isLoading ? (
        <Preloader variant="spin" size="lg" container />
      ) : (
        <>
          <ForgeJourneyRail summary={summary} />

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <ForgeProjectsPanel summary={summary} />
            <ForgeQuickActions summary={summary} />
            <ForgeTutorialPanel />
          </div>
        </>
      )}
    </div>
  );
}
