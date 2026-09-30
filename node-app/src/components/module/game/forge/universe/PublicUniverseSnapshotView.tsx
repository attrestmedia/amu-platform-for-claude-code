"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Clock3, Copy, Flag, GitBranch, MapPin, Share2, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { PublicUniverseSnapshotContent, PublicUniverseSnapshotEntity } from "types/game";
import { cn } from "utils/common";

const REPORT_REASONS = [
  { value: "sexual", label: { ko: "성적·음란한 내용", en: "Sexual content" } },
  { value: "graphic-violence", label: { ko: "과도한 폭력 묘사", en: "Graphic violence" } },
  { value: "hate", label: { ko: "혐오·차별", en: "Hate or discrimination" } },
  { value: "self-harm", label: { ko: "자해·자살 위험", en: "Self-harm or suicide risk" } },
  { value: "privacy", label: { ko: "개인정보 노출", en: "Personal information" } },
  { value: "impersonation", label: { ko: "사칭", en: "Impersonation" } },
  { value: "copyright", label: { ko: "저작권 침해", en: "Copyright" } },
  { value: "other", label: { ko: "기타", en: "Other" } },
] as const;

function formatOrder(entity: PublicUniverseSnapshotEntity) {
  if (entity.startOrder === undefined) return "";
  return entity.endOrder !== undefined && entity.endOrder !== entity.startOrder ? `${entity.startOrder}–${entity.endOrder}` : String(entity.startOrder);
}

function entityTitle(entities: PublicUniverseSnapshotEntity[], entityType?: string, entityId?: string) {
  return entities.find((entity) => entity.entityType === entityType && entity.entityId === entityId)?.title || entityId || "—";
}

