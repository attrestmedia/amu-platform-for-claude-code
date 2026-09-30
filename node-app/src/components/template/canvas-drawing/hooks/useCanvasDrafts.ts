"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  canvasDrawingClamp,
  clampCommentBubbleOffset,
  estimateCommentBoxSize,
  estimateCommentBubbleSize,
  getCanvasStageMetrics,
} from "../utils";
import type { Point } from "../CanvasDrawingTypes";
import type { useDrawingDoc } from "./useDrawingDoc";

export function useCanvasDrafts({
  stageRef,
  docApi,
  penColor,
  labelFontSize,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  docApi: ReturnType<typeof useDrawingDoc>;
  penColor: string;
  labelFontSize: number;
}) {
  const [commentDraftOpen, setCommentDraftOpen] = useState(false);
  const [commentDraftText, setCommentDraftText] = useState("");
  const commentDraftPointRef = useRef<Point | null>(null);
  const commentDraftTargetIdRef = useRef<string | null>(null);
  const [textDraftOpen, setTextDraftOpen] = useState(false);
  const [textDraftText, setTextDraftText] = useState("");
  const textDraftPointRef = useRef<Point | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!commentDraftOpen) return;
    const timer = setTimeout(() => commentTextareaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [commentDraftOpen]);

  useEffect(() => {
    if (!textDraftOpen) return;
    const timer = setTimeout(() => textTextareaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [textDraftOpen]);

  const closeCommentDraft = () => {
    setCommentDraftOpen(false);
    setCommentDraftText("");
    commentDraftPointRef.current = null;
    commentDraftTargetIdRef.current = null;
  };

  const closeTextDraft = () => {
    setTextDraftOpen(false);
    setTextDraftText("");
    textDraftPointRef.current = null;
  };

  const addCommentAtDraftPoint = () => {
    const stage = stageRef.current;
    const point = commentDraftPointRef.current;
    const text = commentDraftText.trim();
    if (!stage || !point || !text) return;
    const metrics = getCanvasStageMetrics(stage);
    const xNorm = canvasDrawingClamp(point.x / metrics.width, 0, 1);
    const yNorm = canvasDrawingClamp(point.y / metrics.height, 0, 1);
    const size = estimateCommentBubbleSize(text);
    const offset = clampCommentBubbleOffset({
      pinPx: { x: xNorm * metrics.width, y: yNorm * metrics.height },
      stageW: metrics.width,
      stageH: metrics.height,
      bubbleW: size.w,
      bubbleH: size.h,
      dx: 18,
      dy: -18,
      autoFlip: true,
    });
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      xNorm,
      yNorm,
      text,
      createdAt: Date.now(),
      kind: "bubble" as const,
      bubbleDx: offset.dx,
      bubbleDy: offset.dy,
      targetItemId: commentDraftTargetIdRef.current || null,
    };
    docApi.applyPush({ ...docApi.docRef.current, comments: [item, ...docApi.docRef.current.comments] });
    closeCommentDraft();
  };

  const addTextAtDraftPoint = () => {
    const stage = stageRef.current;
    const point = textDraftPointRef.current;
    const text = textDraftText.trim();
    if (!stage || !point || !text) return;
    const metrics = getCanvasStageMetrics(stage);
    const xNorm = canvasDrawingClamp(point.x / metrics.width, 0, 1);
    const yNorm = canvasDrawingClamp(point.y / metrics.height, 0, 1);
    const size = estimateCommentBoxSize({ text, kind: "label", fontSize: labelFontSize });
    const offset = clampCommentBubbleOffset({
      pinPx: { x: xNorm * metrics.width, y: yNorm * metrics.height },
      stageW: metrics.width,
      stageH: metrics.height,
      bubbleW: size.w,
      bubbleH: size.h,
      dx: 0,
      dy: 0,
      autoFlip: true,
    });
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      xNorm,
      yNorm,
      text,
      createdAt: Date.now(),
      kind: "label" as const,
      color: penColor,
      fontSize: labelFontSize,
      bubbleDx: offset.dx,
      bubbleDy: offset.dy,
      targetItemId: null,
    };
    docApi.applyPush({ ...docApi.docRef.current, comments: [item, ...docApi.docRef.current.comments] });
    closeTextDraft();
  };

  return {
    addCommentAtDraftPoint,
    addTextAtDraftPoint,
    closeCommentDraft,
    closeTextDraft,
    commentDraftOpen,
    commentDraftPointRef,
    commentDraftTargetIdRef,
    commentDraftText,
    commentTextareaRef,
    setCommentDraftOpen,
    setCommentDraftText,
    setTextDraftOpen,
    setTextDraftText,
    textDraftOpen,
    textDraftPointRef,
    textDraftText,
    textTextareaRef,
  };
}
