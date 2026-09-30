import "server-only";
import {
  appendNarrativeEventIfAbsent,
  claimNarrativeEvent,
  createUserStoryStateIfAbsent,
  getUserStoryState,
  markNarrativeEventApplied,
  markNarrativeEventRejected,
  updateUserStoryStateAtomic,
} from "libs/database/game";
import { assertNarrativeCollectionAllowed } from "libs/server-utils/narrative/narrativeLifecycle";
import {
  reduceNarrativeState,
  validateNarrativeOutcome,
} from "libs/server-utils/narrative/narrativeReducerCore";
import type { NarrativeOutcome, NarrativeStateSnapshot } from "types/game";

/**
 * @docHint
 * @purpose 서버 권위 Outcome Resolver와 allowlisted Personal Canon reducer의 저장 adapter
 * @process action/evaluation 판정  event 멱등성  optimistic snapshot 적용  crash 후 reconciliation
 * @domain narrative-runtime
 * @scope server
 */

export {
  buildInitialNarrativeState,
  reduceNarrativeState,
  replayNarrativeEvents,
  resolveNarrativeOutcome,
  validateNarrativeOutcome,
} from "libs/server-utils/narrative/narrativeReducerCore";

function snapshotFromState(state: {
  version: number;
  activeArcIds: string[];
  activeBeatIds: string[];
  completedBeatIds: string[];
  flags: Record<string, string | number | boolean>;
  relationAffinity: Record<string, number>;
  relations?: NarrativeStateSnapshot["relations"];
  lastEventId?: string | null;
}): NarrativeStateSnapshot {
  return {
    schemaVersion: 1,
    version: Number(state.version || 0),
    activeArcIds: [...(state.activeArcIds || [])],
    activeBeatIds: [...(state.activeBeatIds || [])],
    completedBeatIds: [...(state.completedBeatIds || [])],
    flags: { ...(state.flags || {}) },
    relationAffinity: { ...(state.relationAffinity || {}) },
    relations: { ...(state.relations || {}) },
    lastEventId: state.lastEventId || null,
  };
}

export async function applyNarrativeOutcome(input: {
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  canonRevision: number;
  idempotencyKey: string;
  outcome: NarrativeOutcome;
}) {
  if (!validateNarrativeOutcome(input.outcome)) throw new Error("NARRATIVE_OUTCOME_INVALID");
  await assertNarrativeCollectionAllowed(input.uid);
  const identity = { uid: input.uid, universeId: input.universeId, narrativeProfileId: input.narrativeProfileId };
  let state = await getUserStoryState(identity);
  if (!state) state = await createUserStoryStateIfAbsent({ ...identity, canonRevision: input.canonRevision });
  const appended = await appendNarrativeEventIfAbsent({ ...identity, idempotencyKey: input.idempotencyKey, outcome: input.outcome, beforeVersion: state.version });
  if (appended.duplicate && appended.event.status === "applied") return { state, event: appended.event, duplicate: true };
  if (appended.event.status === "rejected") throw new Error("NARRATIVE_EVENT_REJECTED");
  const claimed = await claimNarrativeEvent({ eventId: appended.event.eventId, staleBefore: new Date(Date.now() - 60_000) });
  if (!claimed) throw new Error("NARRATIVE_EVENT_IN_PROGRESS");
  state = await getUserStoryState(identity);
  if (state && state.lastEventId === claimed.eventId && state.version === claimed.beforeVersion + 1) {
    const reconciled = await markNarrativeEventApplied({ eventId: claimed.eventId, afterVersion: state.version });
    if (!reconciled) throw new Error("NARRATIVE_EVENT_RECONCILIATION_FAILED");
    return { state, event: reconciled, duplicate: true };
  }
  if (!state || state.version !== claimed.beforeVersion) {
    await markNarrativeEventRejected({ eventId: claimed.eventId, failed: true });
    throw new Error("NARRATIVE_STATE_VERSION_CONFLICT");
  }
  const next = reduceNarrativeState(snapshotFromState(state), claimed.outcome, claimed.eventId);
  const saved = await updateUserStoryStateAtomic({ identity, expectedVersion: state.version, snapshot: next });
  if (!saved) {
    await markNarrativeEventRejected({ eventId: claimed.eventId, failed: true });
    throw new Error("NARRATIVE_STATE_APPLY_CONFLICT");
  }
  const event = await markNarrativeEventApplied({ eventId: claimed.eventId, afterVersion: next.version });
  if (!event) throw new Error("NARRATIVE_EVENT_APPLY_FAILED");
  return { state: saved, event, duplicate: false };
}
