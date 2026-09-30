import { createHash } from "node:crypto";
import { validatePersonalCanonGraph } from "libs/server-utils/narrative/canonValidator";
import type { CanonGraphRevisionDoc, CanonPayload } from "types/game";

/**
 * @docHint
 * @purpose Personal Canon 내부의 V-01~V-08 충돌 검사와 Bridge Event proposal 계약
 * @process personal graph 검증  semantic conflict corpus 검사  fail-closed proposal/owner approval command 생성
 * @domain narrative-canon.personal-universe
 * @scope server
 */

export const PERSONAL_CANON_CONFLICT_CODES = [
  "V-01_WORLD_LAW",
  "V-02_TIMELINE",
  "V-03_LOCATION",
  "V-04_SPECIES",
  "V-05_FACTION",
  "V-06_CHARACTER_FACT",
  "V-07_RELATIONSHIP",
  "V-08_KNOWLEDGE",
] as const;
export type PersonalCanonConflictCode = (typeof PERSONAL_CANON_CONFLICT_CODES)[number];

export interface PersonalCanonConflict {
  code: PersonalCanonConflictCode;
  entityType?: CanonGraphRevisionDoc["entityType"];
  entityId?: string;
  path?: string;
  message: string;
  bridgeable: boolean;
}

export interface BridgeEventProposal {
  proposalId: string;
  status: "proposal" | "approved";
  ownerUid: string;
  conflictCodes: PersonalCanonConflictCode[];
  title: string;
  payload: CanonPayload;
}

