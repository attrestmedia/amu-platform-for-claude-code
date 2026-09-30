import { createHash } from "crypto";
import type { DecisionPoint, DecisionReasonCode } from "types/decision/decision";
import type { JevRuntimeControls } from "consts/system/jevRuntimeControls";

/**
 * @docHint
 * @purpose JEV 판단 호출의 순수 activation 정책
 * @process 설정·사용자·자격증명·circuit·rollout 게이트를 정해진 순서로 판정
 * @domain decision
 * @scope server
 */

export type DecisionControlsRead =
  | { readable: true; controls: JevRuntimeControls }
  | { readable: false };

export type DecisionActivationInput = {
  point: DecisionPoint | null;
  controlsRead: DecisionControlsRead;
  userSmartModeEnabled: boolean;
  credentialActive: boolean;
  circuitState: "closed" | "open" | "half-open";
  rolloutKey: string;
};

export type DecisionActivationResult =
  | { allowed: true; threshold: number | null; controls: JevRuntimeControls }
  | { allowed: false; reason: DecisionReasonCode };

/** 앞에서 정한 게이트 하나라도 닫히면 뒤의 상태를 평가하지 않는다. */
export function resolveDecisionActivation(input: DecisionActivationInput): DecisionActivationResult {
  const { point, controlsRead } = input;
  if (!point) return { allowed: false, reason: "unknown_point" };
  if (!controlsRead.readable) return { allowed: false, reason: "controls_unreadable" };

  const { controls } = controlsRead;
  if (controls.killSwitch) return { allowed: false, reason: "kill_switch" };
  if (!controls.providerEnabled) return { allowed: false, reason: "provider_disabled" };
  if (controls.services[point.service]?.enabled !== true) return { allowed: false, reason: "service_disabled" };

  const pointControls = controls.decisionPoints[point.id];
  if (pointControls?.enabled !== true) return { allowed: false, reason: "point_disabled" };
  if (!point.smartMode.supported || !input.userSmartModeEnabled) {
    return { allowed: false, reason: "user_opt_out" };
  }
  if (controls.dailyCogsUsdCap <= 0) return { allowed: false, reason: "cogs_cap_zero" };
  if (!input.credentialActive) return { allowed: false, reason: "credential_unavailable" };
  if (input.circuitState === "open") return { allowed: false, reason: "circuit_open" };

  const rolloutPercent = pointControls.rolloutPercent;
  const bucket = Number.parseInt(
    createHash("sha256").update(`${input.rolloutKey}:${point.id}`).digest("hex").slice(0, 8),
    16,
  ) % 100;
  if (bucket >= rolloutPercent) return { allowed: false, reason: "rollout_miss" };

  return { allowed: true, threshold: pointControls.threshold, controls };
}
