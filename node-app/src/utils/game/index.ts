export { SpatialGrid } from "./SpatialGrid";
export { generateBehaviorParams } from "./npcBehaviorUtils";
export { calculateAnimationYOffset, calculateDirection, calculateDirection8, calculateDirectionToTarget, getOppositeDirection } from "./animationUtils";
export { clampCameraAxis, getSoftLockCameraTarget, isPointOutsideCameraViewport } from "./cameraUtils";

export {
  getDisplayName,
  hasNickname,
  enrichPersonas,
  createCharacterNameContainer,
  resolveCharacterData,
} from "./characterDisplayUtils";

export {
  isColliding,
  isBlockOverlappingRoad,
  isCollidingWithBuffer,
  isCollidingWithRole,
  getPenetrationMTV,
  safeCheckCollision,
} from "./collisionUtils";

export {
  mergeNpcSlotWithPersona,
  getNpcDisplayName,
  getProfileFrames,
  isProfileAnimated,
  resolveNpcIdentity,
  getPersonaMode,
} from "./npcDataHelper";

export {
  SPRITE_DIRECTIONS,
  SPRITE_DIRECTIONS_8,
  hasSpriteSheet,
  isControllableSprite,
  isControllablePersona,
  getSpriteAnimation,
  getSpriteAnimationRow,
  getSpriteAnimationFrames,
  getSpriteFrameColumn,
  getSpriteFrameRow,
  getSpriteSequenceIndexByTick,
  isSpriteAnimated,
  getSpritePreviewStyle,
  getSpriteIdleDirection,
  normalizeSpriteDirection,
} from "./spriteSheetUtils";

export { resolveIsCommerce, getSpriteRatio, calculateSpriteSize } from "./helperUtils";

export {
  EMPTY_PLAY_ONBOARDING_PROGRESS,
  advancePlayOnboarding,
  getPlayOnboardingStorageKey,
  normalizePlayOnboardingProgress,
  readPlayOnboardingProgress,
  resetPlayOnboardingProgress,
  writePlayOnboardingProgress,
  type PlayOnboardingProgress,
  type PlayOnboardingStep,
} from "./playOnboarding";

export {
  getCameraViewport,
  isWorldRectInViewport,
  isWorldRectInCameraViewport,
  screenToWorld,
  worldToScreen,
  findWorldObjectsInRadius,
  pickWorldObjectsAtScreenPoint,
  isPointInsideTrigger,
  findWorldTriggersAtPoint,
} from "./worldUtils";

export {
  IsometricMathError,
  assertNormalizedAnchor,
  assertGridFootprint,
  quantizeGridPoint,
  gridToScreen,
  screenToGrid,
  gridToLogicalWorld,
  logicalWorldToGrid,
  worldBounds,
  isoGridToScreen,
  type GridToScreenOptions,
  type ScreenToGridOptions,
  type WorldBoundsOptions,
  type IsometricMathErrorCode,
} from "./isometricMath";

export {
  ISO_BACKGROUND_Z_INDEX,
  resolveIsometricLayer,
  createIsometricRenderPlacement,
  compareIsometricDepth,
  assignStableIsometricZ,
  getIsometricSpriteSize,
  getIsometricStageDiamond,
  type CreateIsometricRenderPlacementInput,
  type IsometricDepthEntry,
  type IsometricDepthAssignment,
} from "./isometricRender";

export {
  CHARACTER_FOOTPRINT_TILES,
  NPC_INTERACTION_DISTANCE_TILES,
  resolveIsometricMovementRuntime,
  directionToScreenVector,
  screenVectorToDirection,
  screenVectorToLogicalDelta,
  projectLogicalPosition,
  createLogicalEntityRect,
  createLogicalObstacleRect,
  resolveSweptLogicalMovement,
  logicalDistanceInTiles,
  createCharacterDepthKey,
  type LogicalMovementResult,
} from "./isometricMovement";

export {
  resolveIsometricViewportRuntime,
  resolveIsometricViewportRuntimeFromDoc,
  getIsometricCameraConstraints,
  clampIsometricCameraPosition,
  viewportPointToStageScreen,
  getIsometricViewportGridBounds,
  isIsometricGridFootprintVisible,
  pickIsometricTargetAtViewportPoint,
  createIsometricMinimapTransform,
  projectStageScreenPointToMinimap,
  projectGridPointToMinimap,
  projectCameraViewportToMinimap,
  type IsometricViewportRuntime,
  type CameraViewportLike,
  type IsometricGridViewportBounds,
  type IsometricCullFootprint,
  type IsometricPickObject,
  type IsometricPickResult,
  type IsometricMinimapTransform,
} from "./isometricViewport";

