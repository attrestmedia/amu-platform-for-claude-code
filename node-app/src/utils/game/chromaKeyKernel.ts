/**
 * ChromaKey v2 — YCbCr Cb·Cr 소프트 알파 커널 (CK-102)
 *
 * RGB→YCbCr(BT.601) 변환 후 Cb·Cr 평면의 색차 거리로 알파 매트를 생성한다.
 * Y(밝기)는 key 판정 주축에서 제외하고, 극단적 무채색 오탐 방지 보조값으로만 사용한다.
 *
 * 설계 §5.2 "YCbCr 소프트 매트"
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import type { ChromaKeyCoverageModeType } from "types/game/chroma-key";
import type { ChromaKeyColorPresetType } from "consts/game/chromaKey";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type ChromaKeyKernelInputType = {
  /** RGBA raw 픽셀 데이터 (in-place 수정됨) */
  data: Uint8Array;
  /** 이미지 너비 */
  width: number;
  /** 이미지 높이 */
  height: number;
  /** 채널 수 (4=RGBA) */
  channels: number;
  /** 키 색상 (detectKeyColor의 resolvedColor) */
  keyColor: ChromaKeyColorPresetType;
  /** Cb·Cr 색차 거리 임계 (0–100) — 이하 완전 투명 */
  similarity: number;
  /** 알파 그라데이션 범위 (0–100) — similarity~similarity+softness 사이 smoothstep */
  softness: number;
  /** 배경 영역 판정 모드 */
  coverageMode: ChromaKeyCoverageModeType;
};

export type ChromaKeyKernelStatsType = {
  /** 전체 픽셀 중 완전 투명(a=0) 비율 */
  transparentRatio: number;
  /** 전체 픽셀 중 반투명(0<a<255) 비율 */
  semiAlphaRatio: number;
  /** 처리 전/후 알파 변경 픽셀 수 */
  modifiedPixels: number;
  /** 전경 손실 위험 픽셀 수 (내부 픽셀이 키잉된 경우, 추정) */
  potentialForegroundLoss: number;
};

// ---------------------------------------------------------------------------
// RGB → YCbCr 변환 (ITU-R BT.601, full-range)
// ---------------------------------------------------------------------------

type YCbCrType = { y: number; cb: number; cr: number };

