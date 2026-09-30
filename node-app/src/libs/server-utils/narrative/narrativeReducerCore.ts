import {
  NARRATIVE_EVENT_SOURCE_VALUES,
  NARRATIVE_TRANSITION_VALUES,
  type INarrativeEventDoc,
  type NarrativeEventSource,
  NARRATIVE_RELATION_STATUS_VALUES,
  NARRATIVE_RELATION_VISIBILITY_VALUES,
  type NarrativeOutcome,
  type NarrativeRelationProjection,
  type NarrativeStateSnapshot,
  type NarrativeTransitionType,
} from "types/game";

/**
 * @docHint
 * @purpose 외부 DB·AI 호출 없는 Narrative Outcome 검증·reducer·replay
 * @process action allowlist  scalar payload 검사  snapshot 순수 전이  event 순서 replay
 * @domain narrative-runtime
 * @scope server
 */

type Scalar = string | number | boolean;
type ResolverAction =
  | { type: "activate_arc"; arcId: string }
  | { type: "discover_beat"; beatId: string }
  | { type: "complete_beat"; beatId: string }
  | { type: "set_relation_signal"; targetCharacterId: string; delta: number }
  | { type: "establish_relation"; playerCharacterInstanceId: string; targetCharacterId: string; relationType: string; reason: string; visibility?: "private" | "shared" }
  | { type: "change_relation"; playerCharacterInstanceId: string; targetCharacterId: string; relationType: string; reason: string; visibility?: "private" | "shared" }
  | { type: "end_relation"; playerCharacterInstanceId: string; targetCharacterId: string; relationType: string; reason: string; visibility?: "private" | "shared" }
  | { type: "restore_relation"; playerCharacterInstanceId: string; targetCharacterId: string; relationType: string; reason: string; visibility?: "private" | "shared" }
  | { type: "set_flag"; key: string; value: Scalar };

function validId(value: unknown, max = 160) {
  const item = String(value || "").trim();
  return Boolean(item && item.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(item));
}

function error(code: string) {
  const result = new Error(code) as Error & { code: string };
  result.code = code;
  return result;
}

function isScalar(value: unknown): value is Scalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function validText(value: unknown, max = 500) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function validRelationPayload(payload: Record<string, unknown>, expectedStatus: "active" | "ended") {
  return exactPayload(payload, ["playerCharacterInstanceId", "targetCharacterId", "relationType", "status", "reason", "visibility"])
    && validId(payload.playerCharacterInstanceId)
    && validId(payload.targetCharacterId)
    && validText(payload.relationType, 80)
    && NARRATIVE_RELATION_STATUS_VALUES.includes(payload.status as (typeof NARRATIVE_RELATION_STATUS_VALUES)[number])
    && payload.status === expectedStatus
    && validText(payload.reason)
    && NARRATIVE_RELATION_VISIBILITY_VALUES.includes(payload.visibility as (typeof NARRATIVE_RELATION_VISIBILITY_VALUES)[number]);
}

function exactPayload(payload: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(payload).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

export function validateNarrativeOutcome(value: unknown): value is NarrativeOutcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const outcome = value as Record<string, unknown>;
  if (!NARRATIVE_EVENT_SOURCE_VALUES.includes(outcome.source as NarrativeEventSource)) return false;
  if (!NARRATIVE_TRANSITION_VALUES.includes(outcome.transition as NarrativeTransitionType)) return false;
  if (outcome.resolverVersion !== 1 || !outcome.payload || typeof outcome.payload !== "object" || Array.isArray(outcome.payload)) return false;
  const payload = outcome.payload as Record<string, unknown>;
  if (Object.values(payload).some((item) => !isScalar(item) && !(Array.isArray(item) && item.every((child) => validId(child))))) return false;
  switch (outcome.transition) {
    case "story.arc.activate":
    case "story.beat.activate":
    case "story.beat.complete": {
      const idKey = outcome.transition === "story.arc.activate" ? "arcId" : "beatId";
      return exactPayload(payload, [idKey]) && validId(payload[idKey]);
    }
    case "world.flag.set":
      return exactPayload(payload, ["key", "value"]) && validId(payload.key, 120) && !/^canon[.:]/i.test(String(payload.key));
    case "relation.affinity.adjust":
      return exactPayload(payload, ["targetCharacterId", "delta"]) && validId(payload.targetCharacterId) && typeof payload.delta === "number" && Number.isInteger(payload.delta) && payload.delta >= -100 && payload.delta <= 100;
    case "relation.established":
    case "relation.changed":
    case "relation.restored":
      return validRelationPayload(payload, "active");
    case "relation.ended":
      return validRelationPayload(payload, "ended");
    default:
      return false;
  }
}

