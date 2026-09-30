"use client";

import React from "react";
import type { CursorIcon, CursorMode, Tool } from "../CanvasDrawingTypes";
import { getCSSVariable } from "utils/data";

function svgCursor(icon: CursorIcon) {
  const svgColor = getCSSVariable("--text-secondary");
  const svg =
    icon === "brush"
      ? `<svg fill="${svgColor}" viewBox="0 0 24.00 24.00" xmlns="http://www.w3.org/2000/svg" stroke="${svgColor}" stroke-width="0.00024000000000000003">
          <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
          <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round" stroke="${svgColor}" stroke-width="0.336"></g>
          <g id="SVGRepo_iconCarrier"> 
            <g data-name="Layer 2"> 
              <g data-name="brush"> 
                <rect width="24" height="24" opacity="0"></rect> 
                <path d="M20 6.83a2.76 2.76 0 0 0-.82-2 2.89 2.89 0 0 0-4 0l-6.6 6.6h-.22a4.42 4.42 0 0 0-4.3 4.31L4 19a1 1 0 0 0 .29.73A1.05 1.05 0 0 0 5 20l3.26-.06a4.42 4.42 0 0 0 4.31-4.3v-.23l6.61-6.6A2.74 2.74 0 0 0 20 6.83zM8.25 17.94L6 18v-2.23a2.4 2.4 0 0 1 2.4-2.36 2.15 2.15 0 0 1 2.15 2.19 2.4 2.4 0 0 1-2.3 2.34zm9.52-10.55l-5.87 5.87a4.55 4.55 0 0 0-.52-.64 3.94 3.94 0 0 0-.64-.52l5.87-5.86a.84.84 0 0 1 1.16 0 .81.81 0 0 1 .23.59.79.79 0 0 1-.23.56z"></path> 
              </g> 
            </g> 
          </g>
        </svg>`
      : `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
          <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
          <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
          <g id="SVGRepo_iconCarrier"> 
            <path stroke="${svgColor}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 7.5l3 3M4 20v-3.5L15.293 5.207a1 1 0 011.414 0l2.086 2.086a1 1 0 010 1.414L7.5 20H4z"></path> 
          </g>
        </svg>`;

  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `url("data:image/svg+xml,${encoded}") 2 22, crosshair`;
}

export function getStageCursorStyle(args: {
  cursorMode: CursorMode;
  cursorIcon: CursorIcon;
  tool: Tool;
  capturing?: boolean;
}) {
  const { cursorMode, cursorIcon, tool, capturing } = args;

  if (capturing) return "crosshair";
  if (tool === "hand") return "grab";
  if (cursorMode === "pointer") return "default";

  const isDrawCursor = tool === "pen" || tool === "eraser";

  if (cursorMode === "circle") {
    if (isDrawCursor) return "none";
    if (tool === "select") return "default";
    return "crosshair";
  }

  // icon mode
  if (isDrawCursor) return svgCursor(cursorIcon);
  if (tool === "select") return "default";
  return "crosshair";
}

export function CursorOverlay({
  mode,
  tool,
  penSize,
  pos,
}: {
  mode: CursorMode;
  tool: Tool;
  penSize: number;
  pos: { x: number; y: number } | null;
}) {
  if (mode !== "circle") return null;
  if (!pos) return null;

  const show = tool === "pen" || tool === "eraser";
  if (!show) return null;

  const size = Math.max(6, penSize);
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        className="absolute rounded-full border border-foreground/60 bg-foreground/10"
        style={{
          left: pos.x,
          top: pos.y,
          width: size,
          height: size,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
