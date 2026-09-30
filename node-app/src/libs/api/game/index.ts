export { listStages, getStageById, createStage, updateStage, deleteStage } from "./stageAdminClient";
export {
  listGameAssetTemplates,
  seedGameAssetTemplates,
  listGameAssets,
  createGameAsset,
  updateGameAsset,
  publishGameAsset,
} from "./gameAssetAdminClient";
export { uploadGameAssetImage } from "./gameAssetUploadClient";
export {
  createSpritePipeline,
  listSpritePipelines,
  getSpritePipeline,
  runSpritePipelineStep,
  getSpriteDirectionPricingQuote,
} from "./gameAssetPipelineClient";
export {
  getMyPersonalUniverseOverview,
  getMyCrossUniverseGraph,
  postCrossUniverseAction,
  type CrossUniverseGraphData,
  type PersonalUniverseOverviewCharacter,
  type PersonalUniverseOverviewData,
} from "./personalUniverseClient";
export {
  listMyGameCharacters,
  listMySelectableGameCharacters,
  listMyFailedGameCharacterAnchorIds,
  createMyGameCharacter,
  getMyGameCharacterGenesisOptions,
  proposeMyWorldSeed,
  approveMyWorldSeed,
  getMyPersonalCharacterJoinContext,
  proposeMyPersonalCharacterJoin,
  approveMyPersonalCharacterJoin,
  getMyGameCharacterPipeline,
  runMyGameCharacterPipelineAction,
  reportMyGameCharacter,
  type UserGameCharacterPipelineStateType,
  type CharacterGenesisOptionsType,
  type WorldSeedApprovalResult,
  type WorldSeedProposalResult,
  type PersonalCharacterJoinContext,
  type PersonalCharacterJoinProposalResult,
  type PersonalCharacterJoinApprovalResult,
} from "./userGameCharacterClient";
export { listSpriteActions, saveSpriteAction } from "./spriteActionClient";
export {
  listWorldAssets,
  getWorldAssetGenerationQuote,
  createWorldAsset,
  type WorldAssetGenerationQuote,
  type WorldAssetGenerationResult,
} from "./worldAssetClient";

export { applyChromaKey, commitChromaKey } from "./gameAssetChromaKeyClient";
export type {
  ChromaKeyApplyAction,
  ChromaKeyApplyRequest,
  ChromaKeyApplyResponse,
  ChromaKeyCommitRequest,
  ChromaKeyCommitResponse,
} from "./gameAssetChromaKeyClient";
