/**
 * @docHint
 * @purpose CardNews display frame의 fit·zoom·wheel·pinch·pan·pointer 좌표 계약
 * @process frame/viewport size → stable layout → normalized pointer and anchored transforms
 * @domain card-news
 * @scope editor_state
 */

import { canvasDrawingClamp } from "libs/canvas/geometry";

export const CARD_NEWS_MIN_ZOOM = 0.5;
export const CARD_NEWS_MAX_ZOOM = 4;

export type CardNewsViewportState = {
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
  panX: number;
  panY: number;
};

export type CardNewsViewportLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
};

export type CardNewsPointerPoint = { x: number; y: number };

function safeDimension(value: number) {
  return Math.max(1, Number(value) || 1);
}

function clampZoom(value: number) {
  return canvasDrawingClamp(Number(value) || 1, CARD_NEWS_MIN_ZOOM, CARD_NEWS_MAX_ZOOM);
}

function distance(a: CardNewsPointerPoint, b: CardNewsPointerPoint) {
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

function midpoint(a: CardNewsPointerPoint, b: CardNewsPointerPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function createCardNewsViewportState(args: {
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom?: number;
  panX?: number;
  panY?: number;
}): CardNewsViewportState {
  return {
    frameWidth: safeDimension(args.frameWidth),
    frameHeight: safeDimension(args.frameHeight),
    viewportWidth: safeDimension(args.viewportWidth),
    viewportHeight: safeDimension(args.viewportHeight),
    zoom: clampZoom(args.zoom ?? 1),
    panX: Number(args.panX) || 0,
    panY: Number(args.panY) || 0,
  };
}

export function getCardNewsViewportLayout(state: CardNewsViewportState): CardNewsViewportLayout {
  const baseScale = Math.min(state.viewportWidth / state.frameWidth, state.viewportHeight / state.frameHeight);
  const scale = Math.max(Number.EPSILON, baseScale * clampZoom(state.zoom));
  const width = state.frameWidth * scale;
  const height = state.frameHeight * scale;
  return {
    left: (state.viewportWidth - width) / 2 + state.panX,
    top: (state.viewportHeight - height) / 2 + state.panY,
    width,
    height,
    scaleX: scale,
    scaleY: scale,
  };
}

export function fitCardNewsViewport(state: CardNewsViewportState, viewportWidth = state.viewportWidth, viewportHeight = state.viewportHeight) {
  return createCardNewsViewportState({
    ...state,
    viewportWidth,
    viewportHeight,
    zoom: 1,
    panX: 0,
    panY: 0,
  });
}

export function applyCardNewsViewportPan(state: CardNewsViewportState, deltaX: number, deltaY: number) {
  return { ...state, panX: state.panX + (Number(deltaX) || 0), panY: state.panY + (Number(deltaY) || 0) };
}

function zoomAtFrameAnchor(
  state: CardNewsViewportState,
  nextZoom: number,
  anchorFrame: CardNewsPointerPoint,
  anchorViewport: CardNewsPointerPoint,
) {
  const zoom = clampZoom(nextZoom);
  const withoutPan = { ...state, zoom, panX: 0, panY: 0 };
  const layout = getCardNewsViewportLayout(withoutPan);
  return {
    ...state,
    zoom,
    panX: anchorViewport.x - (layout.left + anchorFrame.x * layout.scaleX),
    panY: anchorViewport.y - (layout.top + anchorFrame.y * layout.scaleY),
  };
}

export function getCardNewsFramePointFromViewport(state: CardNewsViewportState, point: CardNewsPointerPoint) {
  const layout = getCardNewsViewportLayout(state);
  return {
    x: ((point.x - layout.left) / layout.width) * state.frameWidth,
    y: ((point.y - layout.top) / layout.height) * state.frameHeight,
  };
}

export function getCardNewsNormalizedPointerFromClient(args: {
  state: CardNewsViewportState;
  clientX: number;
  clientY: number;
  viewportRect: { left: number; top: number };
}) {
  const framePoint = getCardNewsFramePointFromViewport(args.state, {
    x: args.clientX - args.viewportRect.left,
    y: args.clientY - args.viewportRect.top,
  });
  return {
    x: framePoint.x / args.state.frameWidth,
    y: framePoint.y / args.state.frameHeight,
  };
}

export function zoomCardNewsViewportAt(state: CardNewsViewportState, nextZoom: number, viewportPoint: CardNewsPointerPoint) {
  const anchorFrame = getCardNewsFramePointFromViewport(state, viewportPoint);
  return zoomAtFrameAnchor(state, nextZoom, anchorFrame, viewportPoint);
}

export function applyCardNewsWheelZoom(state: CardNewsViewportState, deltaY: number, viewportPoint: CardNewsPointerPoint) {
  const delta = Number(deltaY) || 0;
  return zoomCardNewsViewportAt(state, state.zoom * Math.exp(-delta * 0.0015), viewportPoint);
}

export type CardNewsPinchGesture = {
  initialDistance: number;
  initialZoom: number;
  anchorFrame: CardNewsPointerPoint;
};

export function beginCardNewsPinch(state: CardNewsViewportState, first: CardNewsPointerPoint, second: CardNewsPointerPoint) {
  const anchorViewport = midpoint(first, second);
  return {
    initialDistance: distance(first, second),
    initialZoom: state.zoom,
    anchorFrame: getCardNewsFramePointFromViewport(state, anchorViewport),
  } satisfies CardNewsPinchGesture;
}

export function updateCardNewsPinch(
  state: CardNewsViewportState,
  gesture: CardNewsPinchGesture,
  first: CardNewsPointerPoint,
  second: CardNewsPointerPoint,
) {
  const nextZoom = gesture.initialZoom * (distance(first, second) / gesture.initialDistance);
  return zoomAtFrameAnchor(state, nextZoom, gesture.anchorFrame, midpoint(first, second));
}