function latest(revisions: readonly CanonGraphRevisionDoc[]) {
  const result = new Map<string, CanonGraphRevisionDoc>();
  for (const item of revisions.filter((revision) => ["draft", "review", "published"].includes(revision.status))) {
    const key = `${item.entityType}:${item.entityId}`;
    if (!result.has(key) || Number(result.get(key)?.revision || 0) < item.revision) result.set(key, item);
  }
  return [...result.values()];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addConflict(conflicts: PersonalCanonConflict[], conflict: PersonalCanonConflict) {
  if (!conflicts.some((item) => item.code === conflict.code && item.entityId === conflict.entityId && item.path === conflict.path)) conflicts.push(conflict);
}

function detectContradictoryFacts(revisions: readonly CanonGraphRevisionDoc[], conflicts: PersonalCanonConflict[]) {
  const facts = new Map<string, { value: string; entity: CanonGraphRevisionDoc }>();
  for (const entity of revisions) {
    const payload = entity.payload as CanonPayload & { subjectId?: string; factKey?: string; factValue?: string | number | boolean };
    const subjectId = text(payload.subjectId) || (entity.entityType === "character" ? entity.entityId : "");
    const factKey = text(payload.factKey);
    if (!subjectId || !factKey || payload.factValue === undefined) continue;
    const key = `${subjectId}:${factKey}`;
    const value = JSON.stringify(payload.factValue);
    const previous = facts.get(key);
    if (previous && previous.value !== value) {
      addConflict(conflicts, {
        code: entity.entityType === "character" ? "V-06_CHARACTER_FACT" : "V-01_WORLD_LAW",
        entityType: entity.entityType,
        entityId: entity.entityId,
        path: `payload.${factKey}`,
        message: `personal fact ${key} has contradictory values`,
        bridgeable: true,
      });
    } else {
      facts.set(key, { value, entity });
    }
  }
}

function detectLocationConflicts(revisions: readonly CanonGraphRevisionDoc[], conflicts: PersonalCanonConflict[]) {
  const placements = new Map<string, { regionId: string; entity: CanonGraphRevisionDoc }>();
  for (const entity of revisions) {
    const payload = entity.payload;
    const characterIds = Array.isArray(payload.characterIds) ? payload.characterIds : [];
    const regionId = text(payload.regionId);
    const order = Number(payload.startOrder);
    if (!regionId || !Number.isInteger(order)) continue;
    for (const characterId of characterIds.map(text).filter(Boolean)) {
      const key = `${characterId}:${order}`;
      const previous = placements.get(key);
      if (previous && previous.regionId !== regionId) {
        addConflict(conflicts, {
          code: "V-03_LOCATION",
          entityType: entity.entityType,
          entityId: entity.entityId,
          path: "payload.regionId",
          message: `${characterId} is placed in two regions at order ${order}`,
          bridgeable: true,
        });
      } else {
        placements.set(key, { regionId, entity });
      }
    }
  }
}

function detectFactionConflicts(revisions: readonly CanonGraphRevisionDoc[], conflicts: PersonalCanonConflict[]) {
  const factions = new Map(revisions.filter((item) => item.entityType === "faction").map((item) => [item.entityId, text(item.payload.status)]));
  for (const entity of revisions.filter((item) => item.entityType === "character")) {
    const factionId = text(entity.payload.factionId);
    if (factionId && ["disbanded", "dissolved", "inactive"].includes(factions.get(factionId) || "")) {
      addConflict(conflicts, {
        code: "V-05_FACTION",
        entityType: entity.entityType,
        entityId: entity.entityId,
        path: "payload.factionId",
        message: `${entity.entityId} references an inactive faction ${factionId}`,
        bridgeable: true,
      });
    }
  }
}

function detectRelationshipConflicts(revisions: readonly CanonGraphRevisionDoc[], conflicts: PersonalCanonConflict[]) {
  for (const entity of revisions.filter((item) => item.entityType === "relation")) {
    const relationTypes = Array.isArray(entity.payload.relationTypes) ? entity.payload.relationTypes.map(text).filter(Boolean) : [];
    if (relationTypes.includes("ally") && relationTypes.includes("enemy")) {
      addConflict(conflicts, {
        code: "V-07_RELATIONSHIP",
        entityType: entity.entityType,
        entityId: entity.entityId,
        path: "payload.relationTypes",
        message: "one relation definition cannot be ally and enemy at the same time",
        bridgeable: true,
      });
    }
  }
}

function detectKnowledgeConflicts(revisions: readonly CanonGraphRevisionDoc[], conflicts: PersonalCanonConflict[]) {
  for (const entity of revisions) {
    const allowed = new Set((Array.isArray(entity.payload.allowedKnowledge) ? entity.payload.allowedKnowledge : []).map(text).filter(Boolean));
    const forbidden = (Array.isArray(entity.payload.forbiddenKnowledge) ? entity.payload.forbiddenKnowledge : []).map(text).filter(Boolean);
    const overlap = forbidden.find((item) => allowed.has(item));
    if (overlap) {
      addConflict(conflicts, {
        code: "V-08_KNOWLEDGE",
        entityType: entity.entityType,
        entityId: entity.entityId,
        path: "payload.forbiddenKnowledge",
        message: `${overlap} is both allowed and forbidden knowledge`,
        bridgeable: false,
      });
    }
  }
}

export function validatePersonalCanonConflicts(revisions: readonly CanonGraphRevisionDoc[]) {
  const conflicts: PersonalCanonConflict[] = [];
  const graphIssues = validatePersonalCanonGraph(revisions);
  for (const issue of graphIssues) {
    const code: PersonalCanonConflictCode = issue.code === "CANON_TIMELINE_CYCLE"
      ? "V-02_TIMELINE"
      : issue.code === "PERSONAL_CANON_MECHANICS_SPECIES_INVALID"
        ? "V-04_SPECIES"
        : issue.entityType === "relation"
          ? "V-07_RELATIONSHIP"
          : issue.entityType === "event" || issue.entityType === "object"
            ? "V-03_LOCATION"
            : "V-01_WORLD_LAW";
    addConflict(conflicts, { code, entityType: issue.entityType, entityId: issue.entityId, path: issue.path, message: issue.message, bridgeable: true });
  }
  const current = latest(revisions);
  detectContradictoryFacts(current, conflicts);
  detectLocationConflicts(current, conflicts);
  detectFactionConflicts(current, conflicts);
  detectRelationshipConflicts(current, conflicts);
  detectKnowledgeConflicts(current, conflicts);
  return conflicts;
}

export function validatePersonalCanonCommand(input: { revisions: readonly CanonGraphRevisionDoc[]; timeout?: boolean }) {
  if (input.timeout) {
    return { ok: false as const, failClosed: true as const, conflicts: [{ code: "V-01_WORLD_LAW" as const, message: "personal Canon validator timed out", bridgeable: false }] };
  }
  try {
    const conflicts = validatePersonalCanonConflicts(input.revisions);
    return { ok: conflicts.length === 0, failClosed: false, conflicts };
  } catch (error) {
    return { ok: false as const, failClosed: true as const, conflicts: [{ code: "V-01_WORLD_LAW" as const, message: String((error as Error)?.message || "validator failed"), bridgeable: false }] };
  }
}

export function createBridgeEventProposal(input: {
  ownerUid: string;
  conflicts: readonly PersonalCanonConflict[];
  title: string;
  summary: string;
}) : BridgeEventProposal | null {
  const ownerUid = text(input.ownerUid);
  const title = text(input.title);
  const summary = text(input.summary);
  const bridgeable = input.conflicts.filter((conflict) => conflict.bridgeable);
  if (!ownerUid || !title || !summary || bridgeable.length === 0) return null;
  const conflictCodes = [...new Set(bridgeable.map((conflict) => conflict.code))];
  const proposalId = `bridge_${createHash("sha256").update(`${ownerUid}|${title}|${summary}|${conflictCodes.join(",")}`, "utf8").digest("hex").slice(0, 32)}`;
  return {
    proposalId,
    status: "proposal",
    ownerUid,
    conflictCodes,
    title,
    payload: { title, summary, eventType: "bridge-event", conflictCodes },
  };
}

export function approveBridgeEventProposal(input: { proposal: BridgeEventProposal; ownerUid: string }) {
  if (input.proposal.status !== "proposal" || text(input.ownerUid) !== input.proposal.ownerUid) return null;
  return {
    ...input.proposal,
    status: "approved" as const,
    canonCommand: {
      namespace: "personal-universe" as const,
      actorType: "owner" as const,
      entityType: "event" as const,
      layer: "C1" as const,
      payload: input.proposal.payload,
    },
  };
}
