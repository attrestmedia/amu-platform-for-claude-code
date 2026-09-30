import { createHash } from "node:crypto";
import { CANON_REFERENCE_ENTITY_TYPE_VALUES, PERSONAL_CANON_RELATION_TYPE_VALUES, PERSONAL_CHARACTER_JOIN_REASON_LIMIT } from "types/game";
import type { CanonReferenceEntityType, PersonalCanonRelationType, PersonalCharacterJoinProposal } from "types/game";

/**
 * @docHint
 * @purpose 두 번째 이후 사용자 캐릭터의 Personal Universe 합류 proposal 계약
 * @process 연결 대상 검증  사용자 입력 정규화  결정적 proposal  Canon character/relation payload 생성
 * @domain narrative-canon.personal-universe
 * @scope server
 */

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isReferenceEntityType(value: unknown): value is CanonReferenceEntityType {
  return typeof value === "string" && CANON_REFERENCE_ENTITY_TYPE_VALUES.includes(value as CanonReferenceEntityType);
}

function isRelationType(value: unknown): value is PersonalCanonRelationType {
  return typeof value === "string" && PERSONAL_CANON_RELATION_TYPE_VALUES.includes(value as PersonalCanonRelationType);
}

export function buildPersonalCharacterJoinProposal(input: {
  ownerUid: string;
  characterId: string;
  characterName: string;
  targetRefType: unknown;
  targetRefId: string;
  relationType: unknown;
  reason: string;
  targetExists: boolean;
}): PersonalCharacterJoinProposal | null {
  const ownerUid = text(input.ownerUid);
  const characterId = text(input.characterId);
  const characterName = text(input.characterName, 80);
  const targetRefType = input.targetRefType;
  const targetRefId = text(input.targetRefId);
  const relationType = input.relationType;
  const reason = text(input.reason, PERSONAL_CHARACTER_JOIN_REASON_LIMIT);
  if (
    !ownerUid ||
    !characterId ||
    !characterName ||
    !isReferenceEntityType(targetRefType) ||
    !targetRefId ||
    targetRefId === characterId ||
    !isRelationType(relationType) ||
    !reason ||
    !input.targetExists
  ) return null;

  const relationEntityId = `join:${characterId}:${targetRefType}:${targetRefId}:${relationType}`;
  const identity = `${ownerUid}|${characterId}|${characterName}|${targetRefType}|${targetRefId}|${relationType}|${reason}`;
  const proposalId = `join_${createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 32)}`;
  return {
    proposalId,
    status: "proposal",
    ownerUid,
    characterId,
    characterName,
    targetRefType,
    targetRefId,
    relationType,
    reason,
    characterPayload: {
      title: characterName,
      characterId,
    },
    relationEntityId,
    relationPayload: {
      title: `${characterName} · ${relationType}`,
      summary: reason,
      sourceCharacterId: characterId,
      targetRefType,
      targetRefId,
      relationTypes: [relationType],
    },
  };
}
