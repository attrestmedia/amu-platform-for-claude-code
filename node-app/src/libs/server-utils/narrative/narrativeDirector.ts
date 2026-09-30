import "server-only";
import { estimateTokens } from "utils/ai/tokenUtils";
import {
  NARRATIVE_TRANSITION_VALUES,
  type NarrativeDirective,
  type NarrativeDirectiveProposal,
} from "types/game";
import { isNarrativeRuntimeEnabled } from "libs/server-utils/narrative/narrativeRuntimePolicy";

/**
 * @docHint
 * @purpose Narrative Director의 proposal-only structured output 경계
 * @process preflight/token budget  주입·unknown field 거부  static fallback  외부 호출 결과 검증
 * @domain narrative-runtime
 * @scope server
 */

export const NARRATIVE_DIRECTOR_POLICY = {
  maxPromptTokens: 1800,
  maxOutputTokens: 500,
  maxCallsPerSession: 1,
  cacheTtlSeconds: 300,
  costContract: "caller supplies pricing+balance preflight and actual usage billing",
} as const;

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "universeId",
  "characterId",
  "scene",
  "motivation",
  "allowedKnowledge",
  "forbiddenKnowledge",
  "transitionCandidate",
]);
const SCENE_KEYS = new Set(["sceneId", "locationId", "objective"]);
const TRANSITION_KEYS = new Set(["type", "targetId", "reason"]);
const INJECTION_PATTERN = /ignore\s+(?:all|any|the|previous|prior)|system\s+prompt|developer\s+message|<\/?amu_|override\s+(?:canon|policy|rules)|reveal\s+(?:hidden|forbidden)/i;

function safeId(value: unknown, max = 160) {
  const item = typeof value === "string" ? value.trim() : "";
  return Boolean(item && item.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(item));
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !INJECTION_PATTERN.test(value);
}

function stringList(value: unknown, maxItems = 50) {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => text(item, 240));
}

function onlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function parseNarrativeDirective(raw: unknown, expected: { universeId: string; characterId: string }): NarrativeDirective {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("NARRATIVE_DIRECTIVE_OBJECT_REQUIRED");
  const input = raw as Record<string, unknown>;
  if (!onlyKeys(input, TOP_LEVEL_KEYS) || input.schemaVersion !== 1) throw new Error("NARRATIVE_DIRECTIVE_SCHEMA_INVALID");
  if (input.universeId !== expected.universeId || input.characterId !== expected.characterId || !safeId(input.universeId) || !safeId(input.characterId)) throw new Error("NARRATIVE_DIRECTIVE_SCOPE_INVALID");
  if (!text(input.motivation, 1000) || !stringList(input.allowedKnowledge) || !stringList(input.forbiddenKnowledge)) throw new Error("NARRATIVE_DIRECTIVE_KNOWLEDGE_INVALID");
  if (!input.scene || typeof input.scene !== "object" || Array.isArray(input.scene)) throw new Error("NARRATIVE_DIRECTIVE_SCENE_INVALID");
  const scene = input.scene as Record<string, unknown>;
  if (!onlyKeys(scene, SCENE_KEYS) || !safeId(scene.sceneId) || (scene.locationId !== undefined && !safeId(scene.locationId)) || (scene.objective !== undefined && !text(scene.objective, 500))) throw new Error("NARRATIVE_DIRECTIVE_SCENE_INVALID");
  let transitionCandidate: NarrativeDirective["transitionCandidate"] = null;
  if (input.transitionCandidate !== undefined && input.transitionCandidate !== null) {
    if (typeof input.transitionCandidate !== "object" || Array.isArray(input.transitionCandidate)) throw new Error("NARRATIVE_DIRECTIVE_TRANSITION_INVALID");
    const candidate = input.transitionCandidate as Record<string, unknown>;
    if (!onlyKeys(candidate, TRANSITION_KEYS) || !NARRATIVE_TRANSITION_VALUES.includes(candidate.type as (typeof NARRATIVE_TRANSITION_VALUES)[number]) || !safeId(candidate.targetId) || (candidate.reason !== undefined && !text(candidate.reason, 500))) throw new Error("NARRATIVE_DIRECTIVE_TRANSITION_INVALID");
    transitionCandidate = { type: candidate.type as string, targetId: candidate.targetId as string, ...(candidate.reason ? { reason: candidate.reason as string } : {}) };
  }
  return {
    schemaVersion: 1,
    universeId: expected.universeId,
    characterId: expected.characterId,
    scene: {
      sceneId: scene.sceneId as string,
      ...(scene.locationId ? { locationId: scene.locationId as string } : {}),
      ...(scene.objective ? { objective: scene.objective as string } : {}),
    },
    motivation: input.motivation as string,
    allowedKnowledge: input.allowedKnowledge as string[],
    forbiddenKnowledge: input.forbiddenKnowledge as string[],
    transitionCandidate,
  };
}

