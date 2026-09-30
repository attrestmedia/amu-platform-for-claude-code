/**
 * AMU Motion Story — 인터랙티브 아티클 모션 런타임 (프레임워크 중립 코어)
 *
 * 레이어 (의존 방향: 위 → 아래)
 *   gesture          시그니처 인터랙션 제스처 상태 머신 + DOM 바인딩 + 키보드 대체 경로
 *   clock · guards   브라우저 런타임: rAF/마스터 클럭 · reduced-motion · visibility · 단일 active 표면
 *   timeline         리소스 → 표면별 시간표 → 임의 시점 샘플링 (순수)
 *   compiler         Beat → Scene 초안 · readingPace 타이밍 · 표면 초안 (순수, 저작 보조)
 *   contract         interactive-article.v1 리소스 계약 + 엄격 검증
 *   presets · tokens Motion Design System (motion-tokens.v1)
 *
 * React 표면은 `components/module/magazine/story` 에 있다.
 */

export { MOTION_TOKENS, MOTION_TOKENS_VERSION, cubicBezierCss, type MotionTokens } from "./tokens";

export {
  MOTION_PRESETS,
  MOTION_PRESET_KEYS,
  channelsToCss,
  combineChannels,
  getMotionPreset,
  getPresetDurationMs,
  isMotionPresetKey,
  isPresetOfCategory,
  sampleNumberCount,
  samplePreset,
  toWaapiKeyframes,
  type CameraPresetKey,
  type EmphasisPresetKey,
  type EnterPresetKey,
  type ExitPresetKey,
  type MotionChannels,
  type MotionCssStyle,
  type MotionPresetCategory,
  type MotionPresetKey,
  type TransitionPresetKey,
  type WaapiKeyframe,
} from "./presets";

export {
  CLAIM_STATUSES,
  HOME_CARD_TIERS,
  INTERACTIVE_ARTICLE_CONTRACT_TYPE,
  INTERACTIVE_ARTICLE_LIMITS,
  INTERACTIVE_ARTICLE_SCHEMA_VERSION,
  INTERACTIVE_ARTICLE_STATUSES,
  STORY_BEAT_ROLES,
  STORY_SCENE_LAYOUTS,
  STORY_TEXT_REVEALS,
  computeStoryTextHash,
  getSurfaceScenes,
  parseInteractiveArticle,
  type ClaimStatus,
  type DataFigure,
  type HomeCardTier,
  type InteractiveArticleAsset,
  type InteractiveArticleParseResult,
  type InteractiveArticleResource,
  type InteractiveArticleStatus,
  type InteractiveArticleSurfaceKey,
  type InteractiveArticleSurfaces,
  type StoryBeat,
  type StoryBeatRole,
  type StoryScene,
  type StorySceneLayout,
  type StoryTextReveal,
} from "./contract";

export {
  ROLE_PRESENTATION,
  beatLines,
  computeSceneDurationMs,
  countRevealUnits,
  draftScenesFromBeats,
  draftSurfaces,
  readingMsForLine,
  revealStaggerMs,
} from "./compiler";

export {
  buildStoryTimeline,
  findSceneIndex,
  getSceneRestTimeMs,
  resolvePlayback,
  sampleSceneStyles,
  sampleStoryTimeline,
  type BuildTimelineOptions,
  type NarrationCue,
  type PlaybackPosition,
  type SceneStyles,
  type StoryFrame,
  type StoryPhase,
  type StoryTimeline,
  type TimelineLine,
  type TimelineScene,
  type TimelineUnit,
} from "./timeline";

export { createStoryClock, type StoryClock, type StoryClockOptions } from "./clock";

export {
  createActiveSurfaceArbiter,
  getSharedSurfaceArbiter,
  prefersReducedMotion,
  subscribeDocumentHidden,
  subscribeReducedMotion,
  type ActiveSurfaceArbiter,
} from "./guards";

export {
  DECK_KEYMAP,
  DEFAULT_GESTURE_CONFIG,
  GESTURE_IGNORE_SELECTOR,
  INITIAL_GESTURE_STATE,
  STORY_KEYMAP,
  bindGestures,
  nextGestureDeadline,
  reduceGesture,
  toDeckAction,
  toStoryAction,
  type BindGesturesOptions,
  type DeckAction,
  type GestureConfig,
  type GestureEvent,
  type GestureIntent,
  type GestureState,
  type StoryAction,
  type SwipeDirection,
} from "./gesture";
