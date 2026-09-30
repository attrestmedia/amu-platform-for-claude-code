import { createHash } from "node:crypto";
import {
  WORLD_SEED_FIELD_LIMITS,
  WORLD_SEED_RULE_LIMIT,
  type WorldSeedPayload,
  type WorldSeedProposal,
} from "types/game";

/**
 * @docHint
 * @purpose 첫 캐릭터의 World Seed proposal을 결정적으로 구성
 * @process 사용자 입력 정규화  mechanics ruleset 식별  proposal hash 생성
 * @domain narrative-canon.personal-universe
 * @scope server
 */

export type WorldSeedProposalInput = {
  characterId: string;
  characterName: string;
  rulesetUniverseId: string;
  rulesetVersion: number;
  worldName?: string;
  premise?: string;
  rules?: string[];
  startingPlace?: string;
  firstEvent?: string;
};

function text(value: unknown, fallback: string, max: number) {
  const normalized = String(value || "").trim().slice(0, max);
  return normalized || fallback;
}

function id(value: unknown, fallback: string) {
  const normalized = String(value || "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(normalized) ? normalized : fallback;
}

function rules(value: unknown, characterName: string) {
  const input = Array.isArray(value) ? value : [];
  const normalized = input
    .map((item) => String(item || "").trim().slice(0, WORLD_SEED_FIELD_LIMITS.rule))
    .filter(Boolean)
    .slice(0, WORLD_SEED_RULE_LIMIT);
  return normalized.length
    ? normalized
    : [`${characterName}의 선택은 세계의 사건을 바꿀 수 있습니다.`];
}

function proposalId(payload: WorldSeedPayload) {
  return `world_seed_${createHash("sha256").update(`${payload.characterId}|${payload.rulesetUniverseId}|${payload.rulesetVersion}`, "utf8").digest("hex").slice(0, 32)}`;
}

/** 사용자 입력이 없어도 저장하지 않는 preview용 template proposal을 반환한다. */
export function buildWorldSeedProposal(input: WorldSeedProposalInput): WorldSeedProposal {
  const characterId = id(input.characterId, "character");
  const characterName = text(input.characterName, "첫 번째 캐릭터", 40);
  const rulesetUniverseId = id(input.rulesetUniverseId, "the-universe");
  const rulesetVersion = Number.isInteger(input.rulesetVersion) && input.rulesetVersion > 0 ? input.rulesetVersion : 1;
  const worldName = text(input.worldName, `${characterName}의 세계`, WORLD_SEED_FIELD_LIMITS.worldName);
  const premise = text(input.premise, `${characterName}가 처음 맞닥뜨린 사건에서 시작되는 나만의 세계`, WORLD_SEED_FIELD_LIMITS.premise);
  const startingPlace = text(input.startingPlace, "첫 번째 장소", WORLD_SEED_FIELD_LIMITS.startingPlace);
  const firstEvent = text(input.firstEvent, `${characterName}에게 도착한 첫 번째 단서`, WORLD_SEED_FIELD_LIMITS.firstEvent);
  const payload: WorldSeedPayload = {
    title: worldName,
    worldName,
    premise,
    rules: rules(input.rules, characterName),
    startingPlace,
    firstEvent,
    characterId,
    rulesetUniverseId,
    rulesetVersion,
  };
  const hasUserInput = [input.worldName, input.premise, input.rules, input.startingPlace, input.firstEvent]
    .some((value) => (Array.isArray(value) ? value.some(Boolean) : Boolean(String(value || "").trim())));
  return {
    ...payload,
    proposalId: proposalId(payload),
    source: hasUserInput ? "user-input" : "template",
    createdAt: new Date().toISOString(),
  };
}

export function toWorldSeedCanonPayload(proposal: WorldSeedProposal): WorldSeedPayload {
  return {
    title: proposal.title,
    worldName: proposal.worldName,
    premise: proposal.premise,
    rules: proposal.rules,
    startingPlace: proposal.startingPlace,
    firstEvent: proposal.firstEvent,
    characterId: proposal.characterId,
    rulesetUniverseId: proposal.rulesetUniverseId,
    rulesetVersion: proposal.rulesetVersion,
  };
}
