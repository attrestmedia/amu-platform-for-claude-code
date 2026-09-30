/**
 * ChromaKey v2 — 에셋 프로필별 geometry 정책 resolver (CK-302)
 *
 * 스프라이트·타일·건물에 같은 자동 crop을 적용하면 런타임 좌표가 깨지므로,
 * 프로필별로 crop 허용 여부, 치수 보존, 프레임 그리드 보존, 런타임 좌표 보존을 분리한다.
 *
 * 초기 모든 프로필은 cropTransparent=false이며,
 * single-character 프로필만 opt-in으로 cropTransparent=true를 허용한다.
 * 정규화(crop/trim) 요청은 F6 기존 도구로 별도 수행한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import { CHROMA_KEY_PROFILES, type ChromaKeyProfileType } from "types/game/chroma-key";
import { GAME_ASSET_TYPES, type GameAssetType } from "types/game/asset";

// ---------------------------------------------------------------------------
// Geometry 정책 타입
// ---------------------------------------------------------------------------

export type GeometryPolicyType = {
  /** 프로필 식별자 */
  profile: ChromaKeyProfileType;
  /** 투명 영역 자동 크롭 허용 여부 */
  cropAllowed: boolean;
  /** 처리 전후 width/height 동일해야 함 */
  preserveDimensions: boolean;
  /** spriteSheet frameWidth/frameHeight/columns/rows 불변 */
  preserveFrameGrid: boolean;
  /** runtime anchor/footprint/isoHeightPx 불변 */
  preserveRuntimeCoords: boolean;
  /** 이 프로필과 호환되는 asset type 목록 */
  compatibleAssetTypes: readonly GameAssetType[];
};

// ---------------------------------------------------------------------------
// 프로필별 geometry 정책
// ---------------------------------------------------------------------------

