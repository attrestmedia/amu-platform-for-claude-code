import type { CanonPayload, CanonReferenceEntityType } from "./narrative-canon";

export const PERSONAL_CANON_RELATION_TYPE_VALUES = [
  "ally",
  "friend",
  "rival",
  "mentor",
  "family",
  "guardian",
  "acquaintance",
] as const;
export type PersonalCanonRelationType = (typeof PERSONAL_CANON_RELATION_TYPE_VALUES)[number];

export const PERSONAL_CHARACTER_JOIN_REASON_LIMIT = 240;

export interface PersonalCharacterJoinProposal {
  proposalId: string;
  status: "proposal";
  ownerUid: string;
  characterId: string;
  characterName: string;
  targetRefType: CanonReferenceEntityType;
  targetRefId: string;
  relationType: PersonalCanonRelationType;
  reason: string;
  characterPayload: CanonPayload;
  relationEntityId: string;
  relationPayload: CanonPayload;
}
