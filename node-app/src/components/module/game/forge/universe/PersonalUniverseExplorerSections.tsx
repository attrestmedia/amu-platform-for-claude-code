"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Circle,
  Clock3,
  Eye,
  Flag,
  GitBranch,
  MapPin,
  Users,
} from "lucide-react";
import { Badge } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import {
  getFocusRelations,
  getLatestEvents,
  relatedEventsForThread,
  relationCharacterLabel,
  relationTargetLabel,
  type ExplorerCharacter,
  type ExplorerEvent,
  type ExplorerRelation,
  type ExplorerThread,
  type PersonalUniverseExplorerModel,
} from "./personalUniverseExplorerModel";

type LocalizedText = { ko: string; en: string };

const RELATION_LABELS: Record<string, LocalizedText> = {
  ally: { ko: "동료", en: "Ally" },
  rival: { ko: "라이벌", en: "Rival" },
  mentor: { ko: "멘토", en: "Mentor" },
  protege: { ko: "제자", en: "Protege" },
  kin: { ko: "가족", en: "Kin" },
  "bound-oath": { ko: "맹세로 묶인 사이", en: "Bound oath" },
  debt: { ko: "빚진 사이", en: "Debt" },
  estranged: { ko: "멀어진 사이", en: "Estranged" },
  unknown: { ko: "아직 모르는 관계", en: "Unknown" },
};

const ENTITY_LABELS: Record<string, LocalizedText> = {
  character: { ko: "캐릭터", en: "Character" },
  event: { ko: "사건", en: "Event" },
  region: { ko: "장소", en: "Region" },
  faction: { ko: "세력", en: "Faction" },
  mystery: { ko: "미스터리", en: "Mystery" },
  object: { ko: "물건", en: "Object" },
};

const THREAD_STATUS_LABELS: Record<string, LocalizedText> = {
  open: { ko: "미해결", en: "Open" },
  advancing: { ko: "진행 중", en: "Advancing" },
  resolved: { ko: "해결됨", en: "Resolved" },
};

function initialOf(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "?";
}

function dateLabel(value?: string | Date) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date);
}

function relationLabel(value: string) {
  return RELATION_LABELS[value] || { ko: value, en: value };
}

function entityLabel(value: string) {
  return ENTITY_LABELS[value] || { ko: value, en: value };
}

function threadStatusLabel(value: string) {
  return THREAD_STATUS_LABELS[value] || THREAD_STATUS_LABELS.open;
}

