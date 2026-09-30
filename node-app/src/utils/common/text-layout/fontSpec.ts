import { TEXT_LAYOUT_DEFAULT_FONT_FAMILY, TEXT_LAYOUT_PRESETS } from "consts/app";
import type { PreparedTextLayoutRequest, TextLayoutDirection, TextLayoutTypographyPreset } from "types/ui";

export interface ResolvedTextLayoutTypography extends Omit<TextLayoutTypographyPreset, "fontFamily"> {
  fontFamily: string;
  direction: TextLayoutDirection;
  locale?: string;
  font: string;
}

export function getTextLayoutDocumentFontFamily() {
  if (typeof window === "undefined") return TEXT_LAYOUT_DEFAULT_FONT_FAMILY;

  const bodyFontFamily = window.getComputedStyle(document.body).fontFamily;
  return bodyFontFamily || TEXT_LAYOUT_DEFAULT_FONT_FAMILY;
}

export function getTextLayoutDocumentLocale() {
  if (typeof document === "undefined") return undefined;

  const lang = document.documentElement.lang?.trim();
  return lang || undefined;
}

export function buildTextLayoutFontValue(args: {
  fontSizePx: number;
  fontWeight: TextLayoutTypographyPreset["fontWeight"];
  fontFamily: string;
}) {
  const fontWeight = typeof args.fontWeight === "number" ? String(args.fontWeight) : args.fontWeight;
  return `normal ${fontWeight} ${args.fontSizePx}px ${args.fontFamily}`;
}

export function resolveTextLayoutTypography(request: PreparedTextLayoutRequest): ResolvedTextLayoutTypography {
  const preset = TEXT_LAYOUT_PRESETS[request.preset];
  const fontFamily = request.fontFamily || preset.fontFamily || getTextLayoutDocumentFontFamily();
  const fontSizePx = Math.max(1, Math.round(Number(request.fontSizePx || preset.fontSizePx) || preset.fontSizePx));
  const lineHeightPx = Math.max(1, Math.round(Number(request.lineHeightPx || preset.lineHeightPx) || preset.lineHeightPx));
  const fontWeight = request.fontWeight || preset.fontWeight;
  const whiteSpace = request.whiteSpace || preset.whiteSpace;
  const wordBreak = request.wordBreak || preset.wordBreak;
  const direction = request.direction || "auto";
  const locale = request.locale || getTextLayoutDocumentLocale();
  const font = buildTextLayoutFontValue({ fontFamily, fontSizePx, fontWeight });

  return {
    fontFamily,
    fontSizePx,
    lineHeightPx,
    fontWeight,
    whiteSpace,
    wordBreak,
    direction,
    locale,
    font,
  };
}
