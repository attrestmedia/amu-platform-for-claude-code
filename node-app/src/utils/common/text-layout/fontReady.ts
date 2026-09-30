import type { PreparedTextLayoutHandle } from "types/ui";

function getFontFaceSet() {
  if (typeof document === "undefined") return null;
  return document.fonts || null;
}

export function isTextLayoutFontReady(font: string, sampleText = "AMU") {
  const fontFaceSet = getFontFaceSet();
  if (!fontFaceSet) return false;

  try {
    return fontFaceSet.check(font, sampleText);
  } catch {
    return false;
  }
}

export async function ensureTextLayoutFontReady(font: string, sampleText = "AMU") {
  const fontFaceSet = getFontFaceSet();
  if (!fontFaceSet) return false;

  try {
    if (fontFaceSet.check(font, sampleText)) return true;
    await fontFaceSet.load(font, sampleText);
    await fontFaceSet.ready;
    return fontFaceSet.check(font, sampleText);
  } catch {
    return false;
  }
}

export function isPreparedTextLayoutFontReady(handle: PreparedTextLayoutHandle) {
  return isTextLayoutFontReady(handle.font, handle.sampleText);
}

export async function ensurePreparedTextLayoutFontReady(handle: PreparedTextLayoutHandle) {
  return ensureTextLayoutFontReady(handle.font, handle.sampleText);
}

