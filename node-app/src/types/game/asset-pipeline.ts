import type { UnknownRecord } from "utils/common/typeUtils";

// 에셋 생성 파이프라인 v2 (에셋 계약 v2 D2 옵션 B — STEP1~5 다단계 합성)
// 정본 설계: Project/.agent/docs/2026/07/20260717_182846__amu-play-p2-pipeline-integration-design.md

export const GAME_ASSET_PIPELINE_KINDS = ["character-sprite-v2"] as const;
export type GameAssetPipelineKindType = (typeof GAME_ASSET_PIPELINE_KINDS)[number];

export const GAME_ASSET_PIPELINE_STATUSES = [
  "draft",
  "generating",
  "post_processing",
  "verifying",
  "verify_failed",
  "composing",
  "composed",
  "failed",
] as const;
export type GameAssetPipelineStatusType = (typeof GAME_ASSET_PIPELINE_STATUSES)[number];

export const SPRITE_PIPELINE_STEP_KEYS = [
  "step1-bible",
  "step2-base",
  "step2-diagonal",
  "step2-dir",
  "step3-removebg",
  "step4-verify",
  "step5-compose",
] as const;
export type SpritePipelineStepKeyType = (typeof SPRITE_PIPELINE_STEP_KEYS)[number];

export const GAME_ASSET_PIPELINE_STEP_STATUSES = ["pending", "running", "success", "failed"] as const;
export type GameAssetPipelineStepStatusType = (typeof GAME_ASSET_PIPELINE_STEP_STATUSES)[number];

export const GAME_ASSET_PIPELINE_FAILURE_KINDS = ["infrastructure", "pipeline"] as const;
export type GameAssetPipelineFailureKindType = (typeof GAME_ASSET_PIPELINE_FAILURE_KINDS)[number];

export type GameAssetPipelineStepStateType = {
  status: GameAssetPipelineStepStatusType;
  attempt: number;
  resetCount?: number;
  freeRetryEligible?: boolean;
  freeRetryUsed?: boolean;
  jobId?: string;
  assetIds?: string[];
  startedAt?: string | Date;
  completedAt?: string | Date;
  error?: {
    code?: string;
    message?: string;
    kind?: GameAssetPipelineFailureKindType;
    retryable?: boolean;
    attemptConsumed?: boolean;
  };
  meta?: UnknownRecord;
};

export const SPRITE_PIPELINE_DIRECTION_STATUSES = ["pending", "passed", "failed", "regenerating"] as const;
export type SpritePipelineDirectionStatusType = (typeof SPRITE_PIPELINE_DIRECTION_STATUSES)[number];

export type SpritePipelineDirectionVerifyType = {
  emptyCells?: number;
  croppedCells?: number;
  heightVariancePx?: number;
  alphaCoverage?: number;
};

export type SpritePipelineDirectionStateType = {
  status: SpritePipelineDirectionStatusType;
  stripAssetRef?: string;
  stripStorage?: UnknownRecord;
  verify?: SpritePipelineDirectionVerifyType;
  /** CK-202: STEP3 처리 방식 — chroma-key-v2 | chroma-key | <provider> */
  method?: string;
  regen?: {
    attempt: number;
    maxAttempts: number;
    resetCount?: number;
    status: GameAssetPipelineStepStatusType;
    jobId?: string;
    freeRetryEligible?: boolean;
    freeRetryUsed?: boolean;
    error?: {
      code?: string;
      message?: string;
      kind?: GameAssetPipelineFailureKindType;
      retryable?: boolean;
      attemptConsumed?: boolean;
    };
  };
  derivedFrom?: {
    direction: SpriteDirectionType;
    transform: "mirror-x";
  };
};

export const SPRITE_DIRECTIONS = [
  "down",
  "up",
  "left",
  "right",
  "down-left",
  "up-left",
  "up-right",
  "down-right",
] as const;
export type SpriteDirectionType = (typeof SPRITE_DIRECTIONS)[number];

export type SpriteGenerationModeType = "sheet4" | "direction";

export type SpriteDirectionPricingQuoteType = {
  unit: "coin";
  perDirectionCoins: number;
  billingStrategy: "fixed" | "token" | "hybrid";
  provider: string;
  modelName: string;
  size: string;
  source: "system-pricing";
};

export const CHARACTER_BIBLE_DIRECTIONS = ["down", "down-right", "up-left", "up", "left"] as const;
export type CharacterBibleDirectionType = (typeof CHARACTER_BIBLE_DIRECTIONS)[number];

export const CHARACTER_BIBLE_SYMMETRIES = ["symmetric", "asymmetric"] as const;
export type CharacterBibleSymmetryType = (typeof CHARACTER_BIBLE_SYMMETRIES)[number];

export type CharacterBibleCandidateType = {
  assetId: string;
  sha256: string;
  columns: 5;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  directions: CharacterBibleDirectionType[];
  passedDirections: CharacterBibleDirectionType[];
  verify: Partial<Record<CharacterBibleDirectionType, SpritePipelineDirectionVerifyType>>;
  allPassed: boolean;
  /** CK-203: STEP3 처리 방식 — chroma-key-v2 | chroma-key */
  method?: string;
  /** CK-203: v2 크로마키 keyColor (legacy/null when native-alpha) */
  keyColor?: { r: number; g: number; b: number };
  /** CK-203: v2 품질 지표 */
  quality?: {
    transparentRatio?: number;
    edgeSpillRatio?: number;
    opaquePixelRatio?: number;
    keyConfidence?: number;
    verdict?: string;
  };
};

export type CharacterBibleType = Pick<
  CharacterBibleCandidateType,
  "assetId" | "sha256" | "columns" | "cellWidth" | "cellHeight" | "directions"
> & {
  symmetry: CharacterBibleSymmetryType;
  confirmedAt: string | Date;
};

export type GameAssetPipelineAnchorType = {
  imageAssetId?: string;
  sourceUrl?: string;
  sha256?: string;
  bible?: CharacterBibleType;
};

export type GameAssetPipelineBillingJobType = {
  jobId: string;
  step: string;
  coins: number;
};

export type GameAssetPipelineBillingType = {
  totalCoins: number;
  jobs: GameAssetPipelineBillingJobType[];
};

export type GameAssetPipelineResultType = {
  gameAssetId?: string;
  sheetSha256?: string;
  width?: number;
  height?: number;
};

export type GameAssetPipelineAdminResetType = {
  stepKey: SpritePipelineStepKeyType;
  previousAttempt: number;
  reason: string;
  resetBy: string;
  resetAt: string | Date;
};

export interface IGameAssetPipelineDoc {
  pipelineId: string;
  kind: GameAssetPipelineKindType;
  status: GameAssetPipelineStatusType;
  idempotencyKey: string;
  name?: string;
  templateVersion: number;
  anchor: GameAssetPipelineAnchorType;
  variables?: UnknownRecord;
  steps: Record<string, GameAssetPipelineStepStateType>;
  directions: Record<string, SpritePipelineDirectionStateType>;
  result?: GameAssetPipelineResultType;
  billing: GameAssetPipelineBillingType;
  adminResets?: GameAssetPipelineAdminResetType[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
