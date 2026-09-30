"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock3, Flag, GitBranch, Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { Badge } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useQuery } from "@tanstack/react-query";
import { getMyPersonalUniverseOverview } from "libs/api/game";
import { toErrorMessage } from "utils/common";
import type { LucideIcon } from "lucide-react";
import {
  buildPersonalUniverseExplorerModel,
  type PersonalUniverseExplorerTab,
} from "./personalUniverseExplorerModel";
import {
  FocusView,
  GraphView,
  OverviewStats,
  OverviewView,
  ThreadsView,
  TimelineView,
} from "./PersonalUniverseExplorerSections";

const TABS: Array<{ id: PersonalUniverseExplorerTab; label: { ko: string; en: string }; icon: LucideIcon }> = [
  { id: "overview", label: { ko: "개요", en: "Overview" }, icon: BookOpen },
  { id: "focus", label: { ko: "Focus", en: "Focus" }, icon: GitBranch },
  { id: "timeline", label: { ko: "타임라인", en: "Timeline" }, icon: Clock3 },
  { id: "threads", label: { ko: "Story Threads", en: "Story Threads" }, icon: Flag },
];

type Props = {
  initialTab?: PersonalUniverseExplorerTab;
  graphOnly?: boolean;
};

export function PersonalUniverseExplorer({ initialTab = "overview", graphOnly = false }: Props) {
  const [tab, setTab] = useState<PersonalUniverseExplorerTab>(initialTab);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["personal-universe-overview"],
    queryFn: getMyPersonalUniverseOverview,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const model = useMemo(() => data ? buildPersonalUniverseExplorerModel(data) : null, [data]);
  const resolvedSelectedCharacterId = model?.characters.some((character) => character.id === selectedCharacterId)
    ? selectedCharacterId
    : model?.characters[0]?.id || "";

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div role="status" className="flex items-center gap-3 text-sm text-secondary-text"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /><Lang text={{ ko: "내 세계를 불러오는 중…", en: "Loading your world…" }} /></div></div>;
  }

  if (error || !data) {
    return <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center"><div role="alert" className="w-full rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{toErrorMessage(error, lang({ ko: "내 세계를 불러오지 못했습니다.", en: "Your world could not be loaded." }))}</div><button type="button" onClick={() => void refetch()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><RefreshCw className="h-4 w-4" aria-hidden /><Lang text={{ ko: "다시 시도", en: "Try again" }} /></button></main>;
  }

  if (!model || !data.universe) {
    return <EmptyUniverseState />;
  }

  const activeTab = graphOnly ? "graph" : tab;
  return (
    <main className="mx-auto w-full max-w-[1320px] space-y-5 pb-8" aria-labelledby="personal-universe-heading">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-text"><Link href="/assets-studio" className="inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 hover:bg-surface-2 hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /><Lang text={{ ko: "Forge 대시보드", en: "Forge dashboard" }} /></Link><span aria-hidden>/</span><span><Lang text={{ ko: graphOnly ? "전체 관계도" : "내 세계" , en: graphOnly ? "Full relationship map" : "My world" }} /></span></div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary"><Lang text={{ ko: "PERSONAL UNIVERSE", en: "PERSONAL UNIVERSE" }} /></p><Badge variant="outline" size="xs"><LockKeyhole className="mr-1 h-3 w-3" aria-hidden /><Lang text={{ ko: data.universe.visibility === "private" ? "비공개" : data.universe.visibility === "link" ? "링크 공개" : "공개" , en: data.universe.visibility }} /></Badge></div>
            <h1 id="personal-universe-heading" className="mt-2 text-2xl font-bold tracking-tight text-primary-text sm:text-3xl">{model.universeName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-text sm:text-base">{model.premise || <Lang text={{ ko: "캐릭터와 사건이 쌓일수록 선명해지는 나만의 세계입니다.", en: "A world that becomes clearer as characters and events accumulate." }} />}</p>
          </div>
          {!graphOnly ? <div className="flex flex-wrap gap-2"><Link href="/assets-studio/universe/graph" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform duration-180 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 motion-reduce:transition-none motion-reduce:hover:transform-none"><GitBranch className="h-4 w-4" aria-hidden /><Lang text={{ ko: "전체 관계도 열기", en: "Open full map" }} /></Link><Link href="/assets-studio/universe/bridges" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface-1 px-4 text-sm font-semibold text-primary-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><GitBranch className="h-4 w-4" aria-hidden /><Lang text={{ ko: "세계관 연결", en: "Universe connections" }} /></Link></div> : null}
        </div>
      </header>

      {!graphOnly ? <OverviewStats model={model} /> : null}
      {!graphOnly ? <nav aria-label={lang({ ko: "세계 탐색", en: "World exploration" })} className="overflow-x-auto border-b border-border"><div className="flex min-w-max gap-1" role="tablist">{TABS.map((item) => { const Icon = item.icon; const active = activeTab === item.id; return <button key={item.id} type="button" role="tab" aria-selected={active} onClick={() => setTab(item.id)} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${active ? "border-primary text-primary" : "border-transparent text-secondary-text hover:border-border-hover hover:text-primary-text"}`}><Icon className="h-4 w-4" aria-hidden /><Lang text={item.label} /></button>; })}</div></nav> : null}

      {activeTab === "overview" ? <OverviewView model={model} selectedCharacterId={resolvedSelectedCharacterId} onSelectCharacter={(id) => { setSelectedCharacterId(id); setTab("focus"); }} /> : null}
      {activeTab === "focus" ? <FocusView model={model} selectedCharacterId={resolvedSelectedCharacterId} onSelectCharacter={setSelectedCharacterId} /> : null}
      {activeTab === "timeline" ? <TimelineView model={model} /> : null}
      {activeTab === "threads" ? <ThreadsView model={model} /> : null}
      {activeTab === "graph" ? <GraphView model={model} /> : null}

      {isFetching ? <p className="flex items-center justify-end gap-2 text-xs text-muted-text" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /><Lang text={{ ko: "업데이트 확인 중…", en: "Checking for updates…" }} /></p> : null}
    </main>
  );
}

function EmptyUniverseState() {
  return <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BookOpen className="h-6 w-6" aria-hidden /></div><h1 className="mt-4 text-xl font-bold text-primary-text"><Lang text={{ ko: "아직 Personal Universe가 없습니다.", en: "Your Personal Universe is not ready yet." }} /></h1><p className="mt-2 text-sm leading-6 text-secondary-text"><Lang text={{ ko: "첫 캐릭터의 World Seed를 승인하면 이곳에서 세계의 관계와 사건을 탐색할 수 있습니다.", en: "Approve the first character's World Seed to explore relationships and events here." }} /></p><Link href="/assets-studio/character" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><Lang text={{ ko: "캐릭터 등록하기", en: "Register a character" }} /></Link></main>;
}
