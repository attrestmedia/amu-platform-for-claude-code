import "server-only";

import type { IPersonalUniverseCanonRevisionDoc, PublicUniverseSnapshotContent, CrossUniverseMatchCandidate } from "types/game";

/**
 * 비용/AI 호출 없이 동작하는 Cross-Universe MVP 후보 정렬.
 * 공개 Snapshot만 상대 후보로 읽고, 자동 등장·rarity·경제 신호는 절대 만들지 않는다.
 */
function terms(value: unknown) {
  return new Set(String(value || "").toLocaleLowerCase("ko-KR").split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2).slice(0, 80));
}

function overlap(left: Set<string>, right: Set<string>) {
  let count = 0;
  left.forEach((term) => { if (right.has(term)) count += 1; });
  return count;
}

function canonTerms(revisions: readonly IPersonalUniverseCanonRevisionDoc[]) {
  return revisions.flatMap((revision) => [revision.payload.title, revision.payload.summary, revision.payload.description, revision.payload.premise]).reduce((all, value) => {
    terms(value).forEach((term) => all.add(term));
    return all;
  }, new Set<string>());
}

function openLoopTerms(revisions: readonly IPersonalUniverseCanonRevisionDoc[]) {
  return revisions.filter((revision) => revision.entityType === "open-loop").reduce((all, revision) => {
    terms(`${revision.payload.title || ""} ${revision.payload.summary || ""}`).forEach((term) => all.add(term));
    return all;
  }, new Set<string>());
}

export function buildCrossUniverseMatchCandidates(input: {
  ownCanon: readonly IPersonalUniverseCanonRevisionDoc[];
  candidates: ReadonlyArray<{ snapshotId: string; personalUniverseId: string; content: PublicUniverseSnapshotContent }>;
  limit?: number;
}): CrossUniverseMatchCandidate[] {
  const own = canonTerms(input.ownCanon);
  const loops = openLoopTerms(input.ownCanon);
  return input.candidates.map((candidate) => {
    const publicText = [candidate.content.worldName, candidate.content.premise, ...candidate.content.entities.flatMap((entity) => [entity.title, entity.summary, entity.description])].join(" ");
    const candidateTerms = terms(publicText);
    const loopScore = overlap(loops, candidateTerms);
    const canonScore = overlap(own, candidateTerms);
    const characterIds = candidate.content.entities.filter((entity) => entity.entityType === "character").map((entity) => entity.entityId).slice(0, 12);
    const reasons: CrossUniverseMatchCandidate["reasons"] = ["sharing-policy"];
    if (loopScore) reasons.unshift("open-loop");
    if (canonScore) reasons.push("canon-theme");
    if (characterIds.length) reasons.push("character-context");
    return {
      snapshotId: candidate.snapshotId,
      universeId: candidate.personalUniverseId,
      worldName: candidate.content.worldName,
      characterIds,
      score: loopScore * 3 + canonScore + 1,
      reasons: Array.from(new Set(reasons)),
      approvalRequired: true as const,
      automaticAppearance: false as const,
      estimatedCoins: 0 as const,
    };
  }).sort((a, b) => b.score - a.score || a.snapshotId.localeCompare(b.snapshotId)).slice(0, Math.max(1, Math.min(10, Math.floor(input.limit || 5))));
}
