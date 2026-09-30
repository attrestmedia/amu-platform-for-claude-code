"use client";

import { trackGaEvent } from "./ga4";

export type PlayAnalyticsEventName =
  | "landing_view"
  | "start_click"
  | "character_create_start"
  | "character_create_step"
  | "character_create_success"
  | "character_probability_viewed"
  | "npc_talk_start"
  | "npc_talk_end"
  | "intimacy_gain"
  | "return_visit"
  | "forge_dashboard_view"
  | "forge_step_open"
  | "forge_method_select"
  | "forge_cost_confirm"
  | "forge_world_asset_generate"
  | "forge_map_save";

type PlayEventParams = {
  universeId?: string;
  sourceType?: string;
  funnelAction?: string;
  funnelStatus?: string;
  outcome?: string;
  messageCount?: number;
  intimacyGain?: number;
  stepId?: string;
  stepStatusSummary?: string;
  method?: string;
  action?: string;
  quotedCoins?: number;
  tileCount?: number;
  category?: string;
  presetKey?: string;
  rulesetVersion?: number;
};

const LAST_VISIT_KEY = "amu:play:last-visit-at";
const SESSION_VISIT_KEY = "amu:play:visit-tracked";

function safeText(value: unknown, maxLength = 64): string {
  return String(value || "").trim().slice(0, maxLength);
}

function safeCount(value: unknown, max: number): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(max, Math.floor(number)));
}

export function buildPlayEventParams(params: PlayEventParams = {}) {
  return {
    universe_id: safeText(params.universeId),
    source_type: safeText(params.sourceType, 32),
    funnel_action: safeText(params.funnelAction, 32),
    funnel_status: safeText(params.funnelStatus, 32),
    outcome: safeText(params.outcome, 32),
    message_count: safeCount(params.messageCount, 100),
    intimacy_gain: safeCount(params.intimacyGain, 100),
    step_id: safeText(params.stepId, 32),
    step_status_summary: safeText(params.stepStatusSummary, 64),
    method: safeText(params.method, 32),
    action: safeText(params.action, 32),
    quoted_coins: safeCount(params.quotedCoins, 1_000_000),
    tile_count: safeCount(params.tileCount, 4_096),
    category: safeText(params.category, 32),
    preset_key: safeText(params.presetKey, 64),
    ruleset_version: safeCount(params.rulesetVersion, 10_000),
  };
}

export function trackPlayEvent(eventName: PlayAnalyticsEventName, params: PlayEventParams = {}) {
  return trackGaEvent(eventName, buildPlayEventParams(params));
}

export function trackPlayLandingVisit(now = Date.now()) {
  if (typeof window === "undefined") return { landing: false, returning: false };

  try {
    if (window.sessionStorage.getItem(SESSION_VISIT_KEY)) {
      return { landing: false, returning: false };
    }

    const previousVisit = Number(window.localStorage.getItem(LAST_VISIT_KEY) || 0);
    const returning = Number.isFinite(previousVisit) && previousVisit > 0 && previousVisit < now;
    window.sessionStorage.setItem(SESSION_VISIT_KEY, "1");
    window.localStorage.setItem(LAST_VISIT_KEY, String(now));

    trackPlayEvent("landing_view");
    if (returning) trackPlayEvent("return_visit");
    return { landing: true, returning };
  } catch {
    trackPlayEvent("landing_view");
    return { landing: true, returning: false };
  }
}
