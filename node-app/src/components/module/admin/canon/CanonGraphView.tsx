"use client";

import { Badge } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { GitBranch } from "lucide-react";
import type { CanonEntityType } from "types/game";
import { entityLabel, referencesForRevision, type CanonAdminRevision } from "./canonAdminTypes";

type CanonGraphViewProps = {
  revisions: CanonAdminRevision[];
  onSelect: (revision: CanonAdminRevision) => void;
};

export function CanonGraphView({ revisions, onSelect }: CanonGraphViewProps) {
  const targetKeys = new Set(revisions.map((revision) => `${revision.entityType}:${revision.entityId}`));
  const groups = new Map<CanonEntityType, CanonAdminRevision[]>();
  revisions.forEach((revision) => {
    const group = groups.get(revision.entityType) || [];
    group.push(revision);
    groups.set(revision.entityType, group);
  });

  return (
    <section className="rounded-xl border border-border bg-surface/80 p-4" aria-labelledby="canon-graph-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="canon-graph-heading" className="text-base font-semibold text-primary-text"><Lang text={{ ko: "Canon Graph", en: "Canon Graph" }} /></h2>
          <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "현재 revision의 참조 관계를 리스트·트리 형태로 확인합니다.", en: "Inspect references from the current revisions as a list/tree." }} /></p>
        </div>
        <Badge variant="outline" size="xs">{revisions.length} entities</Badge>
      </div>

      {revisions.length === 0 ? (
        <p className="mt-4 text-sm text-secondary-text"><Lang text={{ ko: "표시할 published 또는 작업 중인 entity가 없습니다.", en: "No published or in-progress entities to display." }} /></p>
      ) : (
        <div className="mt-4 space-y-4">
          {[...groups.entries()].map(([entityType, items]) => (
            <div key={entityType}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary-text">{entityLabel(entityType)} · {items.length}</h3>
              <ul className="mt-2 space-y-2">
                {items.map((revision) => {
                  const references = referencesForRevision(revision);
                  return (
                    <li key={revision.revisionId} className="rounded-lg border border-border bg-background/60 p-3">
                      <button
                        type="button"
                        onClick={() => onSelect(revision)}
                        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={lang({ ko: `${revision.entityType}:${revision.entityId} 상세 보기`, en: `Inspect ${revision.entityType}:${revision.entityId}` })}
                      >
                        <span className="min-w-0 break-all font-mono text-primary-text">{revision.entityId}</span>
                        <span className="shrink-0 text-xs text-secondary-text">r{revision.revision}</span>
                      </button>
                      <ul className="mt-2 space-y-1 border-l border-border pl-3 text-xs">
                        {references.length > 0 ? references.map((reference) => {
                          const exists = targetKeys.has(`${reference.targetType}:${reference.targetId}`);
                          return (
                            <li key={`${reference.path}-${reference.targetType}-${reference.targetId}`} className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <GitBranch className="h-3.5 w-3.5 shrink-0 text-secondary-text" aria-hidden="true" />
                              <span className="text-secondary-text">{reference.path.replace("payload.", "")}</span>
                              <span className={exists ? "break-all font-mono text-primary-text" : "break-all font-mono text-danger"}>
                                {reference.targetType}:{reference.targetId}
                              </span>
                              {!exists && <Badge variant="destructive" size="xs"><Lang text={{ ko: "누락", en: "missing" }} /></Badge>}
                            </li>
                          );
                        }) : (
                          <li className="text-secondary-text"><Lang text={{ ko: "참조 없음", en: "No references" }} /></li>
                        )}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
