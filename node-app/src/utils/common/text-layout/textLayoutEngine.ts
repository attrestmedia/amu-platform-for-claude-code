import type {
  PreparedTextLayoutHandle,
  PreparedTextLayoutLine,
  PreparedTextLayoutRequest,
  PreparedTextLayoutResult,
  PreparedTextLayoutRun,
  TextLayoutMetrics,
  TextLayoutRequest,
} from "types/ui";
import { isPreparedTextLayoutFontReady } from "./fontReady";
import { resolveTextLayoutTypography } from "./fontSpec";
import { getPreparedTextLayoutCache, getTextLayoutWidthCache, setPreparedTextLayoutCache, setTextLayoutWidthCache } from "./textLayoutCache";

type SegmenterGranularity = "grapheme" | "word";
type SegmentLike = { segment: string };
type SegmenterInstance = { segment(input: string): Iterable<SegmentLike> };
type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: SegmenterGranularity },
) => SegmenterInstance;

let measureContext: CanvasRenderingContext2D | null = null;

function getMeasureContext() {
  if (measureContext) return measureContext;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  measureContext = canvas.getContext("2d");
  return measureContext;
}

function getIntlSegmenter() {
  return (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter;
}

function createSegmenter(locale: string | undefined, granularity: SegmenterGranularity) {
  const Segmenter = getIntlSegmenter();
  if (!Segmenter) return null;

  try {
    return new Segmenter(locale, { granularity });
  } catch {
    return null;
  }
}

function normalizeTextForLayout(text: string, whiteSpace: PreparedTextLayoutHandle["whiteSpace"]) {
  const raw = String(text || "").replace(/\r\n?/g, "\n");

  if (whiteSpace === "normal") {
    return raw
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n");
  }

  return raw.replace(/\t/g, "    ");
}

function tokenizeLine(line: string, locale: string | undefined) {
  if (!line) return [];

  const wordSegmenter = createSegmenter(locale, "word");
  if (wordSegmenter) {
    return Array.from(wordSegmenter.segment(line), (item) => item.segment);
  }

  return line.match(/\s+|\S+/g) || [];
}

function splitTokenByGrapheme(token: string, locale: string | undefined) {
  if (!token) return [];

  const graphemeSegmenter = createSegmenter(locale, "grapheme");
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(token), (item) => item.segment);
  }

  return Array.from(token);
}

function estimateWidthWithoutCanvas(text: string, fontSizePx: number) {
  let width = 0;

  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) {
      width += fontSizePx * 0.33;
    } else if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3040-\u30ff\u4e00-\u9fff]/.test(ch)) {
      width += fontSizePx;
    } else if (/[A-Z]/.test(ch)) {
      width += fontSizePx * 0.68;
    } else if (/[a-z0-9]/.test(ch)) {
      width += fontSizePx * 0.58;
    } else {
      width += fontSizePx * 0.62;
    }
  }

  return width;
}

function getTextLayoutWidth(handle: PreparedTextLayoutHandle, text: string, letterSpacingPx = 0) {
  const spacing = Number.isFinite(letterSpacingPx) ? letterSpacingPx : 0;
  const cacheKey = `${handle.font}::${spacing}::${text}`;
  const cached = getTextLayoutWidthCache(cacheKey);
  if (typeof cached === "number") return cached;

  const ctx = getMeasureContext();
  const measuredWidth = ctx
    ? (() => {
        if (ctx.font !== handle.font) ctx.font = handle.font;
        return ctx.measureText(text).width;
      })()
    : estimateWidthWithoutCanvas(text, handle.fontSizePx);
  const glyphCount = splitTokenByGrapheme(text, handle.locale).length;
  const width = Math.max(0, measuredWidth + Math.max(0, glyphCount - 1) * spacing);

  setTextLayoutWidthCache(cacheKey, width);
  return width;
}

function createLineEntries(text: string, locale: string | undefined) {
  return text.split("\n").map<PreparedTextLayoutLine>((line) => ({
    raw: line,
    tokens: tokenizeLine(line, locale),
  }));
}

