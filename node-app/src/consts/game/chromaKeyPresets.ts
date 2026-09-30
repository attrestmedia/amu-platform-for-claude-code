/**
 * ChromaKey v2 — 품질 정책·프로필·기본값·fallback 매핑
 *
 * 정본: 설계 SSOT §4.2~§4.4, CK-D2~CK-D5
 * CK-Q1 기본값(18/22/0.8/0.5/0.75)은 시작 후보이며 fixture calibration(CK-002)에서 확정된다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global
 */

import {
  FALLBACK_ELIGIBLE_REASONS,
  FALLBACK_FORBIDDEN_REASONS,
  type ChromaKeyCoverageModeType,
  type ChromaKeyOptionsType,
  type ChromaKeyProfileType,
  type FallbackEligibleReasonType,
  type FallbackForbiddenReasonType,
  type EngineModeType,
  type EngineModeConfigType,
  type CanaryTargetType,
} from "types/game/chroma-key";

// CK-100: 핵심 상수는 chromaKey.ts에서 import, 하위 호환을 위해 re-export
import {
  CHROMA_KEY_GREEN,
  CHROMA_KEY_BLUE,
  CHROMA_KEY_MAGENTA,
  CHROMA_KEY_COLOR_PRESETS,
  CHROMA_KEY_ASSET_PROFILE_DEFAULTS,
  CHROMA_KEY_GLOBAL_DEFAULTS,
  type ChromaKeyColorPresetType,
  type ChromaKeyProfileDefaultsType,
} from "./chromaKey";

export {
  CHROMA_KEY_GREEN,
  CHROMA_KEY_BLUE,
  CHROMA_KEY_MAGENTA,
  CHROMA_KEY_COLOR_PRESETS,
  CHROMA_KEY_ASSET_PROFILE_DEFAULTS,
  CHROMA_KEY_GLOBAL_DEFAULTS,
  type ChromaKeyColorPresetType,
  type ChromaKeyProfileDefaultsType,
};

// ---------------------------------------------------------------------------
// 엔진 버전
// ---------------------------------------------------------------------------

/** v2 엔진 식별자 — 결과 meta에 기록, 호환 판정 기준 */
export const CHROMA_KEY_ENGINE_VERSION = "v2.0.0" as const;

// ---------------------------------------------------------------------------
// 품질 게이트 정책 (설계 §4.3)
// ---------------------------------------------------------------------------

export const CHROMA_KEY_QUALITY_POLICY = {
  /** keyConfidence 최소값 — 미만이면 low_key_confidence fallback */
  keyConfidenceMin: 0.6,

  /** edgeSpillRatio 최대값 — 초과 시 edge_spill_exceeded fallback */
  edgeSpillRatioMax: 0.15,

  /** transparentRatio — 결과가 너무 투명하면 emptyOutput 판정 */
  emptyTransparentThreshold: 0.99,

  /** opaquePixelRatio 최소값 — 미만이면 emptyOutput */
  emptyOpaqueThreshold: 0.005,

  /** borderOpaqueRatio — border touch 판정 기준 */
  borderOpaqueTouchThreshold: 0.02,
} as const;

// ---------------------------------------------------------------------------
// 하위 호환 별칭 — 기존 코드가 참조하는 export 이름 유지
// ---------------------------------------------------------------------------

/** @deprecated Use CHROMA_KEY_COLOR_PRESETS from chromaKey.ts */
export const CHROMA_KEY_PRESET_COLORS = CHROMA_KEY_COLOR_PRESETS;

/** @deprecated Use CHROMA_KEY_ASSET_PROFILE_DEFAULTS from chromaKey.ts */
export const CHROMA_KEY_PROFILE_DEFAULTS = CHROMA_KEY_ASSET_PROFILE_DEFAULTS;

/** @deprecated Use CHROMA_KEY_GLOBAL_DEFAULTS from chromaKey.ts */
export const CHROMA_KEY_DEFAULT_OPTIONS: Omit<ChromaKeyOptionsType, "keyMode" | "keyColor" | "profile"> = CHROMA_KEY_GLOBAL_DEFAULTS;

// ---------------------------------------------------------------------------
// 필드 범위 (검증용)
// ---------------------------------------------------------------------------

