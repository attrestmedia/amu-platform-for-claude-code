/**
 * @docHint
 * @purpose Narrative Director·Outcome Resolver·Reducer 계약
 * @process 구조화 proposal 검증  허용 outcome 생성  개인 상태 reducer 적용
 * @domain narrative-runtime
 * @scope server
 */

export const NARRATIVE_TRANSITION_VALUES = [
  "story.arc.activate",
  "story.beat.activate",
  "story.beat.complete",
  "world.flag.set",
  "relation.affinity.adjust",
  "relation.established",
  "relation.changed",
  "relation.ended",
  "relation.restored",
] as const;
export type NarrativeTransitionType = (typeof NARRATIVE_TRANSITION_VALUES)[number];

export const NARRATIVE_RELATION_STATUS_VALUES = ["active", "ended"] as const;
export type NarrativeRelationStatus = (typeof NARRATIVE_RELATION_STATUS_VALUES)[number];
export const NARRATIVE_RELATION_VISIBILITY_VALUES = ["private", "shared"] as const;
export type NarrativeRelationVisibility = (typeof NARRATIVE_RELATION_VISIBILITY_VALUES)[number];

export interface NarrativeRelationProjection {
  relationKey: string;
  playerCharacterInstanceId: string;
  targetCharacterId: string;
  relationType: string;
  status: NarrativeRelationStatus;
  sinceEventId: string;
  changedByEventIds: string[];
  reason: string;
  visibility: NarrativeRelationVisibility;
  relationVersion: number;
}

export const NARRATIVE_EVENT_SOURCE_VALUES = ["user_action", "learning_evaluation", "game_judgement", "system"] as const;
export type NarrativeEventSource = (typeof NARRATIVE_EVENT_SOURCE_VALUES)[number];

export const NARRATIVE_EVENT_STATUS_VALUES = ["prepared", "applying", "applied", "rejected", "failed"] as const;
export type NarrativeEventStatus = (typeof NARRATIVE_EVENT_STATUS_VALUES)[number];

export interface NarrativeTransitionCandidate {
  type: string;
  targetId: string;
  reason?: string;
}

export interface NarrativeDirective {
  schemaVersion: 1;
  universeId: string;
  characterId: string;
  scene: {
    sceneId: string;
    locationId?: string;
    objective?: string;
  };
  motivation: string;
  allowedKnowledge: string[];
  forbiddenKnowledge: string[];
  transitionCandidate?: NarrativeTransitionCandidate | null;
}

export interface NarrativeDirectiveProposal {
  status: "proposal" | "fallback";
  directive: NarrativeDirective | null;
  fallbackReason?: string;
  telemetry: {
    promptTokens: number;
    outputTokens: number;
    cacheHit: boolean;
    modelName?: string;
  };
}

export interface NarrativeOutcome {
  source: NarrativeEventSource;
  transition: NarrativeTransitionType;
  payload: Record<string, string | number | boolean | string[]>;
  resolverVersion: 1;
}

export interface NarrativeStateSnapshot {
  schemaVersion: 1;
  version: number;
  activeArcIds: string[];
  activeBeatIds: string[];
  completedBeatIds: string[];
  flags: Record<string, string | number | boolean>;
  relationAffinity: Record<string, number>;
  relations?: Record<string, NarrativeRelationProjection>;
  lastEventId?: string | null;
}

export interface IUserStoryStateDoc extends NarrativeStateSnapshot {
  stateId: string;
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  canonRevision: number;
  status: "active" | "opted_out" | "deleted";
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IStoryArcDoc {
  arcId: string;
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  characterId: string;
  canonRevision: number;
  status: "locked" | "active" | "completed" | "abandoned";
  goalKey: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IStoryBeatDoc {
  beatId: string;
  arcId: string;
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  sequence: number;
  status: "locked" | "available" | "active" | "completed";
  canonRevision: number;
  transitionKey: NarrativeTransitionType;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface INarrativeEventDoc {
  eventId: string;
  idempotencyKey: string;
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  source: NarrativeEventSource;
  status: NarrativeEventStatus;
  outcome: NarrativeOutcome;
  outcomeHash: string;
  beforeVersion: number;
  afterVersion?: number;
  operationId?: string;
  applyingAt?: string | Date | null;
  appliedAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ICharacterRelationDoc {
  relationId: string;
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  playerCharacterInstanceId: string;
  targetCharacterId: string;
  affinity: number;
  relationType?: string;
  status?: NarrativeRelationStatus;
  sinceEventId?: string;
  changedByEventIds?: string[];
  reason?: string;
  visibility?: NarrativeRelationVisibility;
  relationVersion: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