export function PublicUniverseSnapshotView({ snapshotId, visibility, content }: { snapshotId: string; visibility: "link" | "public"; content: PublicUniverseSnapshotContent }) {
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied">("idle");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("privacy");
  const [reportNote, setReportNote] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: content.worldName, text: content.premise, url });
        setShareState("shared");
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setShareState("idle");
    }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReportState("sending");
    try {
      const response = await fetch(`/api/game/personal-universe/public-snapshot/${encodeURIComponent(snapshotId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason, note: reportNote }),
      });
      if (!response.ok) throw new Error("report_failed");
      setReportState("sent");
    } catch {
      setReportState("error");
    }
  }

  const law = content.entities.find((entity) => entity.entityType === "core-law");
  const characters = content.entities.filter((entity) => entity.entityType === "character");
  const relations = content.entities.filter((entity) => entity.entityType === "relation");
  const events = content.entities.filter((entity) => entity.entityType === "event").sort((a, b) => (a.startOrder ?? 0) - (b.startOrder ?? 0));

  return (
    <main className="min-h-dvh bg-background text-primary-text">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/assets-studio" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-secondary-text hover:bg-surface-2 hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
            <Lang text={{ ko: "에셋 스튜디오로 돌아가기", en: "Back to Assets Studio" }} />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline"><Lang text={visibility === "public" ? { ko: "공개 Snapshot", en: "Public snapshot" } : { ko: "링크 공유", en: "Link share" }} /></Badge>
            <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-primary-text hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
              {shareState === "copied" ? <Check className="h-4 w-4 text-success" aria-hidden /> : shareState === "shared" ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
              <Lang text={shareState === "copied" ? { ko: "링크 복사됨", en: "Link copied" } : shareState === "shared" ? { ko: "공유 완료", en: "Shared" } : { ko: "공유", en: "Share" }} />
            </button>
          </div>
        </div>

        <header className="mt-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary"><Lang text={{ ko: "Personal Universe", en: "Personal Universe" }} /></p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-primary-text sm:text-5xl">{content.worldName}</h1>
          {content.premise ? <p className="mt-4 text-base leading-7 text-secondary-text sm:text-lg">{content.premise}</p> : null}
        </header>

        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label={lang({ ko: "세계관 집계", en: "Universe counts" })}>
          {([
            [Users, content.counts.characters, { ko: "캐릭터", en: "Characters" }],
            [GitBranch, content.counts.relations, { ko: "관계", en: "Relations" }],
            [Clock3, content.counts.events, { ko: "사건", en: "Events" }],
            [MapPin, content.counts.regions, { ko: "장소", en: "Places" }],
            [Flag, content.counts.factions, { ko: "세력", en: "Factions" }],
          ] as Array<[LucideIcon, number, { ko: string; en: string }]>).map(([StatIcon, value, label]) => {
            return <div key={label.en} className="rounded-2xl border border-border bg-surface p-4"><StatIcon className="h-4 w-4 text-primary" aria-hidden /><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-secondary-text"><Lang text={label} /></p></div>;
          })}
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <section className="rounded-2xl border border-border bg-surface p-5" aria-labelledby="public-world-law">
            <h2 id="public-world-law" className="text-lg font-bold"><Lang text={{ ko: "공개된 세계관", en: "Published world lore" }} /></h2>
            {law?.rules?.length ? <ul className="mt-4 space-y-2 text-sm leading-6 text-secondary-text">{law.rules.map((rule) => <li key={rule} className="border-l-2 border-primary/40 pl-3">{rule}</li>)}</ul> : <p className="mt-4 text-sm text-secondary-text"><Lang text={{ ko: "공개된 세계관 법칙이 없습니다.", en: "No world laws are published." }} /></p>}
          </section>
          <section className="rounded-2xl border border-border bg-surface p-5" aria-labelledby="public-characters">
            <h2 id="public-characters" className="text-lg font-bold"><Lang text={{ ko: "등장인물", en: "Characters" }} /></h2>
            <ul className="mt-4 space-y-3">{characters.length ? characters.map((character) => <li key={character.entityId} className="rounded-xl border border-border bg-background/60 p-3"><p className="text-sm font-semibold">{character.title}</p>{character.summary ? <p className="mt-1 text-xs leading-5 text-secondary-text">{character.summary}</p> : null}</li>) : <li className="text-sm text-secondary-text"><Lang text={{ ko: "공개된 캐릭터가 없습니다.", en: "No public characters." }} /></li>}</ul>
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-5" aria-labelledby="public-relations">
          <h2 id="public-relations" className="flex items-center gap-2 text-lg font-bold"><GitBranch className="h-4 w-4 text-primary" aria-hidden /><span><Lang text={{ ko: "관계", en: "Relationships" }} /></span></h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{relations.length ? relations.map((relation) => <article key={relation.entityId} className="rounded-xl border border-border bg-background/60 p-4"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{entityTitle(content.entities, "character", relation.sourceCharacterId)}</span><span aria-hidden>→</span><span>{entityTitle(content.entities, relation.targetRefType, relation.targetRefId)}</span></div><div className="mt-2 flex flex-wrap gap-1.5">{relation.relationTypes?.map((type) => <Badge key={type} variant="outline" size="xs">{type}</Badge>)}</div></article>) : <p className="text-sm text-secondary-text"><Lang text={{ ko: "공개된 관계가 없습니다.", en: "No public relationships." }} /></p>}</div>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-5" aria-labelledby="public-events">
          <h2 id="public-events" className="flex items-center gap-2 text-lg font-bold"><Clock3 className="h-4 w-4 text-accent" aria-hidden /><span><Lang text={{ ko: "Canon Timeline", en: "Canon Timeline" }} /></span></h2>
          <ol className="mt-4 space-y-3">{events.length ? events.map((event) => <li key={event.entityId} className="flex gap-3 rounded-xl border border-border bg-background/60 p-4"><span className="min-w-10 text-xs font-bold tabular-nums text-primary">{formatOrder(event)}</span><div><p className="text-sm font-semibold">{event.title}</p>{event.summary ? <p className="mt-1 text-xs leading-5 text-secondary-text">{event.summary}</p> : null}</div></li>) : <li className="text-sm text-secondary-text"><Lang text={{ ko: "공개된 사건이 없습니다.", en: "No public events." }} /></li>}</ol>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-5" aria-labelledby="public-report">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="public-report" className="text-lg font-bold"><Lang text={{ ko: "문제 신고", en: "Report a problem" }} /></h2><p className="mt-1 text-sm leading-6 text-secondary-text"><Lang text={{ ko: "신고가 접수되면 검토를 위해 Snapshot을 먼저 비공개 처리합니다.", en: "A report withdraws the snapshot while it is reviewed." }} /></p></div><button type="button" onClick={() => setReportOpen((current) => !current)} aria-expanded={reportOpen} aria-controls="public-report-form" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"><Flag className="h-4 w-4" aria-hidden /><Lang text={reportOpen ? { ko: "신고 닫기", en: "Close report" } : { ko: "신고하기", en: "Report" }} /></button></div>
          {reportOpen ? <form id="public-report-form" className="mt-5 grid gap-4 border-t border-border pt-5" onSubmit={report}>
            <label className="grid gap-2 text-sm font-semibold"><span><Lang text={{ ko: "신고 사유", en: "Reason" }} /></span><select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">{REPORT_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{lang(reason.label)}</option>)}</select></label>
            <label className="grid gap-2 text-sm font-semibold"><span><Lang text={{ ko: "추가 설명 (선택)", en: "Additional note (optional)" }} /></span><textarea value={reportNote} onChange={(event) => setReportNote(event.target.value)} maxLength={500} rows={4} className="rounded-lg border border-border bg-background px-3 py-2 font-normal leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70" /></label>
            {reportState === "sent" ? <p role="status" className="text-sm text-success"><Lang text={{ ko: "신고가 접수되었습니다. Snapshot은 검토 전까지 비공개 상태입니다.", en: "Report received. The snapshot is private during review." }} /></p> : reportState === "error" ? <p role="alert" className="text-sm text-danger"><Lang text={{ ko: "로그인 후 다시 시도해 주세요.", en: "Please sign in and try again." }} /></p> : null}
            <button type="submit" disabled={reportState === "sending" || reportState === "sent"} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/60 disabled:cursor-not-allowed disabled:opacity-50")}><Copy className="h-4 w-4" aria-hidden /><Lang text={reportState === "sending" ? { ko: "접수 중…", en: "Sending…" } : { ko: "신고 접수", en: "Submit report" }} /></button>
          </form> : null}
        </section>
      </div>
    </main>
  );
}
