/**
 * @docHint
 * @purpose 첫 캐릭터 생성 후 World Seed proposal과 소유자 승인 payload 계약
 * @process 사용자 입력 정규화  mechanics 식별  승인 시 personal Canon 저장 입력 구성
 * @domain narrative-canon.personal-universe
 * @scope shared-types
 */

export const WORLD_SEED_RULE_LIMIT = 3;
export const WORLD_SEED_FIELD_LIMITS = {
  worldName: 80,
  premise: 240,
  rule: 140,
  startingPlace: 100,
  firstEvent: 240,
} as const;

export interface WorldSeedPayload {
  title: string;
  worldName: string;
  premise: string;
  rules: string[];
  startingPlace: string;
  firstEvent: string;
  characterId: string;
  rulesetUniverseId: string;
  rulesetVersion: number;
}

export interface WorldSeedProposal extends WorldSeedPayload {
  proposalId: string;
  source: "user-input" | "template";
  createdAt: string;
}
