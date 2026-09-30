export type TextLayoutWhiteSpace = "normal" | "pre-wrap";
export type TextLayoutWordBreak = "normal" | "break-word" | "keep-all";
export type TextLayoutDirection = "ltr" | "rtl" | "auto";
export type TextLayoutBackend = "heuristic";

export type TextLayoutPresetKey =
  | "body-sm"
  | "body-md"
  | "chat-bubble"
  | "canvas-comment"
  | "canvas-label"
  | "card-caption";

export type TextLayoutFontWeight = number | "normal" | "bold" | "bolder" | "lighter";

export interface TextLayoutTypographyPreset {
  fontFamily?: string;
  fontSizePx: number;
  lineHeightPx: number;
  fontWeight: TextLayoutFontWeight;
  whiteSpace: TextLayoutWhiteSpace;
  wordBreak: TextLayoutWordBreak;
}

export interface TextLayoutBaseRequest {
  text: string;
  preset: TextLayoutPresetKey;
  locale?: string;
  direction?: TextLayoutDirection;
  whiteSpace?: TextLayoutWhiteSpace;
  wordBreak?: TextLayoutWordBreak;
  fontFamily?: string;
  fontSizePx?: number;
  lineHeightPx?: number;
  fontWeight?: TextLayoutFontWeight;
}

export type PreparedTextLayoutRequest = TextLayoutBaseRequest;

export interface TextLayoutRequest extends TextLayoutBaseRequest {
  maxWidth: number;
  maxLines?: number;
}

export interface PreparedTextLayoutLine {
  raw: string;
  tokens: string[];
}

export interface PreparedTextLayoutRun {
  text: string;
  width: number;
}

export interface PreparedTextLayoutResult {
  lines: PreparedTextLayoutRun[];
  totalLineCount: number;
  truncated: boolean;
  maxLineWidth: number;
}

export interface PreparedTextLayoutRun {
  text: string;
  width: number;
}

export interface PreparedTextLayoutHandle {
  cacheKey: string;
  backend: TextLayoutBackend;
  preset: TextLayoutPresetKey;
  locale?: string;
  direction: TextLayoutDirection;
  whiteSpace: TextLayoutWhiteSpace;
  wordBreak: TextLayoutWordBreak;
  font: string;
  fontFamily: string;
  fontSizePx: number;
  lineHeightPx: number;
  fontWeight: TextLayoutFontWeight;
  text: string;
  sampleText: string;
  lines: PreparedTextLayoutLine[];
  fontReady: boolean;
}

export interface TextLayoutMetrics {
  width: number;
  height: number;
  lineCount: number;
  maxLineWidth: number;
  truncated: boolean;
  backend: TextLayoutBackend;
  fontReady: boolean;
}
