/**
 * ChromaKey 크로마키 배경 제거 v2 — 공개 계약 (설계 §4)
 *
 * 서버·Worker·파이프라인·DB가 같은 옵션·결과 의미를 공유해 결과 드리프트를 방지한다.
 * 이 파일은 순수 타입만 정의하며, 핵심 상수는 consts/game/chromaKey.ts, 정책은 consts/game/chromaKeyPresets.ts 를 따른다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */
import type { BackgroundRemovalProviderType } from "libs/services/backgroundRemoval/removeBackground";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const CHROMA_KEY_MODES = ["auto", "green", "blue", "magenta", "custom"] as const;
export type ChromaKeyModeType = (typeof CHROMA_KEY_MODES)[number];

export const CHROMA_KEY_COVERAGE_MODES = ["global", "border-connected"] as const;
export type ChromaKeyCoverageModeType = (typeof CHROMA_KEY_COVERAGE_MODES)[number];

export const CHROMA_KEY_PROFILES = [
  "sprite-sheet",
  "character-bible",
  "single-character",
  "tileset/prop/building",
] as const;
export type ChromaKeyProfileType = (typeof CHROMA_KEY_PROFILES)[number];

export type ChromaKeyColorType = {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
};

/**
 * 입력 옵션 — 선택 필드는 자동/프리셋에서 채워진다.
 * 옵션 fingerprint는 optionsFingerprint()로 결정적 직렬화된다.
 */
export type ChromaKeyOptionsType = {
  /** 키 색 결정 모드 */
  keyMode: ChromaKeyModeType;

  /** custom 모드에서만 필수, auto에서 auto-resolved 후 채워짐 */
  keyColor?: ChromaKeyColorType;

  /** Cb·Cr 색차 거리 임계 (0–100, 기본값은 프로필/프리셋) */
  similarity: number;

  /** 알파 그라데이션 범위 (0–100, similarity 이상 softness까지 선형) */
  softness: number;

  /** 마스크 가장자리 feather 반경 px (0–10) */
  feather: number;

  /** 마스크 확장/축소 px (-10…10, 양수=확장) */
  choke: number;

  /** 키 색 방향 스필 제거 강도 (0–1, 0=안함) */
  despill: number;

  /** 배경 영역 판정 모드 */
  coverageMode: ChromaKeyCoverageModeType;

  /** 투명 영역 자동 크롭 허용 (기본 false, single-character 프로필만 opt-in 가능) */
  cropTransparent: boolean;

  /** 프로필 식별자 — 기본값·정책 선택에 사용 */
  profile: ChromaKeyProfileType;
};

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

export type ChromaKeyQualityType = {
  /** 경계 링 지배색의 신뢰도 (0–1) */
  keyConfidence: number;

  /** border ring 내 지배색 비율 */
  borderDominantRatio: number;

  /** 전체 픽셀 중 완전 투명(a=0) 비율 */
  transparentRatio: number;

  /** 전체 픽셀 중 반투명(0<a<255) 비율 */
  semiAlphaRatio: number;

  /** 최외곽 1px 라인에서 불투명 픽셀(a>8) 비율 */
  borderOpaqueRatio: number;

  /** 가장자리 전경 픽셀 중 key 색 스필이 있는 비율 */
  edgeSpillRatio: number;

  /** 전체 픽셀 중 불투명(a≥255) 비율 */
  opaquePixelRatio: number;

  /** 전경이 이미지 경계에 닿는가 */
  foregroundTouchesBorder: boolean;

  /** 전경 손실 위험 — 내부 색이 키 색과 유사해 잘못 제거될 가능성 */
  foregroundLossRisk: boolean;

  /** 출력이 비어 있는가 (유의미한 불투명 픽셀 없음) */
  emptyOutput: boolean;
};

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

/** fallback이 허용되는 이유 — 로컬 엔진 실패 후 유료 AI 호출 가능 */
export const FALLBACK_ELIGIBLE_REASONS = [
  "key_not_detected",
  "low_key_confidence",
  "edge_spill_exceeded",
  "foreground_loss_risk",
  "quality_gate_failed",
] as const;
export type FallbackEligibleReasonType = (typeof FALLBACK_ELIGIBLE_REASONS)[number];

/** fallback이 금지되는 이유 — fail-closed, 유료 API 호출 금지 */
export const FALLBACK_FORBIDDEN_REASONS = [
  "authentication_or_authorization_failed",
  "source_decode_failed",
  "r2_fetch_failed",
  "r2_put_or_head_failed",
  "database_commit_failed",
  "published_asset_locked",
] as const;
export type FallbackForbiddenReasonType = (typeof FALLBACK_FORBIDDEN_REASONS)[number];

/** 통합 fallback 사유 — 성공 시 undefined */
export type FallbackReasonType =
  | FallbackEligibleReasonType
  | FallbackForbiddenReasonType;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type ChromaKeyResultType = {
  /** 엔진 버전 식별자 */
  engineVersion: string;

  /** optionsFingerprint — 정규화된 옵션의 결정적 해시 */
  optionsFingerprint: string;

  /** 입력 이미지 SHA-256 */
  sourceSha256: string;

  /** 출력 이미지 SHA-256 */
  outputSha256: string;

  /** 품질 지표 */
  quality: ChromaKeyQualityType;

  /** fallback 사유 — local success면 undefined */
  fallbackReason?: FallbackReasonType;

  /** 유료 AI fallback에 사용된 provider (있는 경우) */
  fallbackProvider?: BackgroundRemovalProviderType;

  /** 유료 AI fallback에 소비된 코인 */
  fallbackCoins?: number;

  /** 처리 시간 (ms) */
  processingTimeMs: number;

  /** 처리 완료 시각 (ISO 8601) */
  completedAt: string;
};

// ---------------------------------------------------------------------------
// Engine mode & rollout (설계 §8, CK-003)
// ---------------------------------------------------------------------------

/**
 * 엔진 모드 — 전체 사용자 파이프라인을 한 번에 교체하지 않고 점진적 전환.
 *
 * ```text
 * legacy  → 기존 RGB 거리 크로마키 + AI fallback (현재 기본값)
 * shadow  → v2 결과·지표만 계산, 저장/과금/응답은 legacy 그대로
 * canary  → allowlist 사용자만 v2 결과 사용, 나머지는 legacy
 * enabled → 모든 사용자 v2 기본 엔진
 * ```
 */
export const ENGINE_MODES = ["legacy", "shadow", "canary", "enabled"] as const;
export type EngineModeType = (typeof ENGINE_MODES)[number];

/** canary 대상 식별자 */
export type CanaryTargetType = {
  /** uid allowlist (빈 배열 = 모두 허용, canary→enabled 전환 시 사용) */
  uidAllowlist?: string[];
  /** pipelineId allowlist */
  pipelineAllowlist?: string[];
};

/** 모드별 동작 계약 */
export type EngineModeConfigType = {
  /** 실제 결과에 사용할 엔진 */
  primaryEngine: "legacy" | "v2";
  /** v2를 병렬 계산하는가 (shadow 모드) */
  computeV2Shadow: boolean;
  /** v2 결과를 저장하는가 */
  storeV2Result: boolean;
  /** v2 메타를 응답에 포함하는가 */
  includeV2Meta: boolean;
  /** 응답·과금에 사용할 엔진 */
  responseEngine: "legacy" | "v2";
  /** canary 대상 (canary 모드에서만 유효) */
  canary?: CanaryTargetType;
};

/** rollback 방향 — 더 제한적인 모드로만 전환 가능 */
export type RollbackDirectionType = "to-legacy" | "to-shadow";
