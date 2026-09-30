/**
 * @docHint
 * @purpose CardNews text를 공통 textLayoutEngine의 실제 line run으로 준비
 * @process font handle + CardDeck text style → grapheme-safe line runs → vertical/alignment box
 * @domain card-news
 * @scope scene_layout
 */

import {
  layoutPreparedTextLinesSync,
  prepareTextLayoutSync,
} from "utils/common/text-layout";
import type { PreparedTextLayoutHandle, PreparedTextLayoutRun } from "types/ui";
import type { CardNewsTextLayer } from "types/card-news/cardDeck";
import type { CardNewsPreparedFont, CardNewsPreparedTextLine } from "types/card-news/scene";

export type CardNewsTextLayoutResult = {
  font: CardNewsPreparedFont;
  letterSpacingPx: number;
  lines: CardNewsPreparedTextLine[];
};

export function getCardNewsGraphemes(value: string, locale: string) {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locales?: string | string[], options?: { granularity: "grapheme" }) => {
      segment(input: string): Iterable<{ segment: string }>;
    };
  }).Segmenter;

  if (Segmenter) {
    try {
      return Array.from(new Segmenter(locale, { granularity: "grapheme" }).segment(value), (item) => item.segment);
    } catch {
      // Array.from is the compatibility fallback for runtimes without Intl.Segmenter.
    }
  }

  return Array.from(value);
}

function getRunWidth(handle: PreparedTextLayoutHandle, text: string, letterSpacingPx: number) {
  const run = layoutPreparedTextLinesSync(
    { ...handle, text, lines: [{ raw: text, tokens: [text] }] },
    Number.MAX_SAFE_INTEGER,
    { letterSpacingPx },
  ).lines[0];
  return run?.width || 0;
}

function trimLineForEllipsis(
  handle: PreparedTextLayoutHandle,
  line: PreparedTextLayoutRun,
  maxWidth: number,
  letterSpacingPx: number,
) {
  const ellipsis = "…";
  let text = line.text;
  while (text && getRunWidth(handle, `${text}${ellipsis}`, letterSpacingPx) > maxWidth) {
    const graphemes = getCardNewsGraphemes(text, handle.locale || "ko-KR");
    graphemes.pop();
    text = graphemes.join("");
  }

  const result = `${text}${ellipsis}`;
  return { text: result, width: getRunWidth(handle, result, letterSpacingPx) };
}

function toLinePosition(
  box: { x: number; y: number; w: number; h: number },
  lineHeightPx: number,
  lineCount: number,
  verticalAlign: CardNewsTextLayer["verticalAlign"],
) {
  const contentHeight = lineCount * lineHeightPx;
  const freeHeight = Math.max(0, box.h - contentHeight);
  const offset = verticalAlign === "middle" ? freeHeight / 2 : verticalAlign === "bottom" ? freeHeight : 0;
  return box.y + offset;
}

export function prepareCardNewsTextLayout(args: {
  layer: CardNewsTextLayer;
  box: { x: number; y: number; w: number; h: number };
  font: CardNewsPreparedFont;
}): CardNewsTextLayoutResult {
  const { layer, box, font } = args;
  const letterSpacingPx = layer.letterSpacing;
  // lineHeight는 폰트 리소스가 아니라 레이어별 스타일이다. 폰트 캐시를 재사용해도
  // 해당 레이어에서 입력한 줄간격이 Canvas/export 레이아웃에 그대로 반영되어야 한다.
  const lineHeightPx = layer.lineHeight;
  const handle = prepareTextLayoutSync({
    text: layer.text,
    preset: "card-caption",
    locale: layer.locale,
    direction: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: layer.wordBreak,
    fontFamily: font.family,
    fontSizePx: font.fontSizePx,
    lineHeightPx,
    fontWeight: font.weight,
  });
  const boxLineCapacity = Math.max(1, Math.floor(box.h / Math.max(1, lineHeightPx)));
  const maxLines = layer.maxLines === undefined ? boxLineCapacity : Math.min(layer.maxLines, boxLineCapacity);
  const layout = layoutPreparedTextLinesSync(handle, box.w, { maxLines, letterSpacingPx });
  const visibleRuns = layout.lines.map((line) => ({ ...line }));

  if (layer.overflow === "ellipsis" && layout.truncated && visibleRuns.length) {
    visibleRuns[visibleRuns.length - 1] = trimLineForEllipsis(
      handle,
      visibleRuns[visibleRuns.length - 1],
      box.w,
      letterSpacingPx,
    );
  }

  const firstY = toLinePosition(box, lineHeightPx, visibleRuns.length, layer.verticalAlign);
  const x = layer.align === "center" ? box.x + box.w / 2 : layer.align === "right" ? box.x + box.w : box.x;

  return {
    font,
    letterSpacingPx,
    lines: visibleRuns.map((line, index) => {
      const glyphAdvances = letterSpacingPx === 0
        ? undefined
        : getCardNewsGraphemes(line.text, layer.locale).map(
            (grapheme) => getRunWidth(handle, grapheme, 0) + letterSpacingPx,
          );
      return {
        text: line.text,
        width: line.width,
        ...(glyphAdvances ? { glyphAdvances } : {}),
        x,
        y: firstY + index * lineHeightPx,
      };
    }),
  };
}

export function getCardNewsTextOverlayRect(args: {
  box: { x: number; y: number; w: number; h: number };
  viewport: { left: number; top: number; scaleX: number; scaleY: number };
}) {
  return {
    left: args.viewport.left + args.box.x * args.viewport.scaleX,
    top: args.viewport.top + args.box.y * args.viewport.scaleY,
    width: args.box.w * args.viewport.scaleX,
    height: args.box.h * args.viewport.scaleY,
  };
}