/** 0–255 RGB → YCbCr */
export function rgbToYCbCr(r: number, g: number, b: number): YCbCrType {
  return {
    y:  0.299 * r + 0.587 * g + 0.114 * b,
    cb: -0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

/** Cb·Cr 평면의 유클리드 거리 */
function cbCrDistance(a: YCbCrType, b: YCbCrType): number {
  const dcb = a.cb - b.cb;
  const dcr = a.cr - b.cr;
  return Math.sqrt(dcb * dcb + dcr * dcr);
}

// ---------------------------------------------------------------------------
// smoothstep
// ---------------------------------------------------------------------------

/** edge0~edge1 사이를 3차 보간 (GLSL smoothstep과 동일) */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Global coverage kernel — 전체 픽셀에 YCbCr 거리 기반 알파 적용
// ---------------------------------------------------------------------------

function applyGlobalKernel(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
  keyYCbCr: YCbCrType,
  similarity: number,
  softness: number,
): ChromaKeyKernelStatsType {
  const total = width * height;
  let transparent = 0;
  let semiAlpha = 0;
  let modifiedPixels = 0;
  let potentialForegroundLoss = 0;

  const edgeFull = similarity;
  const edgeFullTransparent = similarity + softness;

  for (let i = 0; i < total; i += 1) {
    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const srcAlpha = data[idx + 3];

    // 1) YCbCr 변환 + Cb·Cr 거리
    const pixelYCbCr = rgbToYCbCr(r, g, b);
    const dist = cbCrDistance(pixelYCbCr, keyYCbCr);

    // 2) smoothstep으로 목표 알파 계산
    let targetAlpha: number;
    if (dist <= edgeFull) {
      // 완전히 key 범위: alpha=0 (투명)
      targetAlpha = 0;
    } else if (dist >= edgeFullTransparent) {
      // key 범위 밖: 원본 유지
      targetAlpha = srcAlpha;
    } else {
      // 전이 영역: smoothstep
      const t = smoothstep(edgeFull, edgeFullTransparent, dist);
      targetAlpha = Math.round(t * srcAlpha);
    }

    // 3) source alpha 보존: 더 낮은 쪽을 취함 (이미 투명한 픽셀 보호)
    const newAlpha = Math.min(srcAlpha, targetAlpha);

    if (newAlpha !== srcAlpha) {
      modifiedPixels += 1;
      data[idx + 3] = newAlpha;

      // 내부 픽셀이 key 범위에 들어가 전경 손실 위험 감지 (border 아닌 픽셀)
      const x = i % width;
      const y = Math.floor(i / width);
      const isBorder = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      if (!isBorder && dist <= edgeFull && srcAlpha > 128) {
        potentialForegroundLoss += 1;
      }
    }

    // 통계
    if (newAlpha === 0) transparent += 1;
    else if (newAlpha < 255) semiAlpha += 1;
  }

  return {
    transparentRatio: total > 0 ? transparent / total : 0,
    semiAlphaRatio: total > 0 ? semiAlpha / total : 0,
    modifiedPixels,
    potentialForegroundLoss,
  };
}

// ---------------------------------------------------------------------------
// Border-connected coverage kernel — 경계에서 flood-fill로 연결된 픽셀만 처리
// ---------------------------------------------------------------------------

function applyBorderConnectedKernel(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
  keyYCbCr: YCbCrType,
  similarity: number,
  softness: number,
): ChromaKeyKernelStatsType {
  const total = width * height;
  const edgeFull = similarity;
  const edgeFullTransparent = similarity + softness;

  // 방문 여부
  const visited = new Uint8Array(total);
  // 수정될 픽셀 마스크 (border-connected)
  const toKey = new Uint8Array(total);

  // BFS 큐: border에서 key 범위인 픽셀에서 시작
  const queue: number[] = [];

  // border 픽셀 enqueue
  for (let i = 0; i < total; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (x !== 0 && x !== width - 1 && y !== 0 && y !== height - 1) continue;

    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const pixelYCbCr = rgbToYCbCr(r, g, b);
    const dist = cbCrDistance(pixelYCbCr, keyYCbCr);

    if (dist < edgeFullTransparent) {
      visited[i] = 1;
      toKey[i] = 1;
      queue.push(i);
    }
  }

  // BFS: 4방향 neighbor 탐색
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const cx = cur % width;
    const cy = Math.floor(cur / width);

    const neighbors: number[] = [];
    if (cx > 0) neighbors.push(cur - 1);
    if (cx < width - 1) neighbors.push(cur + 1);
    if (cy > 0) neighbors.push(cur - width);
    if (cy < height - 1) neighbors.push(cur + width);

    for (const ni of neighbors) {
      if (visited[ni]) continue;
      visited[ni] = 1;

      const idx = ni * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const pixelYCbCr = rgbToYCbCr(r, g, b);
      const dist = cbCrDistance(pixelYCbCr, keyYCbCr);

      if (dist < edgeFullTransparent) {
        toKey[ni] = 1;
        queue.push(ni);
      }
    }
  }

  // 마스크 기반 알파 적용
  let transparent = 0;
  let semiAlpha = 0;
  let modifiedPixels = 0;
  const potentialForegroundLoss = 0;

  for (let i = 0; i < total; i += 1) {
    if (!toKey[i]) continue;

    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const srcAlpha = data[idx + 3];

    const pixelYCbCr = rgbToYCbCr(r, g, b);
    const dist = cbCrDistance(pixelYCbCr, keyYCbCr);

    let targetAlpha: number;
    if (dist <= edgeFull) {
      targetAlpha = 0;
    } else if (dist >= edgeFullTransparent) {
      targetAlpha = srcAlpha;
    } else {
      const t = smoothstep(edgeFull, edgeFullTransparent, dist);
      targetAlpha = Math.round(t * srcAlpha);
    }

    const newAlpha = Math.min(srcAlpha, targetAlpha);

    if (newAlpha !== srcAlpha) {
      modifiedPixels += 1;
      data[idx + 3] = newAlpha;
    }

    if (newAlpha === 0) transparent += 1;
    else if (newAlpha < 255) semiAlpha += 1;
  }

  return {
    transparentRatio: total > 0 ? transparent / total : 0,
    semiAlphaRatio: total > 0 ? semiAlpha / total : 0,
    modifiedPixels,
    potentialForegroundLoss,
  };
}

// ---------------------------------------------------------------------------
// 메인 커널 — coverage mode에 따라 분기
// ---------------------------------------------------------------------------

/**
 * YCbCr 소프트 알파 커널을 RGBA raw 데이터에 적용한다 (in-place).
 *
 * - global 모드: 모든 픽셀에 YCbCr Cb·Cr 거리 기반 smoothstep 알파 적용
 * - border-connected 모드: 경계에서 flood-fill로 연결된 픽셀만 처리
 *
 * source alpha가 계산된 target alpha보다 낮으면 source alpha를 보존한다.
 * (이미 투명/반투명한 픽셀을 덮어쓰지 않음)
 */
export function applyChromaKeyKernel(input: ChromaKeyKernelInputType): ChromaKeyKernelStatsType {
  const { data, width, height, channels, keyColor, similarity, softness, coverageMode } = input;

  if (channels < 4) {
    return { transparentRatio: 0, semiAlphaRatio: 0, modifiedPixels: 0, potentialForegroundLoss: 0 };
  }

  const keyYCbCr = rgbToYCbCr(keyColor.r, keyColor.g, keyColor.b);

  if (coverageMode === "border-connected") {
    return applyBorderConnectedKernel(data, width, height, channels, keyYCbCr, similarity, softness);
  }

  return applyGlobalKernel(data, width, height, channels, keyYCbCr, similarity, softness);
}

