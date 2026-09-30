import type { CommentItem, Point } from "../CanvasDrawingTypes";
import { measureTextLayoutSync } from "utils/common";
import { canvasDrawingClamp } from "./canvasEngine";

export const COMMENT_BUBBLE_MAX_W = 260;
export const COMMENT_BUBBLE_MIN_W = 160;

// 대략적인 버블 크기 추정(폭/높이)
export function estimateCommentBubbleSize(text: string) {
  const paddingX = 24;
  const paddingY = 24;
  const sideActionW = 54;
  const actionRow = 34;
  const contentMaxW = Math.max(40, COMMENT_BUBBLE_MAX_W - paddingX - sideActionW);

  const metrics = measureTextLayoutSync({
    text,
    preset: "canvas-comment",
    maxWidth: contentMaxW,
  });

  const contentW = Math.max(24, metrics.maxLineWidth);
  const wRaw = paddingX + sideActionW + contentW;
  const w = canvasDrawingClamp(wRaw, COMMENT_BUBBLE_MIN_W, COMMENT_BUBBLE_MAX_W);
  const h = Math.max(68, paddingY + metrics.lineCount * 16 + actionRow);

  return { w, h };
}

export function estimateCommentBoxSize(comment: Pick<CommentItem, "text" | "kind" | "fontSize">) {
  if ((comment.kind || "bubble") !== "label") {
    return estimateCommentBubbleSize(comment.text);
  }

  const fontSize = canvasDrawingClamp(Math.round(Number(comment.fontSize || 20) || 20), 12, 72);
  const lineHeight = Math.round(fontSize * 1.25);
  const metrics = measureTextLayoutSync({
    text: comment.text,
    preset: "canvas-label",
    maxWidth: 396,
    fontSizePx: fontSize,
    lineHeightPx: lineHeight,
    fontWeight: 700,
  });

  return {
    w: canvasDrawingClamp(Math.max(40, metrics.maxLineWidth) + 24, 72, 420),
    h: Math.max(fontSize + 18, metrics.lineCount * lineHeight + 18),
  };
}

// autoFlip “최적 후보 선택” 방식
export function clampCommentBubbleOffset(args: {
  pinPx: Point;
  stageW: number;
  stageH: number;
  bubbleW: number;
  bubbleH: number;
  dx: number;
  dy: number;
  gap?: number;
  margin?: number;
  autoFlip?: boolean;
}) {
  const gap = args.gap ?? 18;
  const margin = args.margin ?? 8;

  const minDx = margin - args.pinPx.x;
  const maxDx = args.stageW - margin - args.bubbleW - args.pinPx.x;
  const minDy = margin - args.pinPx.y;
  const maxDy = args.stageH - margin - args.bubbleH - args.pinPx.y;

  const clamp2 = (dx: number, dy: number) => ({
    dx: canvasDrawingClamp(dx, minDx, maxDx),
    dy: canvasDrawingClamp(dy, minDy, maxDy),
  });

  // autoFlip: “현재 dx/dy + 4방향 후보” 중에서
  // 클램프에 의해 얼마나 ‘밀리는지’(penalty)가 최소인 것을 선택
  if (args.autoFlip) {
    const candidates: Array<{ dx: number; dy: number }> = [
      { dx: args.dx, dy: args.dy },
      { dx: gap, dy: -gap },
      { dx: gap, dy: gap },
      { dx: -(args.bubbleW + gap), dy: -gap },
      { dx: -(args.bubbleW + gap), dy: gap },
      { dx: gap, dy: -(args.bubbleH + gap) },
      { dx: -(args.bubbleW + gap), dy: -(args.bubbleH + gap) },
    ];

    let best = { dx: args.dx, dy: args.dy };
    let bestPenalty = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      const clamped = clamp2(c.dx, c.dy);
      const penalty = Math.abs(clamped.dx - c.dx) + Math.abs(clamped.dy - c.dy);
      const dist = Math.abs(clamped.dx) + Math.abs(clamped.dy); // 핀과의 거리

      if (penalty < bestPenalty || (penalty === bestPenalty && dist < bestDistance)) {
        best = clamped;
        bestPenalty = penalty;
        bestDistance = dist;
      }
    }

    return best;
  }

  // autoFlip false: 클램프만
  return clamp2(args.dx, args.dy);
}