export {
  resolveIsometricEditorRuntime,
  createIsometricEditorTransform,
  zoomIsometricEditorTransform,
  panIsometricEditorTransform,
  stageScreenToEditorCanvas,
  editorCanvasToStageScreen,
  pickIsometricEditorCell,
  getIsometricEditorCellPolygon,
  listFootprintCells,
  buildEditorTileOccupancy,
  resolveEditorGhostPlacement,
  validateStageAssetProjectionMeta,
  type IsometricEditorRuntime,
  type IsometricEditorTransform,
  type EditorTileOccupancy,
  type EditorGhostPlacement,
  type EditorProjectionMetaIssue,
  type EditorProjectionMetaValidation,
} from "./isometricEditor";

export {
  STAGE_AUTHORING_LAYERS,
  STAGE_BRUSH_RADII,
  applyStageMapPaint,
  doStageAuthoringLayersConflict,
  listStageBrushCells,
  listStageRectangleCells,
  resolveStageAssetAuthoringLayer,
  resolveStageTileAuthoringLayer,
  type StageAuthoringLayerType,
  type StageMapPaintResult,
  type StageMapPaintToolType,
} from "./stageMapPainting";

export {
  STAGE_COORDINATE_CONTRACT_VERSION,
  STAGE_MAP_LIMITS,
  DEFAULT_STAGE_PROJECTION_CONFIG_V2,
  isStageCoordinateV2RuntimeReady,
  validateStageCoordinateV2,
  resolveStageCoordinateRead,
  prepareStageCoordinateV2Write,
  hasStageCoordinateWrite,
  validateStageCoordinateWrite,
  type StageCoordinateContractIssue,
  type StageCoordinateContractValidation,
  type StageCoordinateReadResult,
} from "./stageCoordinateContract";

export {
  DEFAULT_STAGE_BROWSER_RELEASE_GATE_POLICY,
  collectStageMediaRefs,
  evaluateStageBrowserReleaseGate,
} from "./stageReleaseContract";

export {
  type BuildStageDataResult,
  type AutoLayoutOptions,
  type IStageLogicalWorldSize,
  STAGE_BOUNDARY_ROLES,
  isStageBoundaryRole,
  hasStageBoundaryRole,
  shouldBlockMovementByRoles,
  resolveIsoConfigForStageDoc,
  resolveStageLogicalWorldSize,
  buildBlockImagesForStageDoc,
  buildStageDataFromDoc,
  buildAutoLayoutForStageDoc,
  buildStageRuntimeFromDoc,
} from "./stageBuilder";

export {
  personaBase,
  isFullPath,
  fromPersona,
  resolveStageAssetPath,
  stageBlockPath,
  getPersonaPortrait,
  getPersonaProfileFramePaths,
} from "./gameImageUtils";

export * from "./pixi";
export { normalizeChromaKeyOptions, validateChromaKeyOptions, serializeOptionsForFingerprint, computeOptionsFingerprint, buildFingerprintPayload } from "./chromaKeyOptions";
export type { ChromaKeyOptionsValidationError } from "./chromaKeyOptions";
export { detectKeyColor } from "./chromaKeyDetect";
export type { KeyDetectInputType, KeyDetectCandidateType, KeyDetectResultType } from "./chromaKeyDetect";
export { applyChromaKeyKernel, rgbToYCbCr } from "./chromaKeyKernel";
export type { ChromaKeyKernelInputType, ChromaKeyKernelStatsType } from "./chromaKeyKernel";
export { applyChromaKeyRefinements } from "./chromaKeyRefine";
export type { ChromaKeyRefineInputType, ChromaKeyRefineStatsType } from "./chromaKeyRefine";
export { analyzeChromaKeyQuality, evaluateChromaKeyQuality } from "./chromaKeyQuality";
export type { QualityVerdictType, QualityEvaluationType } from "./chromaKeyQuality";
export { runChromaKeyPipeline } from "./chromaKeyPipeline";
export type { ChromaKeyPipelineInputType, ChromaKeyPipelineResultType } from "./chromaKeyPipeline";
export { getEngineMode, setEngineMode, setCanaryConfig, getCanaryConfig, getEngineModeConfig, resolveActiveEngine, shouldComputeV2Shadow, shouldStoreV2Result, shouldIncludeV2Meta, rollbackToLegacy, rollbackToShadow, resetEngineMode } from "./engineMode";
export { buildFallbackOperationId } from "./fallbackOperationId";
export {
  ChromaKeyBrowserSession,
  createChromaKeyBrowserSession,
  checkChromaKeyWorkerStatus,
} from "./chromaKeyBrowserAdapter";
export type { ChromaKeyPreviewResult, ChromaKeyWorkerStatus } from "./chromaKeyBrowserAdapter";
export { selectAdaptiveChromaKeyPreset } from "./chromaKeyAdaptivePreset";
export type { AdaptivePresetInputType, AdaptivePresetResultType, AdaptivePresetCandidateType, AdaptivePresetPaletteColorType } from "./chromaKeyAdaptivePreset";