function Panel({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return <section aria-labelledby={labelledBy} className={cn("rounded-2xl border border-border bg-surface p-4 sm:p-5", className)}>{children}</section>;
}

export function OverviewStats({ model }: { model: PersonalUniverseExplorerModel }) {
  const stats = [
    { label: { ko: "캐릭터", en: "Characters" }, value: model.characters.length, icon: Users, tone: "text-primary" },
    { label: { ko: "관계", en: "Relations" }, value: model.relations.length, icon: GitBranch, tone: "text-secondary" },
    { label: { ko: "사건", en: "Events" }, value: model.events.length, icon: Clock3, tone: "text-accent" },
    { label: { ko: "미해결 스레드", en: "Open threads" }, value: model.threads.filter((thread) => thread.status !== "resolved").length, icon: Flag, tone: "text-warning" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label.en} className="rounded-xl border border-border bg-background/70 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-secondary-text"><Lang text={stat.label} /></span>
            <stat.icon className={cn("h-4 w-4", stat.tone)} aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-primary-text">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

export function CharacterPicker({
  characters,
  selectedCharacterId,
  onSelect,
  compact = false,
}: {
  characters: ExplorerCharacter[];
  selectedCharacterId: string;
  onSelect: (characterId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")} aria-label={lang({ ko: "캐릭터 선택", en: "Choose a character" })}>
      {characters.map((character) => {
        const selected = selectedCharacterId === character.id;
        return (
          <button
            key={character.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(character.id)}
            className={cn(
              "flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors duration-180",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
              selected ? "border-primary bg-primary/10 text-primary-text" : "border-border bg-background/60 text-secondary-text hover:border-border-hover hover:text-primary-text",
            )}
          >
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold", selected ? "bg-primary text-primary-foreground" : "bg-surface-2 text-secondary-text")} aria-hidden>
              {initialOf(character.title)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{character.title}</span>
              {character.summary ? <span className="block truncate text-xs text-secondary-text">{character.summary}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function RelationCard({
  model,
  relation,
  onSelect,
  selected = false,
}: {
  model: PersonalUniverseExplorerModel;
  relation: ExplorerRelation;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const content = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary-text">
        <span>{relationCharacterLabel(model, relation.sourceCharacterId)}</span>
        <ArrowRight className="h-4 w-4 text-primary-sub" aria-hidden />
        <span>{relationTargetLabel(model, relation)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {relation.relationTypes.length > 0 ? relation.relationTypes.map((type) => (
          <Badge key={type} variant="outline" size="xs"><Lang text={relationLabel(type)} /></Badge>
        )) : <Badge variant="outline" size="xs"><Lang text={RELATION_LABELS.unknown} /></Badge>}
        <Badge variant="outline" size="xs"><Eye className="mr-1 h-3 w-3" aria-hidden /><Lang text={relation.visibility === "internal" ? { ko: "내부 기록", en: "Internal" } : { ko: "공유 가능", en: "Shareable" }} /></Badge>
      </div>
      {relation.reason ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-secondary-text">{relation.reason}</p> : null}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-text">
        <Clock3 className="h-3.5 w-3.5" aria-hidden />
        <Lang text={{ ko: `연결 사건 ${relation.relatedEvents.length}건`, en: `${relation.relatedEvents.length} related events` }} />
      </p>
    </>
  );

  if (!onSelect) return <div className="rounded-xl border border-border bg-background/60 p-3.5">{content}</div>;
  return (
    <button
      type="button"
      aria-expanded={selected}
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border p-3.5 text-left transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
        selected ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:border-border-hover",
      )}
    >
      {content}
    </button>
  );
}

export function RelationDetail({ model, relation }: { model: PersonalUniverseExplorerModel; relation: ExplorerRelation }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><GitBranch className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "이 관계가 이어진 기록", en: "What connects this relationship" }} /></h3>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            {relationCharacterLabel(model, relation.sourceCharacterId)} → {relationTargetLabel(model, relation)}
          </p>
        </div>
      </div>
      {relation.relatedEvents.length > 0 ? (
        <ol className="mt-4 space-y-3 border-l border-primary/30 pl-4">
          {relation.relatedEvents.map((event, index) => <TimelineEvent key={event.id} event={event} index={index + 1} compact />)}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-secondary-text"><Lang text={{ ko: "아직 연결된 사건 기록이 없습니다. 관계의 시작 사건을 추가하면 이곳에 표시됩니다.", en: "No linked event is recorded yet. Add a starting event to trace this relationship here." }} /></p>
      )}
    </div>
  );
}

export function TimelineEvent({ event, index, compact = false }: { event: ExplorerEvent; index: number; compact?: boolean }) {
  return (
    <li className="relative">
      <span className="absolute -left-[1.35rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-surface text-[10px] font-bold text-primary" aria-hidden>{index}</span>
      <div className={cn(compact ? "pb-1" : "rounded-xl border border-border bg-background/60 p-3.5")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-primary-text">{event.title}</h3>
          {event.eventType ? <Badge variant="outline" size="xs">{event.eventType}</Badge> : null}
          {event.createdAt ? <span className="text-xs text-muted-text">{dateLabel(event.createdAt)}</span> : null}
        </div>
        {event.summary ? <p className="mt-1.5 text-xs leading-5 text-secondary-text">{event.summary}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-text">
          {event.regionId ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{event.regionId}</span> : null}
          {event.characterIds.length > 0 ? <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /><Lang text={{ ko: `인물 ${event.characterIds.length}명`, en: `${event.characterIds.length} characters` }} /></span> : null}
        </div>
      </div>
    </li>
  );
}

export function FocusView({ model, selectedCharacterId, onSelectCharacter }: { model: PersonalUniverseExplorerModel; selectedCharacterId: string; onSelectCharacter: (characterId: string) => void }) {
  const relations = getFocusRelations(model, selectedCharacterId);
  const [selectedRelationId, setSelectedRelationId] = useState("");
  const selectedRelation = relations.find((relation) => relation.id === selectedRelationId) || null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <Panel labelledBy="focus-character-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="focus-character-heading" className="flex items-center gap-2 text-base font-bold text-primary-text"><Circle className="h-4 w-4 text-primary" aria-hidden /><Lang text={{ ko: "누구의 시선을 볼까요?", en: "Whose view should we follow?" }} /></h2>
            <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={{ ko: "한 캐릭터를 고르면 1-hop 관계와 연결 사건만 남겨 보여줍니다.", en: "Choose a character to see only one-hop relationships and linked events." }} /></p>
          </div>
          <Badge variant="outline" size="xs"><Lang text={{ ko: "1-hop", en: "1-hop" }} /></Badge>
        </div>
        <div className="mt-4"><CharacterPicker characters={model.characters} selectedCharacterId={selectedCharacterId} onSelect={(id) => { onSelectCharacter(id); setSelectedRelationId(""); }} compact /></div>
      </Panel>

      <Panel labelledBy="focus-relation-heading">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 id="focus-relation-heading" className="text-base font-bold text-primary-text"><Lang text={{ ko: "관계 focus", en: "Relationship focus" }} /></h2>
            <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "관계선을 선택하면 시작·변화·최근 사건을 확인합니다.", en: "Select a relationship to trace its beginning, changes, and recent events." }} /></p>
          </div>
          <span className="text-xs tabular-nums text-muted-text">{relations.length}</span>
        </div>
        {relations.length > 0 ? (
          <div className="mt-4 space-y-2.5">
            {relations.map((relation) => <RelationCard key={relation.id} model={model} relation={relation} selected={selectedRelationId === relation.id} onSelect={() => setSelectedRelationId((current) => current === relation.id ? "" : relation.id)} />)}
            {selectedRelation ? <RelationDetail model={model} relation={selectedRelation} /> : null}
          </div>
        ) : (
          <EmptyPanel icon={GitBranch} text={{ ko: "아직 이 캐릭터의 연결이 없습니다.", en: "This character has no connections yet." }} detail={{ ko: "관계 제안이나 수동 저작으로 첫 연결을 추가해 보세요.", en: "Add the first connection with a proposal or manual authoring." }} />
        )}
      </Panel>
    </div>
  );
}

export function OverviewView({ model, selectedCharacterId, onSelectCharacter }: { model: PersonalUniverseExplorerModel; selectedCharacterId: string; onSelectCharacter: (characterId: string) => void }) {
  const focusRelations = getFocusRelations(model, selectedCharacterId);
  const latestEvents = getLatestEvents(model);
  const openThreads = model.threads.filter((thread) => thread.status !== "resolved").slice(0, 3);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <Panel labelledBy="overview-focus-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="overview-focus-heading" className="text-base font-bold text-primary-text"><Lang text={{ ko: "세계의 중심을 고르세요", en: "Choose the center of your world" }} /></h2>
            <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={{ ko: "캐릭터를 고르면 주변 1-hop 관계를 바로 확인할 수 있습니다.", en: "Choose a character to see its one-hop relationships." }} /></p>
          </div>
          <Link href="/assets-studio/universe?view=focus" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><Lang text={{ ko: "focus 열기", en: "Open focus" }} /><ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
        </div>
        <div className="mt-4"><CharacterPicker characters={model.characters} selectedCharacterId={selectedCharacterId} onSelect={onSelectCharacter} compact /></div>
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-primary-text">{model.characters.find((character) => character.id === selectedCharacterId)?.title || "—"}</h3><span className="text-xs text-muted-text"><Lang text={{ ko: `${focusRelations.length}개 연결`, en: `${focusRelations.length} connections` }} /></span></div>
          {focusRelations.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{focusRelations.slice(0, 4).map((relation) => <RelationCard key={relation.id} model={model} relation={relation} />)}</div> : <p className="mt-3 text-sm text-secondary-text"><Lang text={{ ko: "아직 연결된 관계가 없습니다.", en: "No relationship is recorded yet." }} /></p>}
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <TimelinePreview events={latestEvents} />
        <ThreadsPreview model={model} threads={openThreads} />
      </div>
    </div>
  );
}

export function TimelineView({ model }: { model: PersonalUniverseExplorerModel }) {
  const visibleEvents = model.events.slice(0, 100);
  return (
    <Panel labelledBy="timeline-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="timeline-heading" className="flex items-center gap-2 text-base font-bold text-primary-text"><Clock3 className="h-4 w-4 text-accent" aria-hidden /><Lang text={{ ko: "Canon Timeline", en: "Canon Timeline" }} /></h2>
          <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={{ ko: "무슨 일이 언제 일어났는지, published Canon 사건을 순서대로 확인합니다.", en: "Trace what happened and when through published Canon events." }} /></p>
        </div>
        <Badge variant="outline" size="xs">{model.events.length}</Badge>
      </div>
      {visibleEvents.length > 0 ? <ol className="mt-5 space-y-4 border-l border-border pl-4">{visibleEvents.map((event, index) => <TimelineEvent key={event.id} event={event} index={index + 1} />)}</ol> : <EmptyPanel icon={Clock3} text={{ ko: "아직 기록된 사건이 없습니다.", en: "No events have been recorded yet." }} detail={{ ko: "World Seed와 관계 사건이 확정되면 이곳에 쌓입니다.", en: "World Seed and relationship events will appear here as they are confirmed." }} />}
      {model.events.length > visibleEvents.length ? <p className="mt-4 text-center text-xs text-muted-text"><Lang text={{ ko: `처음 ${visibleEvents.length}개의 사건을 표시하고 있습니다.`, en: `Showing the first ${visibleEvents.length} events.` }} /></p> : null}
    </Panel>
  );
}

export function ThreadsView({ model }: { model: PersonalUniverseExplorerModel }) {
  const [filter, setFilter] = useState<"all" | ExplorerThread["status"]>("all");
  const threads = filter === "all" ? model.threads : model.threads.filter((thread) => thread.status === filter);
  return (
    <Panel labelledBy="threads-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="threads-heading" className="flex items-center gap-2 text-base font-bold text-primary-text"><Flag className="h-4 w-4 text-warning" aria-hidden /><Lang text={{ ko: "Story Threads", en: "Story Threads" }} /></h2>
          <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={{ ko: "아직 닫히지 않은 질문과 다음에 이어갈 사건을 모읍니다.", en: "Collect unanswered questions and the next story beats." }} /></p>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={lang({ ko: "스레드 상태 필터", en: "Thread status filters" })}>
          {(["all", "open", "advancing", "resolved"] as const).map((value) => {
            const active = filter === value;
            const label = value === "all" ? { ko: "전체", en: "All" } : threadStatusLabel(value);
            return <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setFilter(value)} className={cn("min-h-9 rounded-lg px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70", active ? "bg-primary text-primary-foreground" : "text-secondary-text hover:bg-surface-2 hover:text-primary-text")}><Lang text={label} /></button>;
          })}
        </div>
      </div>
      {threads.length > 0 ? <div className="mt-5 grid gap-3 md:grid-cols-2">{threads.map((thread) => <ThreadCard key={thread.id} model={model} thread={thread} />)}</div> : <EmptyPanel icon={Flag} text={{ ko: "이 상태의 Story Thread가 없습니다.", en: "No story threads match this status." }} detail={{ ko: "다른 필터를 선택하거나 새로운 미해결 질문을 추가해 보세요.", en: "Try another filter or add a new unanswered question." }} />}
    </Panel>
  );
}

export function GraphView({ model }: { model: PersonalUniverseExplorerModel }) {
  const [filter, setFilter] = useState<"all" | "character" | "event" | "region" | "faction">("all");
  const relations = filter === "all" ? model.relations : model.relations.filter((relation) => relation.targetRefType === filter || (filter === "character" && Boolean(relation.sourceCharacterId)));
  return (
    <div className="space-y-4">
      <Panel labelledBy="graph-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="graph-heading" className="flex items-center gap-2 text-base font-bold text-primary-text"><GitBranch className="h-4 w-4 text-primary" aria-hidden /><Lang text={{ ko: "전체 관계도", en: "Full relationship map" }} /></h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-secondary-text"><Lang text={{ ko: "그래프를 축소해 읽기 어렵게 만들지 않고, 모든 관계선을 같은 정보 구조의 텍스트 리스트로 탐색합니다.", en: "Explore every relationship as an equivalent text list instead of shrinking a graph until it becomes unreadable." }} /></p>
          </div>
          <Link href="/assets-studio/universe?view=focus" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><Lang text={{ ko: "focus로 돌아가기", en: "Back to focus" }} /><ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={lang({ ko: "관계도 필터", en: "Relationship map filters" })}>
          {(["all", "character", "event", "region", "faction"] as const).map((value) => {
            const active = filter === value;
            const label = value === "all" ? { ko: "전체 관계", en: "All relations" } : entityLabel(value);
            return <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setFilter(value)} className={cn("min-h-10 rounded-lg border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70", active ? "border-primary bg-primary/10 text-primary-text" : "border-border text-secondary-text hover:border-border-hover hover:text-primary-text")}><Lang text={label} /></button>;
          })}
        </div>
      </Panel>
      {relations.length > 0 ? (
        <>
          <div aria-hidden className="hidden rounded-2xl border border-border bg-surface p-4 md:block">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {relations.map((relation) => (
                <div key={`map-${relation.id}`} className="rounded-xl border border-primary/25 bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-primary-text">
                    <span className="truncate">{relationCharacterLabel(model, relation.sourceCharacterId)}</span>
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="truncate text-right">{relationTargetLabel(model, relation)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-primary/35" />
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary">
                      {relation.relationTypes.map((type) => lang(relationLabel(type))).join(" · ") || lang(RELATION_LABELS.unknown)}
                    </span>
                    <div className="h-px flex-1 bg-primary/35" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2" aria-label={lang({ ko: "관계 목록", en: "Relationship list" })}>
            {relations.map((relation) => <RelationCard key={relation.id} model={model} relation={relation} />)}
          </div>
        </>
      ) : <Panel><EmptyPanel icon={GitBranch} text={{ ko: "표시할 관계가 없습니다.", en: "No relationships to display." }} detail={{ ko: "Personal Canon에 관계가 확정되면 이곳에 표시됩니다.", en: "Confirmed Personal Canon relationships will appear here." }} /></Panel>}
    </div>
  );
}

function TimelinePreview({ events }: { events: ExplorerEvent[] }) {
  return (
    <Panel labelledBy="timeline-preview-heading">
      <div className="flex items-center justify-between gap-2"><h2 id="timeline-preview-heading" className="flex items-center gap-2 text-base font-bold text-primary-text"><Clock3 className="h-4 w-4 text-accent" aria-hidden /><Lang text={{ ko: "최근 사건", en: "Recent events" }} /></h2><Link href="/assets-studio/universe?view=timeline" className="text-xs font-semibold text-primary hover:underline"><Lang text={{ ko: "전체 보기", en: "View all" }} /></Link></div>
      {events.length > 0 ? <ol className="mt-4 space-y-3 border-l border-border pl-4">{events.map((event, index) => <TimelineEvent key={event.id} event={event} index={index + 1} compact />)}</ol> : <p className="mt-4 text-sm text-secondary-text"><Lang text={{ ko: "아직 사건이 없습니다.", en: "No events yet." }} /></p>}
    </Panel>
  );
}

function ThreadsPreview({ model, threads }: { model: PersonalUniverseExplorerModel; threads: ExplorerThread[] }) {
  return (
    <Panel labelledBy="threads-preview-heading">
      <div className="flex items-center justify-between gap-2"><h2 id="threads-preview-heading" className="flex items-center gap-2 text-base font-bold text-primary-text"><Flag className="h-4 w-4 text-warning" aria-hidden /><Lang text={{ ko: "열린 스레드", en: "Open threads" }} /></h2><Link href="/assets-studio/universe?view=threads" className="text-xs font-semibold text-primary hover:underline"><Lang text={{ ko: "전체 보기", en: "View all" }} /></Link></div>
      {threads.length > 0 ? <div className="mt-4 space-y-2">{threads.map((thread) => <ThreadCard key={thread.id} model={model} thread={thread} compact />)}</div> : <p className="mt-4 text-sm text-secondary-text"><Lang text={{ ko: "열린 Story Thread가 없습니다.", en: "No open story threads." }} /></p>}
    </Panel>
  );
}

function ThreadCard({ model, thread, compact = false }: { model: PersonalUniverseExplorerModel; thread: ExplorerThread; compact?: boolean }) {
  const status = threadStatusLabel(thread.status);
  const events = relatedEventsForThread(model, thread);
  return (
    <article className={cn("rounded-xl border border-border bg-background/60", compact ? "p-3" : "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-primary-text">{thread.title}</h3>{thread.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-secondary-text">{thread.summary}</p> : null}</div>
        <Badge variant={thread.status === "resolved" ? "outline" : "secondary"} size="xs"><Lang text={status} /></Badge>
      </div>
      {!compact && events.length > 0 ? <div className="mt-3 border-t border-border pt-3"><p className="text-xs font-semibold text-secondary-text"><Lang text={{ ko: "관련 사건", en: "Related events" }} /></p><ul className="mt-2 space-y-1">{events.map((event) => <li key={event.id} className="flex items-center gap-1.5 text-xs text-muted-text"><Circle className="h-3 w-3 text-primary" aria-hidden />{event.title}</li>)}</ul></div> : null}
      {thread.characterIds.length > 0 ? <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-text"><Users className="h-3.5 w-3.5" aria-hidden />{thread.characterIds.map((id) => model.entityTitle("character", id)).join(" · ")}</p> : null}
    </article>
  );
}

export function EmptyPanel({ icon: Icon, text, detail }: { icon: typeof BookOpen; text: LocalizedText; detail: LocalizedText }) {
  return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-hover px-4 py-10 text-center"><Icon className="h-6 w-6 text-muted-text" aria-hidden /><p className="mt-3 text-sm font-semibold text-primary-text"><Lang text={text} /></p><p className="mt-1 max-w-md text-xs leading-5 text-secondary-text"><Lang text={detail} /></p></div>;
}