export const CHROMA_KEY_FIELD_RANGES = {
  similarity: { min: 0, max: 100 },
  softness: { min: 0, max: 100 },
  feather: { min: 0, max: 10 },
  choke: { min: -10, max: 10 },
  despill: { min: 0, max: 1 },
} as const;

// ---------------------------------------------------------------------------
// Fallback 분류 매핑
// ---------------------------------------------------------------------------

export function isFallbackEligible(reason: string): reason is FallbackEligibleReasonType {
  return (FALLBACK_ELIGIBLE_REASONS as readonly string[]).includes(reason);
}

export function isFallbackForbidden(reason: string): reason is FallbackForbiddenReasonType {
  return (FALLBACK_FORBIDDEN_REASONS as readonly string[]).includes(reason);
}

/** forbidden fallback — 유료 API 호출 금지, fail-closed */
export function isFallbackForbiddenReason(reason: string): boolean {
  return (FALLBACK_FORBIDDEN_REASONS as readonly string[]).includes(reason);
}

// ---------------------------------------------------------------------------
// 프로필별 coverage mode
// ---------------------------------------------------------------------------

export function resolveCoverageMode(profile: ChromaKeyProfileType): ChromaKeyCoverageModeType {
  return profile === "sprite-sheet" || profile === "character-bible" ? "global" : "border-connected";
}

// ---------------------------------------------------------------------------
// 프로필에서 cropTransparent 가능 여부
// ---------------------------------------------------------------------------

export function canCropTransparent(profile: ChromaKeyProfileType): boolean {
  return profile === "single-character";
}

// ---------------------------------------------------------------------------
// Engine mode config (CK-003)
// ---------------------------------------------------------------------------

/** 기본 engine mode — 환경 변수나 DB에서 override 가능 */
export const ENGINE_MODE_DEFAULT: EngineModeType = "legacy";

/** 모드별 동작 계약 */
export const ENGINE_MODE_CONFIGS: Record<EngineModeType, EngineModeConfigType> = {
  legacy: {
    primaryEngine: "legacy",
    computeV2Shadow: false,
    storeV2Result: false,
    includeV2Meta: false,
    responseEngine: "legacy",
  },
  shadow: {
    primaryEngine: "legacy",
    computeV2Shadow: true,
    storeV2Result: false,
    includeV2Meta: true,
    responseEngine: "legacy",
  },
  canary: {
    primaryEngine: "v2",
    computeV2Shadow: false,
    storeV2Result: true,
    includeV2Meta: true,
    responseEngine: "v2",
    canary: { uidAllowlist: [], pipelineAllowlist: [] },
  },
  enabled: {
    primaryEngine: "v2",
    computeV2Shadow: false,
    storeV2Result: true,
    includeV2Meta: true,
    responseEngine: "v2",
  },
} as const;

/**
 * canary 모드에서 특정 사용자/파이프라인이 v2 대상인지 판정.
 * allowlist가 비어 있으면 모든 요청이 v2 대상이다 (canary→enabled 전환 시 사용).
 */
export function isCanaryTarget(
  uid: string,
  pipelineId: string | undefined,
  canary: CanaryTargetType,
): boolean {
  const { uidAllowlist, pipelineAllowlist } = canary;
  if (uidAllowlist && uidAllowlist.length > 0 && !uidAllowlist.includes(uid)) return false;
  if (pipelineAllowlist && pipelineAllowlist.length > 0 && pipelineId && !pipelineAllowlist.includes(pipelineId)) return false;
  return true;
}

/** 허용된 mode 전이인지 검증 — 더 제한적인 모드로만 전환 가능 */
const ALLOWED_MODE_TRANSITIONS: Record<EngineModeType, EngineModeType[]> = {
  legacy: ["shadow"],
  shadow: ["legacy", "canary"],
  canary: ["shadow", "enabled"],
  enabled: ["canary"],
};

export function isValidModeTransition(from: EngineModeType, to: EngineModeType): boolean {
  return (ALLOWED_MODE_TRANSITIONS[from] as readonly EngineModeType[]).includes(to);
}

/** rollback — shadow/canary/enabled → legacy 즉시 복귀 */
export function resolveRollbackTarget(from: EngineModeType): EngineModeType {
  if (from === "legacy") return "legacy";
  if (from === "shadow") return "legacy";
  return "shadow"; // canary/enabled → shadow (안전망 유지)
}

