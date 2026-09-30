"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Preloader } from "@amu-labs/ui";
import { ArrowLeft, Plus, RefreshCw, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import {
  CANON_ENTITY_LAYER,
  CANON_ENTITY_TYPE_VALUES,
  CANON_REVISION_STATUS_VALUES,
  type CanonEntityType,
  type CanonGraphValidationIssue,
  type CanonPayload,
  type CanonRevisionStatus,
} from "types/game";
import { cn, toUnknownRecord } from "utils/common";
import { PAGE_LAYOUT_CLASS, THEME_OVERRIDE_CLASS } from "utils/theme";
import { CanonDraftForm, type CanonDraftFormValue } from "./CanonDraftForm";
import { CanonGraphView } from "./CanonGraphView";
import {
  CANON_ENTITY_LABELS,
  entityLabel,
  latestRevisions,
  readCanonError,
  type CanonAdminResponse,
  type CanonAdminRevision,
} from "./canonAdminTypes";
import { CanonRevisionInspector } from "./CanonRevisionInspector";

type StatusFilter = "" | CanonRevisionStatus;

const inputClassName = "h-10 rounded-md border border-border bg-background px-3 text-sm text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const statusVariant: Record<CanonRevisionStatus, "outline" | "primary" | "accent" | "destructive" | "muted"> = {
  draft: "muted",
  review: "accent",
  published: "primary",
  deprecated: "destructive",
  archived: "outline",
};

const defaultDraft = (): CanonDraftFormValue => ({
  entityType: "event",
  entityId: "",
  payloadText: JSON.stringify({ title: "", regionId: "", characterIds: [] }, null, 2),
  changelog: "",
});

function isRevision(value: unknown): value is CanonAdminRevision {
  const record = toUnknownRecord(value);
  return typeof record.revisionId === "string" && typeof record.entityType === "string" && typeof record.entityId === "string";
}

function statusLabel(status: CanonRevisionStatus) {
  return {
    draft: lang({ ko: "Draft", en: "Draft" }),
    review: lang({ ko: "Review", en: "Review" }),
    published: lang({ ko: "Published", en: "Published" }),
    deprecated: lang({ ko: "Deprecated", en: "Deprecated" }),
    archived: lang({ ko: "Archived", en: "Archived" }),
  }[status];
}

