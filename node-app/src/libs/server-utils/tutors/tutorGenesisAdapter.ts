import "server-only";

import { toUnknownRecord, type UnknownRecord } from "utils/common";
import type {
  TutorRoleMechanics,
  TutorServiceContext,
  TutorServiceProjection,
  TutorSharedIdentity,
  TutorSharedRoleIdentity,
} from "types/ai";

export const TUTOR_POLICY_NAMESPACES = {
  learning: "learning",
  narrative: "narrative",
  ooc: "narrative.ooc",
  genesis: "narrative.genesis",
} as const;

const SHARED_IDENTITY_STRING_KEYS = [
  "appearance",
  "background",
  "personality",
  "speechStyle",
  "job",
  "universeId",
  "speciesId",
] as const;

const GENESIS_SHARED_KEYS = ["sourceType", "sourceVersion", "snapshotVersion", "origin", "canonKnowledge"] as const;

const SHARED_ROLE_KEYS = ["roleKey", "title", "summary", "responsibilities", "relationshipStance"] as const;

type TutorProjectionMeta = {
  systemPersonaKey?: string;
  systemPersonaRevision?: number;
  isTemplate?: boolean;
  visibility?: string;
  sourcePersonaId?: string;
  sourceVersion?: number;
};

function cloneRecord(value: unknown): UnknownRecord {
  const record = toUnknownRecord(value);
  try {
    return JSON.parse(JSON.stringify(record)) as UnknownRecord;
  } catch {
    return {};
  }
}

function safeText(value: unknown, max = 600) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function projectStringArray(value: unknown, maxItems = 8, maxLength = 180) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function projectSharedRoleIdentity(value: unknown): TutorSharedRoleIdentity {
  const source = cloneRecord(value);
  const role: TutorSharedRoleIdentity = {};
  for (const key of SHARED_ROLE_KEYS) {
    if (key === "responsibilities") {
      const responsibilities = projectStringArray(source[key]);
      if (responsibilities.length) role.responsibilities = responsibilities;
      continue;
    }
    const text = safeText(source[key]);
    if (text) role[key] = text;
  }
  return role;
}

function projectGenesisSnapshot(value: unknown) {
  const source = cloneRecord(value);
  const snapshot: Record<string, unknown> = {};
  for (const key of GENESIS_SHARED_KEYS) {
    if (key === "canonKnowledge") {
      const knowledge = projectStringArray(source[key], 12, 240);
      if (knowledge.length) snapshot[key] = knowledge;
      continue;
    }
    const text = safeText(source[key], 180);
    if (text) snapshot[key] = text;
    else if (Number.isInteger(source[key])) snapshot[key] = source[key];
  }
  return snapshot;
}

export function projectTutorSharedIdentity(data: UnknownRecord | null | undefined): TutorSharedIdentity {
  const source = data || {};
  const shared: TutorSharedIdentity = {
    pid: safeText(source.pid, 160),
    name: safeText(source.name, 180),
  };
  if (source.personaType === "human" || source.personaType === "monster") shared.personaType = source.personaType;
  for (const key of SHARED_IDENTITY_STRING_KEYS) {
    const text = safeText(source[key]);
    if (text) shared[key] = text;
  }
  const policy = cloneRecord(source.tutorsPolicy);
  const narrative = cloneRecord(policy.narrative);
  const genesis = projectGenesisSnapshot(source.narrativeGenesis || narrative.genesis);
  if (Object.keys(genesis).length) shared.genesisSnapshot = genesis;
  return shared;
}

export function projectTutorSharedRoleIdentity(data: UnknownRecord | null | undefined): TutorSharedRoleIdentity {
  const source = data || {};
  const policy = cloneRecord(source.tutorsPolicy);
  const narrative = cloneRecord(policy.narrative);
  return projectSharedRoleIdentity(source.sharedRoleIdentity || narrative.sharedRoleIdentity);
}

export function projectTutorRoleMechanics(data: UnknownRecord | null | undefined): TutorRoleMechanics {
  const source = data || {};
  const policy = cloneRecord(source.tutorsPolicy);
  const learning = cloneRecord(policy.learning);
  const goalBlueprint = cloneRecord(source.tutorGoalBlueprint ?? learning.tutorGoalBlueprint);
  const behaviorAxes = cloneRecord(source.tutorBehaviorAxes ?? learning.tutorBehaviorAxes);
  const mechanics: TutorRoleMechanics = {};
  if (Object.keys(learning).length) mechanics.learningPolicy = learning;
  if (Object.keys(goalBlueprint).length) mechanics.goalBlueprint = goalBlueprint;
  if (Object.keys(behaviorAxes).length) mechanics.behaviorAxes = behaviorAxes;
  return mechanics;
}

