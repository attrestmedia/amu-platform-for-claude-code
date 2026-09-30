"use client";

import React, { useEffect, useState } from "react";
import type { CommentItem } from "../CanvasDrawingTypes";
import { Lang } from "components/module/i18n";
import { clampCommentBubbleOffset, estimateCommentBoxSize, getCanvasStageMetrics } from "../utils";
import { cn } from "utils/common";
import { Type, X } from "lucide-react";
import { Button } from "@amu-labs/ui";

export function CommentLayer({
  stageRef,
  comments,
  selectedCommentId,
  onSelect,
  onDelete,
  onPointerDownPin,
  onPointerDownBubble,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  comments: CommentItem[];
  selectedCommentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onPointerDownPin?: (id: string, e: React.PointerEvent) => void;
  onPointerDownBubble?: (id: string, e: React.PointerEvent) => void;
}) {
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const apply = () => {
      const metrics = getCanvasStageMetrics(el);
      setStageSize({ w: metrics.width, h: metrics.height });
    };

    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    apply();

    return () => ro.disconnect();
  }, [stageRef]);

  const hasSize = stageSize.w > 0 && stageSize.h > 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {comments.map((c) => {
        const rawDx = c.bubbleDx ?? 18;
        const rawDy = c.bubbleDy ?? -18;
        const commentKind = c.kind || "bubble";
        const bs = estimateCommentBoxSize(c);

        // stage size가 없으면 그대로 렌더링
        const { dx, dy } = hasSize
          ? (() => {
              const pinPx = { x: c.xNorm * stageSize.w, y: c.yNorm * stageSize.h };
              return clampCommentBubbleOffset({
                pinPx,
                stageW: stageSize.w,
                stageH: stageSize.h,
                bubbleW: bs.w,
                bubbleH: bs.h,
                dx: rawDx,
                dy: rawDy,
                autoFlip: true,
              });
            })()
          : { dx: rawDx, dy: rawDy };

        const active = selectedCommentId === c.id;
        const isLeftSide = dx < 0; // dx가 음수면 "왼쪽"에 있다고 판단 → 꼬리 방향 반전

        if (commentKind === "label") {
          return (
            <div
              key={c.id}
              className="pointer-events-none absolute"
              style={{
                left: `${(c.xNorm * 100).toFixed(4)}%`,
                top: `${(c.yNorm * 100).toFixed(4)}%`,
              }}
            >
              <div
                className={cn(
                  "pointer-events-auto absolute touch-none rounded-lg border border-transparent px-2 py-1 shadow-sm",
                  active && "border-primary bg-background/35",
                )}
                style={{
                  left: dx,
                  top: dy,
                  width: bs.w,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(c.id);
                  onPointerDownBubble?.(c.id, e);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelect(c.id);
                }}
              >
                <div className="relative pr-7">
                  <p
                    className="whitespace-pre-wrap break-words font-bold leading-[1.2]"
                    style={{
                      color: c.color || "#ef4444",
                      fontSize: `${Math.max(12, Number(c.fontSize || 20))}px`,
                      textShadow: "0 1px 2px rgba(255,255,255,0.65)",
                    }}
                  >
                    {c.text}
                  </p>

                  <Button
                    className={cn(
                      "absolute -right-1 -top-1 h-6 w-6 rounded-full border p-0",
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-background/90",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                    aria-label="delete-label"
                    title="delete"
                  >
                    <Lang className="sr-only" text={{ ko: "텍스트 삭제", en: "Delete text" }} />
                    <X width={14} height={14} />
                  </Button>
                </div>

                {active && (
                  <div className="mt-1 flex items-center gap-1 text-xxs font-medium text-muted-foreground">
                    <Type className="h-3 w-3" />
                    <Lang text={{ ko: "텍스트 라벨", en: "Text label" }} />
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <div
            key={c.id}
            className="pointer-events-none absolute"
            style={{
              left: `${(c.xNorm * 100).toFixed(4)}%`,
              top: `${(c.yNorm * 100).toFixed(4)}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* 핀 */}
            <Button
              className={cn(
                "pointer-events-auto h-3.5 w-3.5 rounded-full border shadow-sm",
                active ? "border-primary bg-primary" : "bg-background",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(c.id);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(c.id);
                onPointerDownPin?.(c.id, e);
              }}
              style={{ touchAction: "none" }}
              aria-label="comment-pin"
              title={c.text}
            />

            {/* 버블 */}
            <div
              className="pointer-events-auto absolute"
              style={{
                left: dx + 7,
                top: dy + 7,
                width: bs.w,
                maxWidth: 260,
                touchAction: "none" as React.CSSProperties["touchAction"],
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(c.id);
                onPointerDownBubble?.(c.id, e);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect(c.id);
              }}
            >
              <div className={`relative rounded-xl border bg-surface-2 p-3 shadow-md ${active && "border-primary"}`}>
                {/* 꼬리 방향: 오른쪽에 있으면 left, 왼쪽에 있으면 right */}
                <div
                  className={cn(
                    "absolute top-1/2 h-3 -translate-y-1/2 w-3 rotate-45 border bg-surface-2",
                    active && "border-primary",
                    isLeftSide ? "border-b-0 border-l-0" : "border-t-0 border-r-0",
                  )}
                  style={isLeftSide ? { right: -6 } : { left: -6 }}
                />

                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-keep break-words leading-4 text-xs text-foreground">
                      {c.text}
                    </p>
                    {c.targetItemId && (
                      <p className="mt-2 text-xxs text-muted-foreground">
                        <Lang text={{ ko: "연결된 코멘트", en: "Linked comment" }} />
                      </p>
                    )}
                  </div>

                  <Button
                    className={cn(
                      "absolute -top-2 w-6 h-6 scale-[0.8]",
                      isLeftSide ? "-left-2" : "-right-2",
                      "rounded-full flex items-center justify-center  p-0",
                      "text-xs text-button-text border",
                      active ? "bg-primary border-primary" : "bg-muted",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                    aria-label="delete-comment"
                    title="delete"
                  >
                    <Lang className="sr-only" text={{ ko: "삭제", en: "Delete" }} />
                    <X width={16} height={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
