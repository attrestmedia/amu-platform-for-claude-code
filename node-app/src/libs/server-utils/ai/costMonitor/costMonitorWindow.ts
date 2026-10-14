/**
 * @docHint
 * @purpose 모니터 기간 preset을 제한된 UTC 구간으로 변환한다
 * @process preset 검증 후 고정된 길이의 시작·끝 시각을 반환한다
 * @domain ai
 * @scope server
 */

import { AI_COST_MONITOR_WINDOWS, type AiCostMonitorWindowPreset } from "types/ai";

export const MAX_WINDOW_ROWS = 50_000;

const WINDOW_MS: Record<AiCostMonitorWindowPreset, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export class AiCostMonitorWindowTooLargeError extends Error {
  readonly errorCode = "AI_COST_MONITOR_WINDOW_TOO_LARGE" as const;

  constructor() {
    super("AI cost monitor window contains too many billing rows.");
    this.name = "AiCostMonitorWindowTooLargeError";
  }
}

export function makeInvalidWindowError() {
  return Object.assign(new Error("Unsupported AI cost monitor window."), { errorCode: "INVALID_WINDOW" as const });
}

export function resolveCostMonitorWindow(preset: unknown, now = new Date()) {
  if (!AI_COST_MONITOR_WINDOWS.includes(preset as AiCostMonitorWindowPreset)) {
    throw makeInvalidWindowError();
  }

  const value = preset as AiCostMonitorWindowPreset;
  const to = new Date(now);
  const from = new Date(to.getTime() - WINDOW_MS[value]);
  return { preset: value, from, to };
}