export function CanonAdminConsole({ universeId }: { universeId: string }) {
  const router = useRouter();
  const [revisions, setRevisions] = useState<CanonAdminRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [entityFilter, setEntityFilter] = useState<CanonEntityType | "">("");
  const [draft, setDraft] = useState<CanonDraftFormValue>(defaultDraft);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [validationCode, setValidationCode] = useState("");
  const [validationIssues, setValidationIssues] = useState<CanonGraphValidationIssue[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const apiPath = `/admin/universe/${encodeURIComponent(universeId)}/canon`;

  const loadRevisions = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetchClient.get<CanonAdminResponse>(apiPath, { cache: "no-store" });
      const data = Array.isArray(response.data?.data) ? response.data.data.filter(isRevision) : [];
      setRevisions(data);
      setSelectedRevisionId((current) => current && data.some((revision) => revision.revisionId === current) ? current : latestRevisions(data)[0]?.revisionId || "");
      setAnnouncement(lang({ ko: `Canon revision ${data.length}건을 불러왔습니다.`, en: `Loaded ${data.length} Canon revisions.` }));
    } catch (error) {
      const parsed = readCanonError(error);
      setErrorMessage(parsed.message);
      setAnnouncement(lang({ ko: "Canon 목록을 불러오지 못했습니다.", en: "Could not load Canon revisions." }));
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    // 서버 API가 관리자 권한을 검증한 뒤에만 목록을 반환한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRevisions();
  }, [loadRevisions]);

  const latest = useMemo(() => latestRevisions(revisions), [revisions]);
  const visibleEntities = useMemo(
    () => latest.filter((revision) => (!statusFilter || revision.status === statusFilter) && (!entityFilter || revision.entityType === entityFilter)),
    [latest, statusFilter, entityFilter],
  );
  const selected = useMemo(() => revisions.find((revision) => revision.revisionId === selectedRevisionId) || null, [revisions, selectedRevisionId]);
  const statusCounts = useMemo(
    () => CANON_REVISION_STATUS_VALUES.reduce<Record<string, number>>((counts, status) => {
      counts[status] = latest.filter((revision) => revision.status === status).length;
      return counts;
    }, {}),
    [latest],
  );

  const handleCreate = async () => {
    setErrorMessage("");
    setValidationIssues([]);
    setValidationCode("");
    let payload: CanonPayload;
    try {
      const parsed: unknown = JSON.parse(draft.payloadText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload_object_required");
      payload = parsed as CanonPayload;
    } catch {
      setErrorMessage(lang({ ko: "Payload는 유효한 JSON object여야 합니다.", en: "Payload must be a valid JSON object." }));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchClient.post<CanonAdminResponse>(apiPath, {
        action: "create",
        namespace: "official",
        entityType: draft.entityType,
        layer: CANON_ENTITY_LAYER[draft.entityType],
        entityId: draft.entityId,
        payload,
        changelog: draft.changelog,
        createdByType: "admin",
      });
      const created = isRevision(response.data?.data) ? response.data.data : null;
      await loadRevisions();
      if (created) setSelectedRevisionId(created.revisionId);
      setDraft(defaultDraft());
      setAnnouncement(lang({ ko: "Draft를 저장했습니다.", en: "Draft saved." }));
    } catch (error) {
      const parsed = readCanonError(error);
      setErrorMessage(parsed.message);
      setValidationCode(parsed.code);
      setValidationIssues(parsed.issues);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransition = async (revisionId: string, to: CanonRevisionStatus) => {
    setTransitionBusy(true);
    setErrorMessage("");
    setValidationCode("");
    setValidationIssues([]);
    try {
      await fetchClient.post<CanonAdminResponse>(apiPath, { action: "transition", revisionId, to });
      await loadRevisions();
      setAnnouncement(lang({ ko: `${to} 상태로 전이했습니다.`, en: `Transitioned to ${to}.` }));
    } catch (error) {
      const parsed = readCanonError(error);
      setErrorMessage(parsed.message);
      setValidationCode(parsed.code);
      setValidationIssues(parsed.issues);
      setAnnouncement(lang({ ko: "상태 전이에 실패했습니다.", en: "Status transition failed." }));
    } finally {
      setTransitionBusy(false);
    }
  };

  const selectIssue = (issue: CanonGraphValidationIssue) => {
    const match = revisions
      .filter((revision) => revision.entityId === issue.entityId && (!issue.entityType || revision.entityType === issue.entityType))
      .sort((a, b) => b.revision - a.revision)[0];
    if (!match) return;
    setSelectedRevisionId(match.revisionId);
    document.getElementById("canon-revision-inspector")?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  if (loading && revisions.length === 0) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <div className={cn(PAGE_LAYOUT_CLASS, THEME_OVERRIDE_CLASS, "overflow-x-hidden")}>
      <a href="#canon-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-white">
        <Lang text={{ ko: "본문으로 건너뛰기", en: "Skip to content" }} />
      </a>
      <main id="canon-main" className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 p-4 md:p-6">
        <header className="rounded-xl border border-border bg-surface/80 p-4 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-text">
                <button type="button" onClick={() => router.push(`/admin/${encodeURIComponent(universeId)}`)} className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <Lang text={{ ko: "유니버스 관리자", en: "Universe admin" }} />
                </button>
                <span aria-hidden="true">/</span>
                <span><Lang text={{ ko: "Global Canon", en: "Global Canon" }} /></span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Shield className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <h1 className="break-words text-2xl font-bold text-primary-text md:text-3xl"><Lang text={{ ko: "Global Canon 저작 콘솔", en: "Global Canon authoring console" }} /></h1>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-secondary-text">
                <Lang text={{ ko: "공식 세계관을 revision 단위로 작성하고, graph 검증을 거쳐 Review·Publish 상태로 전이합니다.", en: "Author the official world in revisions, validate its graph, then move it through Review and Publish." }} />
              </p>
              <code className="mt-3 inline-block max-w-full break-all rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-secondary-text">{universeId}</code>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadRevisions()} loading={loading} className="min-h-11 shrink-0">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label={lang({ ko: "Canon 상태 요약", en: "Canon status summary" })}>
          {CANON_REVISION_STATUS_VALUES.map((status) => (
            <div key={status} className="rounded-xl border border-border bg-surface/70 p-3">
              <p className="text-xs text-secondary-text">{statusLabel(status)}</p>
              <p className="mt-1 font-mono text-xl font-semibold text-primary-text">{statusCounts[status] || 0}</p>
            </div>
          ))}
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-primary-text" role="alert">{errorMessage}</div>
        )}
        <p className="sr-only" aria-live="polite">{announcement}</p>

        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-xl border border-border bg-surface/80 p-4" aria-labelledby="canon-entities-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="canon-entities-heading" className="text-base font-semibold text-primary-text"><Lang text={{ ko: "Entity 목록", en: "Entity list" }} /></h2>
                  <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "각 entity의 최신 revision을 기준으로 표시합니다.", en: "Showing the latest revision for each entity." }} /></p>
                </div>
                <Badge variant="outline" size="xs">{visibleEntities.length} / {latest.length}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-secondary-text">
                  <span><Lang text={{ ko: "상태 필터", en: "Status filter" }} /></span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className={cn(inputClassName, "w-full")} aria-label={lang({ ko: "상태 필터", en: "Status filter" })}>
                    <option value="">{lang({ ko: "전체 상태", en: "All statuses" })}</option>
                    {CANON_REVISION_STATUS_VALUES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-secondary-text">
                  <span><Lang text={{ ko: "Entity 필터", en: "Entity filter" }} /></span>
                  <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value as CanonEntityType | "")} className={cn(inputClassName, "w-full")} aria-label={lang({ ko: "Entity 필터", en: "Entity filter" })}>
                    <option value="">{lang({ ko: "전체 종류", en: "All entity types" })}</option>
                    {CANON_ENTITY_TYPE_VALUES.map((entityType) => <option key={entityType} value={entityType}>{CANON_ENTITY_LABELS[entityType]}</option>)}
                  </select>
                </label>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2" aria-label={lang({ ko: "Canon entity 목록", en: "Canon entity list" })}>
                {visibleEntities.map((revision) => (
                  <li key={revision.revisionId}>
                    <button
                      type="button"
                      onClick={() => setSelectedRevisionId(revision.revisionId)}
                      className={cn(
                        "flex min-h-16 w-full min-w-0 items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
                        selectedRevisionId === revision.revisionId ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:border-primary/50",
                      )}
                      aria-pressed={selectedRevisionId === revision.revisionId}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-secondary-text">{entityLabel(revision.entityType)}</span>
                        <span className="mt-1 block break-all font-mono text-sm text-primary-text">{revision.entityId}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={statusVariant[revision.status]} size="xs">{statusLabel(revision.status)}</Badge>
                        <span className="font-mono text-[11px] text-secondary-text">r{revision.revision}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {visibleEntities.length === 0 && <p className="mt-4 text-sm text-secondary-text"><Lang text={{ ko: "필터와 일치하는 entity가 없습니다.", en: "No entities match the filters." }} /></p>}
            </section>

            <CanonGraphView revisions={latest} onSelect={(revision) => setSelectedRevisionId(revision.revisionId)} />
          </div>

          <div className="min-w-0 space-y-5">
            <section className="rounded-xl border border-border bg-surface/80 p-4" aria-labelledby="canon-draft-heading">
              <div className="mb-4 flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 id="canon-draft-heading" className="text-base font-semibold text-primary-text"><Lang text={{ ko: "저작 작업면", en: "Authoring workspace" }} /></h2>
              </div>
              <CanonDraftForm value={draft} submitting={submitting} onChange={setDraft} onSubmit={() => void handleCreate()} />
            </section>

            <div id="canon-revision-inspector" className="scroll-mt-4">
              <CanonRevisionInspector
                selected={selected}
                revisions={revisions}
                validationIssues={validationIssues}
                validationCode={validationCode}
                transitionBusy={transitionBusy}
                onTransition={(revisionId, to) => void handleTransition(revisionId, to)}
                onSelectIssue={selectIssue}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