export function resolveNarrativeOutcome(input: {
  source: NarrativeEventSource;
  action: ResolverAction | { type: "answer_evaluated"; beatId: string; passed: boolean };
}): NarrativeOutcome | null {
  const action = input.action;
  let outcome: NarrativeOutcome | null = null;
  if (action.type === "activate_arc") outcome = { source: input.source, transition: "story.arc.activate", payload: { arcId: action.arcId }, resolverVersion: 1 };
  if (action.type === "discover_beat") outcome = { source: input.source, transition: "story.beat.activate", payload: { beatId: action.beatId }, resolverVersion: 1 };
  if (action.type === "complete_beat") outcome = { source: input.source, transition: "story.beat.complete", payload: { beatId: action.beatId }, resolverVersion: 1 };
  if (action.type === "set_relation_signal") outcome = { source: input.source, transition: "relation.affinity.adjust", payload: { targetCharacterId: action.targetCharacterId, delta: Math.trunc(action.delta) }, resolverVersion: 1 };
  if (["establish_relation", "change_relation", "end_relation", "restore_relation"].includes(action.type)) {
    const relationAction = action as Extract<ResolverAction, { type: "establish_relation" | "change_relation" | "end_relation" | "restore_relation" }>;
    const transition = relationAction.type === "establish_relation"
      ? "relation.established"
      : relationAction.type === "change_relation"
        ? "relation.changed"
        : relationAction.type === "end_relation"
          ? "relation.ended"
          : "relation.restored";
    outcome = {
      source: input.source,
      transition,
      payload: {
        playerCharacterInstanceId: relationAction.playerCharacterInstanceId,
        targetCharacterId: relationAction.targetCharacterId,
        relationType: relationAction.relationType,
        status: transition === "relation.ended" ? "ended" : "active",
        reason: relationAction.reason,
        visibility: relationAction.visibility || "private",
      },
      resolverVersion: 1,
    };
  }
  if (action.type === "set_flag") outcome = { source: input.source, transition: "world.flag.set", payload: { key: action.key, value: action.value }, resolverVersion: 1 };
  if (action.type === "answer_evaluated" && action.passed === true) outcome = { source: "learning_evaluation", transition: "story.beat.complete", payload: { beatId: action.beatId }, resolverVersion: 1 };
  if (outcome && !validateNarrativeOutcome(outcome)) throw error("NARRATIVE_OUTCOME_INVALID");
  return outcome;
}

export function buildInitialNarrativeState(): NarrativeStateSnapshot {
  return { schemaVersion: 1, version: 0, activeArcIds: [], activeBeatIds: [], completedBeatIds: [], flags: {}, relationAffinity: {}, relations: {}, lastEventId: null };
}

export function reduceNarrativeState(snapshot: NarrativeStateSnapshot, outcome: NarrativeOutcome, eventId?: string): NarrativeStateSnapshot {
  if (!validateNarrativeOutcome(outcome)) throw error("NARRATIVE_OUTCOME_INVALID");
  const next: NarrativeStateSnapshot = {
    schemaVersion: 1,
    version: snapshot.version + 1,
    activeArcIds: [...snapshot.activeArcIds],
    activeBeatIds: [...snapshot.activeBeatIds],
    completedBeatIds: [...snapshot.completedBeatIds],
    flags: { ...snapshot.flags },
    relationAffinity: { ...snapshot.relationAffinity },
    relations: { ...(snapshot.relations || {}) },
    lastEventId: eventId || snapshot.lastEventId || null,
  };
  const add = (values: string[], value: string) => values.includes(value) ? values : [...values, value];
  if (outcome.transition === "story.arc.activate") next.activeArcIds = add(next.activeArcIds, String(outcome.payload.arcId));
  if (outcome.transition === "story.beat.activate") next.activeBeatIds = add(next.activeBeatIds, String(outcome.payload.beatId));
  if (outcome.transition === "story.beat.complete") {
    const beatId = String(outcome.payload.beatId);
    next.activeBeatIds = next.activeBeatIds.filter((item) => item !== beatId);
    next.completedBeatIds = add(next.completedBeatIds, beatId);
  }
  if (outcome.transition === "world.flag.set") {
    const value = outcome.payload.value;
    if (!isScalar(value)) throw error("NARRATIVE_OUTCOME_INVALID");
    next.flags[String(outcome.payload.key)] = value;
  }
  if (outcome.transition === "relation.affinity.adjust") {
    const target = String(outcome.payload.targetCharacterId);
    next.relationAffinity[target] = Math.max(-100, Math.min(100, Number(next.relationAffinity[target] || 0) + Number(outcome.payload.delta)));
  }
  if (["relation.established", "relation.changed", "relation.ended", "relation.restored"].includes(outcome.transition)) {
    const payload = outcome.payload;
    const playerCharacterInstanceId = String(payload.playerCharacterInstanceId);
    const targetCharacterId = String(payload.targetCharacterId);
    const relationKey = `${playerCharacterInstanceId}:${targetCharacterId}`;
    const previous = next.relations?.[relationKey];
    const currentEventId = eventId || `reducer:${next.version}`;
    const changedByEventIds = previous?.changedByEventIds?.includes(currentEventId)
      ? [...previous.changedByEventIds]
      : [...(previous?.changedByEventIds || []), currentEventId];
    const relation: NarrativeRelationProjection = {
      relationKey,
      playerCharacterInstanceId,
      targetCharacterId,
      relationType: String(payload.relationType),
      status: String(payload.status) === "ended" ? "ended" : "active",
      sinceEventId: previous?.sinceEventId || currentEventId,
      changedByEventIds,
      reason: String(payload.reason),
      visibility: String(payload.visibility) === "shared" ? "shared" : "private",
      relationVersion: Number(previous?.relationVersion || 0) + 1,
    };
    next.relations = { ...(next.relations || {}), [relationKey]: relation };
  }
  return next;
}

export function replayNarrativeEvents(initial: NarrativeStateSnapshot, events: readonly INarrativeEventDoc[]) {
  const seen = new Set<string>();
  return [...events]
    .filter((item) => item.status === "applied")
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.eventId.localeCompare(b.eventId))
    .reduce((snapshot, event) => {
      if (seen.has(event.eventId)) throw error("NARRATIVE_REPLAY_DUPLICATE_EVENT");
      seen.add(event.eventId);
      if (event.beforeVersion !== snapshot.version) throw error("NARRATIVE_REPLAY_VERSION_CONFLICT");
      return reduceNarrativeState(snapshot, event.outcome, event.eventId);
    }, initial);
}
