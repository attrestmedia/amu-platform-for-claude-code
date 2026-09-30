"use client";

import { Badge, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { CANON_ALLOWED_TRANSITIONS, type CanonGraphValidationIssue } from "types/game";
import {
  entityLabel,
  formatRevisionDate,
  payloadText,
  readCanonError,
  revisionHistory,
  type CanonAdminRevision,
} from "./canonAdminTypes";

type CanonRevisionInspectorProps = {
  selected: CanonAdminRevision | null;
  revisions: CanonAdminRevision[];
  validationIssues: CanonGraphValidationIssue[];
  validationCode?: string;
  transitionBusy: boolean;
  onTransition: (revisionId: string, to: CanonAdminRevision["status"]) => void;
  onSelectIssue: (issue: CanonGraphValidationIssue) => void;
};

const statusVariant: Record<CanonAdminRevision["status"], "outline" | "primary" | "accent" | "destructive" | "muted"> = {
  draft: "muted",
  review: "accent",
  published: "primary",
  deprecated: "destructive",
  archived: "outline",
};

const transitionLabels: Record<string, { ko: string; en: string }> = {
  review: { ko: "Review 제출", en: "Submit for review" },
  published: { ko: "Publish", en: "Publish" },
  deprecated: { ko: "Deprecated 처리", en: "Deprecate" },
  archived: { ko: "Archive", en: "Archive" },
  draft: { ko: "Draft로 되돌리기", en: "Return to draft" },
};

function statusLabel(status: CanonAdminRevision["status"]) {
  return {
    draft: lang({ ko: "Draft", en: "Draft" }),
    review: lang({ ko: "Review", en: "Review" }),
    published: lang({ ko: "Published", en: "Published" }),
    deprecated: lang({ ko: "Deprecated", en: "Deprecated" }),
    archived: lang({ ko: "Archived", en: "Archived" }),
  }[status];
}

function allowedTransitions(status: CanonAdminRevision["status"]) {
  return CANON_ALLOWED_TRANSITIONS[status];
}

export function CanonRevisionInspector({
  selected,
  revisions,
  validationIssues,
  validationCode,
  transitionBusy,
  onTransition,
  onSelectIssue,
}: CanonRevisionInspectorProps) {
  if (!selected) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-sm text-secondary-text" aria-live="polite">
        <p><Lang text={{ ko: "왼쪽 목록에서 entity를 선택하면 revision 상세가 표시됩니다.", en: "Select an entity from the list to inspect its revision." }} /></p>
      </section>
    );
  }

  const history = revisionHistory(revisions, selected);
  const previous = history.find((revision) => revision.revision < selected.revision) || null;
  const transitions = allowedTransitions(selected.status);

  return (
    <section className="space-y-4" aria-labelledby="canon-inspector-heading">
      <div className="rounded-xl border border-border bg-surface/80 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">{entityLabel(selected.entityType)}</p>
            <h2 id="canon-inspector-heading" className="mt-1 break-all font-mono text-lg font-semibold text-primary-text">{selected.entityId}</h2>
            <p className="mt-1 text-xs text-secondary-text">
              <Lang text={{ ko: `revision ${selected.revision} · 생성 ${formatRevisionDate(selected.createdAt)}`, en: `revision ${selected.revision} · created ${formatRevisionDate(selected.createdAt)}` }} />
            </p>
          </div>
          <Badge variant={statusVariant[selected.status]} size="sm">{statusLabel(selected.status)}</Badge>
        </div>

        {transitions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label={lang({ ko: "Revision 상태 전이", en: "Revision status transitions" })}>
            {transitions.map((to) => (
              <Button
                key={to}
                size="sm"
                variant={to === "published" ? "primary" : "outline"}
                loading={transitionBusy}
                onClick={() => onTransition(selected.revisionId, to)}
              >
                <Lang text={transitionLabels[to]} />
              </Button>
            ))}
          </div>
        )}
      </div>

      {validationIssues.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4" role="alert" aria-labelledby="canon-validation-heading">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 id="canon-validation-heading" className="font-semibold text-primary-text">
                <Lang text={{ ko: "Publish 검증 실패", en: "Publish validation failed" }} />
              </h3>
              <p className="mt-1 text-xs text-secondary-text">{validationCode || "CANON_GRAPH_CONFLICT"}</p>
            </div>
            <Badge variant="destructive" size="xs">{validationIssues.length}</Badge>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {validationIssues.map((issue, index) => (
              <li key={`${issue.code}-${issue.entityId}-${index}`} className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/20 bg-background/60 p-2">
                <code className="font-mono text-xs text-red-700 dark:text-red-300">{issue.code}</code>
                <span className="min-w-0 flex-1 text-primary-text">{issue.message}</span>
                {issue.entityId && (
                  <Button size="xs" variant="outlineDestructive" onClick={() => onSelectIssue(issue)}>
                    <Lang text={{ ko: `${issue.entityType || "entity"}:${issue.entityId} 보기`, en: `View ${issue.entityType || "entity"}:${issue.entityId}` }} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface/80 p-4">
        <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "현재 Payload", en: "Current payload" }} /></h3>
        <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-primary-text">{payloadText(selected.payload)}</pre>
      </div>

      <div className="rounded-xl border border-border bg-surface/80 p-4" aria-labelledby="canon-diff-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="canon-diff-heading" className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "Revision diff", en: "Revision diff" }} /></h3>
          <span className="text-xs text-secondary-text">
            {previous ? lang({ ko: `이전 revision ${previous.revision}과 비교`, en: `Compared with revision ${previous.revision}` }) : lang({ ko: "비교할 이전 revision 없음", en: "No previous revision to compare" })}
          </span>
        </div>
        {previous ? (
          <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <DiffColumn title={lang({ ko: `이전 · r${previous.revision}`, en: `Before · r${previous.revision}` })} value={payloadText(previous.payload)} tone="removed" />
            <DiffColumn title={lang({ ko: `현재 · r${selected.revision}`, en: `After · r${selected.revision}` })} value={payloadText(selected.payload)} tone="added" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-secondary-text"><Lang text={{ ko: "첫 revision입니다.", en: "This is the first revision." }} /></p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface/80 p-4" aria-labelledby="canon-changelog-heading">
        <h3 id="canon-changelog-heading" className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "Changelog", en: "Changelog" }} /></h3>
        <ol className="mt-3 space-y-3 border-l border-border pl-4">
          {history.map((revision) => (
            <li key={revision.revisionId} className="relative text-sm">
              <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-secondary-text">r{revision.revision}</span>
                <Badge variant={statusVariant[revision.status]} size="xs">{statusLabel(revision.status)}</Badge>
                <span className="text-xs text-secondary-text">{formatRevisionDate(revision.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-primary-text">{revision.changelog || lang({ ko: "기록 없음", en: "No changelog" })}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DiffColumn({ title, value, tone }: { title: string; value: string; tone: "removed" | "added" }) {
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${tone === "removed" ? "border-red-500/20 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
      <p className="text-xs font-medium text-secondary-text">{title}</p>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-primary-text">{value}</pre>
    </div>
  );
}

export function canonErrorIssues(error: unknown) {
  return readCanonError(error);
}