export const GEOMETRY_POLICIES: Record<ChromaKeyProfileType, Omit<GeometryPolicyType, "profile">> = {
  "sprite-sheet": {
    cropAllowed: false,
    preserveDimensions: true,
    preserveFrameGrid: true,
    preserveRuntimeCoords: true,
    compatibleAssetTypes: ["character-sprite", "motion-guide"] as const,
  },
  "character-bible": {
    cropAllowed: false,
    preserveDimensions: true,
    preserveFrameGrid: true,
    preserveRuntimeCoords: true,
    compatibleAssetTypes: ["character-sprite"] as const,
  },
  "single-character": {
    cropAllowed: true,
    preserveDimensions: false,
    preserveFrameGrid: false,
    preserveRuntimeCoords: true,
    compatibleAssetTypes: [
      "character-sprite",
      "npc-portrait",
      "tile",
      "object",
    ] as const,
  },
  "tileset/prop/building": {
    cropAllowed: false,
    preserveDimensions: true,
    preserveFrameGrid: true,
    preserveRuntimeCoords: true,
    compatibleAssetTypes: [
      "stage-tileset",
      "prop-sheet",
      "building-sheet",
      "tile",
      "object",
    ] as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Resolver API
// ---------------------------------------------------------------------------

/** 프로필에 대한 full geometry policy 반환 */
export function resolveProfilePolicy(profile: ChromaKeyProfileType): GeometryPolicyType {
  const policy = GEOMETRY_POLICIES[profile];
  if (!policy) {
    throw new Error(`unknown_chroma_key_profile: ${profile}`);
  }
  return { profile, ...policy };
}

/** 프로필 리스트 유효성 검사 */
export function isValidChromaKeyProfile(value: string): value is ChromaKeyProfileType {
  return (CHROMA_KEY_PROFILES as readonly string[]).includes(value);
}

/** asset type 리스트 유효성 검사 */
export function isValidGameAssetType(value: string): value is GameAssetType {
  return (GAME_ASSET_TYPES as readonly string[]).includes(value);
}

/**
 * asset type과 chroma key profile의 호환성 검증.
 * 호환되지 않으면 오류 메시지를 반환하고, 호환되면 null을 반환한다.
 */
export function validateProfileAssetCompatibility(
  profile: ChromaKeyProfileType,
  assetType: GameAssetType,
): string | null {
  const policy = GEOMETRY_POLICIES[profile];
  if (!policy) return `unknown profile: ${profile}`;

  if (!(policy.compatibleAssetTypes as readonly string[]).includes(assetType)) {
    return `profile "${profile}" is not compatible with asset type "${assetType}". compatible: [${policy.compatibleAssetTypes.join(", ")}]`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geometry 검증 도구
// ---------------------------------------------------------------------------

export type GeometryValidationInputType = {
  profile: ChromaKeyProfileType;
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  cropTransparent: boolean;
  assetType?: GameAssetType;
  spriteSheet?: {
    frameWidth?: number;
    frameHeight?: number;
    columns?: number;
    rows?: number;
  };
  runtime?: {
    anchor?: { x?: number; y?: number };
    footprint?: { width?: number; height?: number };
    isoHeightPx?: number;
  };
};

export type GeometryValidationResultType = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * 프로필별 geometry 정책에 따라 입력·출력 치수와 spriteSheet·runtime 좌표를 검증한다.
 */
export function validateGeometryPreservation(
  input: GeometryValidationInputType,
): GeometryValidationResultType {
  const policy = resolveProfilePolicy(input.profile);
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1) asset type 호환성 (optional, 제공된 경우만)
  if (input.assetType) {
    const compatError = validateProfileAssetCompatibility(input.profile, input.assetType);
    if (compatError) errors.push(compatError);
  }

  // 2) cropTransparent 검증
  if (input.cropTransparent && !policy.cropAllowed) {
    errors.push(
      `cropTransparent=true is not allowed for profile "${input.profile}". ` +
      `Only "single-character" profile supports cropping.`,
    );
  }

  // 3) 치수 보존
  if (policy.preserveDimensions) {
    if (input.outputWidth !== input.inputWidth || input.outputHeight !== input.inputHeight) {
      errors.push(
        `dimension mismatch: profile "${input.profile}" requires dimensions to be preserved ` +
        `(input=${input.inputWidth}x${input.inputHeight}, output=${input.outputWidth}x${input.outputHeight})`,
      );
    }
  }

  // 4) frame grid 보존 (spriteSheet가 제공된 경우)
  if (policy.preserveFrameGrid && input.spriteSheet) {
    const ss = input.spriteSheet;
    if (ss.frameWidth !== undefined && ss.frameHeight !== undefined && ss.columns !== undefined && ss.rows !== undefined) {
      const expectedWidth = ss.frameWidth * ss.columns;
      const expectedHeight = ss.frameHeight * ss.rows;
      if (input.outputWidth !== expectedWidth || input.outputHeight !== expectedHeight) {
        warnings.push(
          `frame grid may be broken: expected sheet dimensions ${expectedWidth}x${expectedHeight} ` +
          `(${ss.columns}cols × ${ss.frameWidth}px, ${ss.rows}rows × ${ss.frameHeight}px), ` +
          `got ${input.outputWidth}x${input.outputHeight}`,
        );
      }
    }
  }

  // 5) runtime 좌표 보존 (runtime이 제공된 경우 보존 확인, 치수 변경 시 경고)
  if (policy.preserveRuntimeCoords && input.runtime) {
    const dimsChanged = input.outputWidth !== input.inputWidth || input.outputHeight !== input.inputHeight;
    if (dimsChanged) {
      warnings.push(
        `runtime coordinates may be invalidated: dimensions changed (${input.inputWidth}x${input.inputHeight} → ${input.outputWidth}x${input.outputHeight}). ` +
        `anchor/footprint/isoHeightPx must be recalibrated.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 기본 crop 정책 helper (CK-302: 초기 모든 profile cropTransparent=false)
// ---------------------------------------------------------------------------

/** 모든 프로필의 기본 cropTransparent 값 — CK-302 초기 정책: 전부 false */
export const CROP_TRANSPARENT_DEFAULT = false as const;

/** single-character 프로필만 cropTransparent=true 허용 */
export const CROP_TRANSPARENT_ALLOWED_PROFILES: readonly ChromaKeyProfileType[] = [
  "single-character",
] as const;

/** 프로필이 cropTransparent를 허용하는지 확인 */
export function isCropTransparentAllowed(profile: ChromaKeyProfileType): boolean {
  return (CROP_TRANSPARENT_ALLOWED_PROFILES as readonly string[]).includes(profile);
}