function buildPreparedTextLayoutCacheKey(args: {
  text: string;
  preset: PreparedTextLayoutRequest["preset"];
  locale?: string;
  direction: PreparedTextLayoutHandle["direction"];
  whiteSpace: PreparedTextLayoutHandle["whiteSpace"];
  wordBreak: PreparedTextLayoutHandle["wordBreak"];
  font: string;
  lineHeightPx: number;
}) {
  return JSON.stringify(args);
}

function getFontSampleText(text: string) {
  const compact = text.replace(/\s+/g, "").slice(0, 24);
  return compact || "AMUText텍스트";
}

function layoutOversizedToken(
  handle: PreparedTextLayoutHandle,
  token: string,
  maxWidth: number,
  letterSpacingPx: number,
): PreparedTextLayoutRun[] {
  const parts = splitTokenByGrapheme(token, handle.locale);
  if (!parts.length) return [{ text: "", width: 0 }];

  const runs: PreparedTextLayoutRun[] = [];
  let currentText = "";

  for (const part of parts) {
    const nextText = `${currentText}${part}`;
    const nextWidth = getTextLayoutWidth(handle, nextText, letterSpacingPx);

    if (!currentText || nextWidth <= maxWidth) {
      currentText = nextText;
      continue;
    }

    runs.push({ text: currentText, width: getTextLayoutWidth(handle, currentText, letterSpacingPx) });
    currentText = part;
  }

  if (currentText) {
    runs.push({ text: currentText, width: getTextLayoutWidth(handle, currentText, letterSpacingPx) });
  }
  return runs;
}

function layoutPreparedLine(
  handle: PreparedTextLayoutHandle,
  line: PreparedTextLayoutLine,
  maxWidth: number,
  letterSpacingPx: number,
): PreparedTextLayoutRun[] {
  if (!line.tokens.length) return [{ text: "", width: 0 }];

  const runs: PreparedTextLayoutRun[] = [];
  const preserveWhitespace = handle.whiteSpace === "pre-wrap";
  let currentText = "";
  let hasContent = false;

  const pushCurrentLine = () => {
    runs.push({
      text: currentText,
      width: getTextLayoutWidth(handle, currentText, letterSpacingPx),
    });
    currentText = "";
    hasContent = false;
  };

  for (const token of line.tokens) {
    if (!token) continue;

    const isWhitespace = /^\s+$/.test(token);
    const tokenWidth = getTextLayoutWidth(handle, token, letterSpacingPx);

    if (!preserveWhitespace && isWhitespace && !hasContent) {
      continue;
    }

    const combinedText = `${currentText}${token}`;
    const combinedWidth = getTextLayoutWidth(handle, combinedText, letterSpacingPx);
    if (tokenWidth <= maxWidth && (!currentText || combinedWidth <= maxWidth)) {
      currentText = combinedText;
      hasContent = hasContent || !isWhitespace || preserveWhitespace;
      continue;
    }

    if (!preserveWhitespace && isWhitespace) {
      if (hasContent) pushCurrentLine();
      continue;
    }

    if (hasContent) {
      pushCurrentLine();
    }

    if (tokenWidth <= maxWidth) {
      currentText = token;
      hasContent = true;
      continue;
    }

    if (handle.wordBreak === "keep-all") {
      currentText = token;
      hasContent = true;
      continue;
    }

    const overflowRuns = layoutOversizedToken(handle, token, maxWidth, letterSpacingPx);
    runs.push(...overflowRuns.slice(0, -1));
    currentText = overflowRuns.at(-1)?.text || "";
    hasContent = Boolean(currentText);
  }

  if (hasContent || !runs.length) {
    runs.push({
      text: currentText,
      width: getTextLayoutWidth(handle, currentText, letterSpacingPx),
    });
  }

  return runs;
}

