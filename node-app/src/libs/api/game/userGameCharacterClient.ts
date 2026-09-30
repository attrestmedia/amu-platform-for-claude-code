import fetchClient from "libs/api/fetchClient";
import type {
  IGameAssetPipelineDoc,
  CharacterBibleCandidateType,
  CharacterBibleSymmetryType,
  SpriteDirectionPricingQuoteType,
  IUserGameCharacterDoc,
  IUserGameCharacterReportResult,
  IUserGameCharacterSelectableDoc,
  UserGameCharacterReportReasonType,
  UserGameCharacterSourceType,
  ICharacterGenerationRollDoc,
  ICharacterGenesisProfileDoc,
} from "types/game";
import type { CharacterSpeciesId } from "consts/game/characterGenesisPolicy";
import type { CanonReferenceEntityType, IPersonalUniverseCanonRevisionDoc, IPersonalUniverseDoc, PersonalCharacterJoinProposal, WorldSeedProposal } from "types/game";

export type UserGameCharacterPipelineStateType = {
  character: IUserGameCharacterDoc;
  pipeline: IGameAssetPipelineDoc | null;
  nextStep: string | null;
  nextStepMayCharge: boolean;
  directionQuote: SpriteDirectionPricingQuoteType | null;
  anchorUrl: string;
  bibleRequired: boolean;
  bibleCandidate: CharacterBibleCandidateType | null;
  bibleUrl: string;
  bibleConfirmed: boolean;
  canConfirmBible: boolean;
  sheetUrl: string;
  canConfirm: boolean;
};

export type CharacterGenesisOptionsType = {
  universeId: string;
  rulesetVersion: number;
  species: Array<{
    id: CharacterSpeciesId;
    label: { ko: string; en: string };
    description: { ko: string; en: string };
  }>;
  attributes: Array<{ id: string; i18nKey: string; displayName: string; description: string }>;
  rarityDisclosure: Array<{ tier: string; weight: number; probability: number }>;
};

export type UserGameCharacterCreationResult = {
  character: IUserGameCharacterDoc;
  created: boolean;
  genesis?: {
    profile: ICharacterGenesisProfileDoc | null;
    progress: unknown;
    roll: ICharacterGenerationRollDoc | null;
  };
};

export type WorldSeedProposalResult = {
  proposal: WorldSeedProposal;
  canApprove: boolean;
  persisted: false;
};

export type WorldSeedApprovalResult = {
  proposal: WorldSeedProposal;
  persisted: true;
  universe: IPersonalUniverseDoc;
  revision: IPersonalUniverseCanonRevisionDoc;
  character: IUserGameCharacterDoc | null;
};

export type PersonalCharacterJoinTarget = {
  targetRefType: CanonReferenceEntityType;
  targetRefId: string;
  title: string;
  summary: string;
};

export type PersonalCharacterJoinContext = {
  character: IUserGameCharacterDoc;
  universe: IPersonalUniverseDoc | null;
  mode: "world-seed" | "join" | "already-joined";
  targets: PersonalCharacterJoinTarget[];
};

export type PersonalCharacterJoinProposalResult = {
  proposal: PersonalCharacterJoinProposal;
  persisted: false;
};

export type PersonalCharacterJoinApprovalResult = {
  proposal: PersonalCharacterJoinProposal;
  persisted: true;
  universe: IPersonalUniverseDoc;
  character: IUserGameCharacterDoc | null;
  characterRevision: IPersonalUniverseCanonRevisionDoc;
  relationRevision: IPersonalUniverseCanonRevisionDoc;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
};

const BASE = "/game/characters";

export async function listMyGameCharacters(params: { universeId: string; limit?: number }) {
  const response = await fetchClient.get<ApiEnvelope<IUserGameCharacterDoc[]>>(BASE, {
    params,
    responseType: "auto",
    cache: "no-store",
  });
  return response.data?.data || [];
}

export async function listMySelectableGameCharacters(params: {
  universeId: string;
  limit?: number;
}) {
  const response = await fetchClient.get<
    ApiEnvelope<IUserGameCharacterSelectableDoc[]>
  >(BASE, {
    params: { ...params, view: "selectable" },
    responseType: "auto",
    cache: "no-store",
  });
  return response.data?.data || [];
}

export async function listMyFailedGameCharacterAnchorIds(params: { universeId: string }) {
  const response = await fetchClient.get<ApiEnvelope<string[]>>(BASE, {
    params: { ...params, view: "failed-anchors" },
    responseType: "auto",
    cache: "no-store",
  });
  return response.data?.data || [];
}

export async function createMyGameCharacter(payload: {
  universeId: string;
  name: string;
  sourceType: UserGameCharacterSourceType;
  sourceImageAssetId?: string;
  sourcePersonaId?: string;
  sourceReferenceKitId?: string;
  sourceImageUrl?: string;
  speciesId?: CharacterSpeciesId;
  primaryAttributeId?: string;
  archetypeId?: string;
}) {
  const response = await fetchClient.post<
    ApiEnvelope<UserGameCharacterCreationResult>
  >(BASE, payload, { responseType: "auto" });
  const result = response.data?.data;
  if (!result?.character) throw new Error(response.data?.error || "character_create_failed");
  return result;
}

