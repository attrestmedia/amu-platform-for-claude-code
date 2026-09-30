/**
 * ChromaKey v2 — feather·choke·범용 despill (CK-103)
 *
 * YCbCr 소프트 알파 커널(CK-102) 결과에 적용하는 후처리:
 * - feather: 알파 마스크 가장자리 box blur
 * - choke: 알파 마스크 축소(음수)/확장(양수)
 * - despill: 반투명 경계에서 키 색 벡터 기반 spill 제거 + 색상 클램프
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import type { ChromaKeyColorPresetType } from "consts/game/chromaKey";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type ChromaKeyRefineInputType = {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
  keyColor: ChromaKeyColorPresetType;
  feather: number;
  choke: number;
  despill: number;
};

export type ChromaKeyRefineStatsType = {
  featherModified: number;
  chokeModified: number;
  despillModified: number;
};

// ---------------------------------------------------------------------------
// Feather — box blur on alpha channel
// ---------------------------------------------------------------------------

function applyFeather(data: Uint8Array, w: number, h: number, ch: number, radius: number): number {
  if (radius <= 0 || w < 3 || h < 3) return 0;
  const src = new Uint8Array(data);
  const r = Math.round(radius);
  let modified = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * ch;
      const origAlpha = src[idx + 3];
      let sum = 0, count = 0;
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      for (let ny = y0; ny <= y1; ny += 1)
        for (let nx = x0; nx <= x1; nx += 1)
          { sum += src[(ny * w + nx) * ch + 3]; count += 1; }
      const newAlpha = Math.round(sum / count);
      if (newAlpha !== origAlpha) { data[idx + 3] = newAlpha; modified += 1; }
    }
  }
  return modified;
}

// ---------------------------------------------------------------------------
// Choke — morphological dilate(양수)/erode(음수)
// ---------------------------------------------------------------------------

function applyChoke(data: Uint8Array, w: number, h: number, ch: number, px: number): number {
  if (px === 0 || w < 3 || h < 3) return 0;
  const src = new Uint8Array(data);
  const absPx = Math.round(Math.abs(px));
  const isDilate = px > 0;
  let modified = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * ch;
      const origAlpha = src[idx + 3];
      let extreme = isDilate ? 0 : 255;
      const y0 = Math.max(0, y - absPx), y1 = Math.min(h - 1, y + absPx);
      const x0 = Math.max(0, x - absPx), x1 = Math.min(w - 1, x + absPx);
      for (let ny = y0; ny <= y1; ny += 1)
        for (let nx = x0; nx <= x1; nx += 1) {
          const na = src[(ny * w + nx) * ch + 3];
          extreme = isDilate ? Math.max(extreme, na) : Math.min(extreme, na);
        }
      if (extreme !== origAlpha) { data[idx + 3] = extreme; modified += 1; }
    }
  }
  return modified;
}

// ---------------------------------------------------------------------------
// Despill — 반투명 경계에서 키 색 spill 제거 + RGB 클램프
// ---------------------------------------------------------------------------

function applyDespill(
  data: Uint8Array, total: number, ch: number,
  keyColor: ChromaKeyColorPresetType, strength: number,
): number {
  if (strength <= 0) return 0;
  let modified = 0;

  for (let i = 0; i < total; i += 1) {
    const idx = i * ch;
    const alpha = data[idx + 3];
    if (alpha === 255 || alpha === 0) continue;

    const spillRatio = ((255 - alpha) / 255) * strength;
    const nr = Math.round(data[idx] - spillRatio * keyColor.r);
    const ng = Math.round(data[idx + 1] - spillRatio * keyColor.g);
    const nb = Math.round(data[idx + 2] - spillRatio * keyColor.b);
    const cr = Math.max(0, Math.min(255, nr));
    const cg = Math.max(0, Math.min(255, ng));
    const cb = Math.max(0, Math.min(255, nb));

    if (cr !== data[idx] || cg !== data[idx + 1] || cb !== data[idx + 2]) {
      data[idx] = cr; data[idx + 1] = cg; data[idx + 2] = cb;
      modified += 1;
    }
  }
  return modified;
}

// ---------------------------------------------------------------------------
// 메인: feather → choke → despill
// ---------------------------------------------------------------------------

export function applyChromaKeyRefinements(input: ChromaKeyRefineInputType): ChromaKeyRefineStatsType {
  const { data, width, height, channels, keyColor, feather, choke, despill } = input;
  if (channels < 4) return { featherModified: 0, chokeModified: 0, despillModified: 0 };

  const total = width * height;
  const fm = applyFeather(data, width, height, channels, feather);
  const cm = applyChoke(data, width, height, channels, choke);
  const dm = applyDespill(data, total, channels, keyColor, despill);

  return { featherModified: fm, chokeModified: cm, despillModified: dm };
}