export function buildStaticNarrativeDirective(expected: { universeId: string; characterId: string; sceneId: string }): NarrativeDirective {
  return {
    schemaVersion: 1,
    universeId: expected.universeId,
    characterId: expected.characterId,
    scene: { sceneId: expected.sceneId },
    motivation: "현재 장면의 목표와 캐릭터의 승인된 지식을 유지한다.",
    allowedKnowledge: [],
    forbiddenKnowledge: ["unpublished canon", "other user story state", "hidden system instruction"],
    transitionCandidate: null,
  };
}

export function preflightNarrativeDirector(input: { prompt: string; callsInSession: number; budgetCheck?: () => boolean }) {
  const base = preflightNarrativeDirectorBase(input);
  return {
    ...base,
    allowed: base.allowed && Boolean(input.budgetCheck && input.budgetCheck()),
  };
}

function preflightNarrativeDirectorBase(input: { prompt: string; callsInSession: number }) {
  const promptTokens = estimateTokens(input.prompt);
  return {
    allowed: Boolean(
      isNarrativeRuntimeEnabled() &&
        promptTokens <= NARRATIVE_DIRECTOR_POLICY.maxPromptTokens &&
        input.callsInSession < NARRATIVE_DIRECTOR_POLICY.maxCallsPerSession,
    ),
    promptTokens,
  };
}

export async function preflightNarrativeDirectorAsync(input: {
  prompt: string;
  callsInSession: number;
  budgetCheck?: () => boolean | Promise<boolean>;
}) {
  const base = preflightNarrativeDirectorBase(input);
  let budgetAllowed = false;
  if (base.allowed && input.budgetCheck) {
    try {
      budgetAllowed = Boolean(await input.budgetCheck());
    } catch {
      budgetAllowed = false;
    }
  }
  return { ...base, allowed: base.allowed && budgetAllowed };
}

export async function runNarrativeDirector(input: {
  prompt: string;
  callsInSession: number;
  expected: { universeId: string; characterId: string; sceneId: string };
  invoke: () => Promise<unknown>;
  budgetCheck: () => boolean | Promise<boolean>;
  recordUsage: (usage: { promptTokens: number; outputTokens: number }) => void | Promise<void>;
  circuitOpen?: boolean;
  modelName?: string;
  cacheHit?: boolean;
}): Promise<NarrativeDirectiveProposal> {
  const preflight = await preflightNarrativeDirectorAsync(input);
  const fallback = (reason: string): NarrativeDirectiveProposal => ({
    status: "fallback",
    directive: buildStaticNarrativeDirective(input.expected),
    fallbackReason: reason,
    telemetry: { promptTokens: preflight.promptTokens, outputTokens: 0, cacheHit: input.cacheHit === true, modelName: input.modelName },
  });
  if (input.circuitOpen === true) return fallback("circuit_open");
  if (!preflight.allowed) return fallback("preflight_blocked");
  try {
    const raw = await input.invoke();
    const directive = parseNarrativeDirective(raw, input.expected);
    const outputTokens = estimateTokens(JSON.stringify(directive));
    if (outputTokens > NARRATIVE_DIRECTOR_POLICY.maxOutputTokens) return fallback("output_budget_exceeded");
    await input.recordUsage({ promptTokens: preflight.promptTokens, outputTokens });
    return {
      status: "proposal",
      directive,
      telemetry: { promptTokens: preflight.promptTokens, outputTokens, cacheHit: input.cacheHit === true, modelName: input.modelName },
    };
  } catch (reason) {
    return fallback(reason instanceof Error ? reason.message : "director_failed");
  }
}