export async function getMyGameCharacterGenesisOptions(universeId: string) {
  const response = await fetchClient.get<ApiEnvelope<CharacterGenesisOptionsType>>(
    `${BASE}/genesis/options`,
    { params: { universeId }, responseType: "auto", cache: "no-store" },
  );
  return response.data?.data || null;
}

export async function proposeMyWorldSeed(payload: {
  characterId: string;
  worldName?: string;
  premise?: string;
  rules?: string[];
  startingPlace?: string;
  firstEvent?: string;
}) {
  const response = await fetchClient.post<ApiEnvelope<WorldSeedProposalResult>>(
    "/game/personal-universe/world-seed",
    { action: "proposal", ...payload },
    { responseType: "auto" },
  );
  const result = response.data?.data;
  if (!result?.proposal) throw new Error(response.data?.error || "world_seed_proposal_failed");
  return result;
}

export async function approveMyWorldSeed(payload: {
  characterId: string;
  proposalId: string;
  worldName: string;
  premise: string;
  rules: string[];
  startingPlace: string;
  firstEvent: string;
}) {
  const response = await fetchClient.post<ApiEnvelope<WorldSeedApprovalResult>>(
    "/game/personal-universe/world-seed",
    { action: "approve", ...payload },
    { responseType: "auto" },
  );
  const result = response.data?.data;
  if (!result?.universe || !result.revision) throw new Error(response.data?.error || "world_seed_approval_failed");
  return result;
}

export async function getMyPersonalCharacterJoinContext(characterId: string) {
  const response = await fetchClient.get<ApiEnvelope<PersonalCharacterJoinContext>>(
    "/game/personal-universe/join",
    { params: { characterId }, responseType: "auto", cache: "no-store" },
  );
  const result = response.data?.data;
  if (!result) throw new Error(response.data?.error || "personal_character_join_context_failed");
  return result;
}

export async function proposeMyPersonalCharacterJoin(payload: {
  characterId: string;
  targetRefType: CanonReferenceEntityType;
  targetRefId: string;
  relationType: string;
  reason: string;
}) {
  const response = await fetchClient.post<ApiEnvelope<PersonalCharacterJoinProposalResult>>(
    "/game/personal-universe/join",
    { action: "proposal", ...payload },
    { responseType: "auto" },
  );
  const result = response.data?.data;
  if (!result?.proposal) throw new Error(response.data?.error || "personal_character_join_proposal_failed");
  return result;
}

export async function approveMyPersonalCharacterJoin(payload: {
  characterId: string;
  proposalId: string;
  targetRefType: CanonReferenceEntityType;
  targetRefId: string;
  relationType: string;
  reason: string;
}) {
  const response = await fetchClient.post<ApiEnvelope<PersonalCharacterJoinApprovalResult>>(
    "/game/personal-universe/join",
    { action: "approve", ...payload },
    { responseType: "auto" },
  );
  const result = response.data?.data;
  if (!result?.universe || !result.relationRevision) throw new Error(response.data?.error || "personal_character_join_approval_failed");
  return result;
}

export async function getMyGameCharacterPipeline(characterId: string) {
  const response = await fetchClient.get<ApiEnvelope<UserGameCharacterPipelineStateType>>(
    `${BASE}/${encodeURIComponent(characterId)}/pipeline`,
    { responseType: "auto", cache: "no-store" },
  );
  const state = response.data?.data;
  if (!state) throw new Error(response.data?.error || "character_pipeline_get_failed");
  return state;
}

export async function runMyGameCharacterPipelineAction(
  characterId: string,
  action:
    | "prepare"
    | "advance"
    | "regenerate-direction"
    | "mirror-direction"
    | "confirm-bible"
    | "confirm"
    | "restart",
  options?: {
    recordFailedAnchor?: boolean;
    abandonCharacter?: boolean;
    symmetry?: CharacterBibleSymmetryType;
    direction?: string;
    mirrorConfirmed?: boolean;
  },
) {
  const response = await fetchClient.post<ApiEnvelope<UserGameCharacterPipelineStateType>>(
    `${BASE}/${encodeURIComponent(characterId)}/pipeline`,
    { action, ...options },
    { responseType: "auto", timeout: 180_000 },
  );
  const state = response.data?.data;
  if (!state) throw new Error(response.data?.error || "character_pipeline_action_failed");
  return state;
}

export async function reportMyGameCharacter(
  characterId: string,
  payload: { reason: UserGameCharacterReportReasonType; note?: string },
) {
  const response = await fetchClient.post<ApiEnvelope<IUserGameCharacterReportResult>>(
    `${BASE}/${encodeURIComponent(characterId)}/report`,
    payload,
    { responseType: "auto" },
  );
  const result = response.data?.data;
  if (!result?.character) throw new Error(response.data?.error || "character_report_failed");
  return result;
}