/** 서버가 결정한 service context에 따라 shared role과 Tutors 전용 mechanics를 분리한다. */
export function buildTutorServiceProjection(input: {
  data: UnknownRecord | null | undefined;
  service: TutorServiceContext;
}): TutorServiceProjection {
  const sharedIdentity = projectTutorSharedIdentity(input.data);
  const sharedRoleIdentity = projectTutorSharedRoleIdentity(input.data);
  return {
    service: input.service,
    sharedIdentity,
    sharedRoleIdentity,
    tutorRoleMechanics: input.service === "tutors" ? projectTutorRoleMechanics(input.data) : null,
    narrativeProjection: {
      sharedIdentity,
      sharedRoleIdentity,
      mechanicsIncluded: false,
    },
  };
}

/** Play/Tutors 공통 프롬프트에는 shared identity/role만 렌더한다. */
export function renderTutorSharedRolePrompt(projection: TutorServiceProjection) {
  if (!projection.sharedIdentity.pid && !projection.sharedIdentity.name && !Object.keys(projection.sharedRoleIdentity).length) return "";
  return `<공유 서사 역할>\n${JSON.stringify({
    sharedIdentity: projection.sharedIdentity,
    sharedRoleIdentity: projection.sharedRoleIdentity,
  })}\n</공유 서사 역할>`;
}

/**
 * Tutors의 학습 설정과 Narrative/OOC를 서로 다른 namespace로 투영한다.
 * clone/fork는 기존 genesis snapshot을 그대로 복사하며 새 확률 roll을 만들지 않는다.
 */
export function buildTutorServicePolicy(
  data: UnknownRecord | null | undefined,
  meta: TutorProjectionMeta,
): UnknownRecord {
  const source = data || {};
  const policy = cloneRecord(source.tutorsPolicy);
  const learning = cloneRecord(policy.learning);
  const narrative = cloneRecord(policy.narrative);
  const sourceOoc = cloneRecord(narrative.ooc);
  const sourceGenesis = cloneRecord(narrative.genesis);
  const explicitGenesis = cloneRecord(source.narrativeGenesis);

  const goalBlueprint = source.tutorGoalBlueprint ?? learning.tutorGoalBlueprint;
  const behaviorAxes = source.tutorBehaviorAxes ?? learning.tutorBehaviorAxes;
  if (goalBlueprint !== undefined) learning.tutorGoalBlueprint = cloneRecord(goalBlueprint);
  if (behaviorAxes !== undefined) learning.tutorBehaviorAxes = cloneRecord(behaviorAxes);

  const ooc = {
    ...sourceOoc,
    ...(meta.systemPersonaKey
      ? {
          systemPersona: {
            key: meta.systemPersonaKey,
            ...(Number.isInteger(meta.systemPersonaRevision) ? { revision: meta.systemPersonaRevision } : {}),
          },
        }
      : {}),
  };
  const genesis = Object.keys(sourceGenesis).length
    ? sourceGenesis
    : Object.keys(explicitGenesis).length
      ? explicitGenesis
      : {
          sourceType: meta.isTemplate || meta.visibility === "public" ? "authored" : "snapshot",
          rerollOnClone: false,
          ...(meta.sourcePersonaId ? { sourcePersonaId: meta.sourcePersonaId } : {}),
          ...(Number.isInteger(meta.sourceVersion) ? { sourceVersion: meta.sourceVersion } : {}),
        };

  return {
    ...policy,
    [TUTOR_POLICY_NAMESPACES.learning]: learning,
    [TUTOR_POLICY_NAMESPACES.narrative]: { ...narrative, ooc, genesis },
  };
}

export function projectTutorPolicyForPrompt(policy: unknown, service: TutorServiceContext = "tutors"): UnknownRecord {
  if (service !== "tutors") return {};
  const source = cloneRecord(policy);
  const learning = cloneRecord(source.learning);
  const narrative = cloneRecord(source.narrative);
  const ooc = cloneRecord(narrative.ooc);
  const genesis = cloneRecord(narrative.genesis);
  return { ...source, learning, narrative: { ...narrative, ooc, genesis } };
}

export function inheritTutorGenesisSnapshot(source: unknown) {
  const policy = cloneRecord(source);
  const narrative = cloneRecord(policy.narrative);
  const genesis = cloneRecord(narrative.genesis);
  return { ...genesis, sourceType: String(genesis.sourceType || "snapshot"), rerollOnClone: false };
}