export function prepareTextLayoutSync(request: PreparedTextLayoutRequest): PreparedTextLayoutHandle {
  const typography = resolveTextLayoutTypography(request);
  const normalizedText = normalizeTextForLayout(request.text, typography.whiteSpace);
  const cacheKey = buildPreparedTextLayoutCacheKey({
    text: normalizedText,
    preset: request.preset,
    locale: typography.locale,
    direction: typography.direction,
    whiteSpace: typography.whiteSpace,
    wordBreak: typography.wordBreak,
    font: typography.font,
    lineHeightPx: typography.lineHeightPx,
  });

  const cached = getPreparedTextLayoutCache(cacheKey);
  if (cached) {
    const fontReady = isPreparedTextLayoutFontReady(cached);
    if (cached.fontReady !== fontReady) cached.fontReady = fontReady;
    return cached;
  }

  const handle: PreparedTextLayoutHandle = {
    cacheKey,
    backend: "heuristic",
    preset: request.preset,
    locale: typography.locale,
    direction: typography.direction,
    whiteSpace: typography.whiteSpace,
    wordBreak: typography.wordBreak,
    font: typography.font,
    fontFamily: typography.fontFamily,
    fontSizePx: typography.fontSizePx,
    lineHeightPx: typography.lineHeightPx,
    fontWeight: typography.fontWeight,
    text: normalizedText,
    sampleText: getFontSampleText(normalizedText),
    lines: createLineEntries(normalizedText, typography.locale),
    fontReady: false,
  };

  handle.fontReady = isPreparedTextLayoutFontReady(handle);
  setPreparedTextLayoutCache(handle);
  return handle;
}

export function measurePreparedTextLayoutSync(
  handle: PreparedTextLayoutHandle,
  maxWidth: number,
  options?: { maxLines?: number; letterSpacingPx?: number },
): TextLayoutMetrics {
  const safeWidth = Math.max(1, Math.round(Number(maxWidth) || 1));
  const layout = layoutPreparedTextLinesSync(handle, safeWidth, {
    letterSpacingPx: options?.letterSpacingPx,
  });
  const totalLineCount = layout.totalLineCount;
  const maxLines = typeof options?.maxLines === "number" ? Math.max(1, options.maxLines) : undefined;
  const visibleWidths = maxLines
    ? layout.lines.slice(0, maxLines).map((line) => line.width)
    : layout.lines.map((line) => line.width);
  const lineCount = visibleWidths.length || 1;
  const maxLineWidth = Math.max(0, ...visibleWidths);

  handle.fontReady = isPreparedTextLayoutFontReady(handle);

  return {
    width: maxLineWidth,
    height: lineCount * handle.lineHeightPx,
    lineCount,
    maxLineWidth,
    truncated: typeof maxLines === "number" && totalLineCount > maxLines,
    backend: handle.backend,
    fontReady: handle.fontReady,
  };
}

export function layoutPreparedTextLinesSync(
  handle: PreparedTextLayoutHandle,
  maxWidth: number,
  options: { maxLines?: number; letterSpacingPx?: number } = {},
): PreparedTextLayoutResult {
  const safeWidth = Math.max(1, Number(maxWidth) || 1);
  const letterSpacingPx = Number.isFinite(options.letterSpacingPx) ? Number(options.letterSpacingPx) : 0;
  const allLines = handle.lines.flatMap((line) => layoutPreparedLine(handle, line, safeWidth, letterSpacingPx));
  const lines = allLines.length ? allLines : [{ text: "", width: 0 }];
  const maxLines = typeof options.maxLines === "number" ? Math.max(1, Math.floor(options.maxLines)) : undefined;
  const visibleLines = maxLines ? lines.slice(0, maxLines) : lines;

  return {
    lines: visibleLines,
    totalLineCount: lines.length,
    truncated: Boolean(maxLines && lines.length > maxLines),
    maxLineWidth: Math.max(0, ...visibleLines.map((line) => line.width)),
  };
}

export function measureTextLayoutSync(request: TextLayoutRequest): TextLayoutMetrics {
  const prepared = prepareTextLayoutSync(request);
  return measurePreparedTextLayoutSync(prepared, request.maxWidth, { maxLines: request.maxLines });
}
