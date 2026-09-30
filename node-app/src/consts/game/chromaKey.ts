/**
 * ChromaKey v2 — 핵심 상수 모듈 (CK-100)
 *
 * 서버·Worker·브라우저가 공용으로 참조하는 key 색상 프리셋과
 * 에셋 프로필별 기본값을 순수 상수로 정의한다.
 * 정책·fallback·engine mode는 chromaKeyPresets.ts에서 관리한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import type {
  ChromaKeyCoverageModeType,
  ChromaKeyModeType,
  ChromaKeyProfileType,
} from "types/game/chroma-key";

// ---------------------------------------------------------------------------
// Key 색상 프리셋 — green / blue / magenta (설계 §4.1)
// ---------------------------------------------------------------------------

/** 키 색상의 RGB 표현 */
export type ChromaKeyColorPresetType = { r: number; g: number; b: number };

/** 그린스크린 키 — 순수 녹색 (sRGB) */
export const CHROMA_KEY_GREEN: ChromaKeyColorPresetType = { r: 0, g: 255, b: 0 } as const;

/** 블루스크린 키 — 순수 청색 (sRGB) */
export const CHROMA_KEY_BLUE: ChromaKeyColorPresetType = { r: 0, g: 0, b: 255 } as const;

/** 마젠타스크린 키 — 순수 마젠타 (sRGB) */
export const CHROMA_KEY_MAGENTA: ChromaKeyColorPresetType = { r: 255, g: 0, b: 255 } as const;

/**
 * mode → 기본 키 색상 매핑.
 * auto/custom 모드는 런타임 결정되므로 제외한다.
 */
export const CHROMA_KEY_COLOR_PRESETS: Record<
  Exclude<ChromaKeyModeType, "auto" | "custom">,
  ChromaKeyColorPresetType
> = {
  green: CHROMA_KEY_GREEN,
  blue: CHROMA_KEY_BLUE,
  magenta: CHROMA_KEY_MAGENTA,
} as const;

// ---------------------------------------------------------------------------
// 에셋 프로필별 기본값 (설계 §4.2)
// ---------------------------------------------------------------------------

/** 프로필별 chroma key 파라미터 기본값 — 정책 로직 없음, 순수 상수 */
export type ChromaKeyProfileDefaultsType = {
  /** Cb·Cr 색차 거리 임계 (0–100) */
  similarity: number;
  /** 알파 그라데이션 부드러운 범위 (0–100) */
  softness: number;
  /** 마스크 가장자리 feather 반경 px (0–10) */
  feather: number;
  /** 마스크 확장/축소 px (-10…10) */
  choke: number;
  /** 키 색 스필 제거 강도 (0–1) */
  despill: number;
  /** 배경 영역 판정 모드 */
  coverageMode: ChromaKeyCoverageModeType;
  /** 투명 영역 자동 크롭 허용 */
  cropTransparent: boolean;
};

/**
 * 에셋 프로필별 기본 chroma key 옵션.
 *
 * CK-Q1 초기값 (18/22/0.8/0.75) — fixture calibration(CK-002)에서 확정.
 * 커널 구현·테스트의 단일 진실 공급원이며, UI·파이프라인에서 그대로 참조한다.
 */
export const CHROMA_KEY_ASSET_PROFILE_DEFAULTS: Record<
  ChromaKeyProfileType,
  ChromaKeyProfileDefaultsType
> = {
  "sprite-sheet": {
    similarity: 18,
    softness: 22,
    feather: 0.8,
    choke: 0,
    despill: 0.75,
    coverageMode: "global",
    cropTransparent: false,
  },
  "character-bible": {
    similarity: 18,
    softness: 22,
    feather: 0.8,
    choke: 0,
    despill: 0.75,
    coverageMode: "global",
    cropTransparent: false,
  },
  "single-character": {
    similarity: 15,
    softness: 20,
    feather: 0.5,
    choke: 0,
    despill: 0.5,
    coverageMode: "border-connected",
    cropTransparent: false,
  },
  "tileset/prop/building": {
    similarity: 18,
    softness: 22,
    feather: 0,
    choke: 0,
    despill: 0.75,
    coverageMode: "border-connected",
    cropTransparent: false,
  },
} as const;

// ---------------------------------------------------------------------------
// 전역 기본값 — 프로필 미지정 시 fallback
// ---------------------------------------------------------------------------

/**
 * 프로필이 명시되지 않았을 때 사용하는 전역 기본값.
 * sprite-sheet 프로필과 동일한 값으로 보수적 설정을 사용한다.
 */
export const CHROMA_KEY_GLOBAL_DEFAULTS: ChromaKeyProfileDefaultsType = {
  similarity: 18,
  softness: 22,
  feather: 0.8,
  choke: 0,
  despill: 0.75,
  coverageMode: "global",
  cropTransparent: false,
} as const;

// ---------------------------------------------------------------------------
// Preview·downscale 정책 (CK-Q2, CK-400)
// ---------------------------------------------------------------------------

/**
 * 브라우저 preview downscale 목표 최대 차원 (px).
 * 800² ≈ 0.64MP → pure JS YCbCr 파이프라인이 slider 조작 시
 * sub-50ms로 완료되어 메인 스레드 long task를 방지한다.
 *
 * CK-002 baseline: 서버 Sharp 1024² 50.8ms/MP 대비,
 * 브라우저 pure JS는 약 3~5배 느리므로 800px가 안전한 상한이다.
 */
export const CHROMA_KEY_PREVIEW_MAX_DIMENSION = 800;

/**
 * 브라우저에서 원본 해상도를 처리할 수 있는 최대 차원 (px).
 * 2048² 초과 이미지는 preview만 제공하고, 최종 apply는 서버에서 처리한다.
 *
 * CK-002 baseline: 서버 Sharp 2048² 153.1ms/MP (C++ 네이티브),
 * 브라우저 pure JS는 ~500ms+ → long task → INP 위반.
 * 따라서 2048²를 브라우저 원본 처리 상한으로 설정한다.
 */
export const CHROMA_KEY_BROWSER_MAX_DIMENSION = 2048;

/**
 * 픽셀 수 기반 처리 상한 (CK-002, CK-400).
 * 현행 MAX_POST_PROCESS_PIXELS = 8.5MP와 동일한 계약을 유지한다.
 */
export const CHROMA_KEY_PIXEL_LIMIT = 8_500_000;
