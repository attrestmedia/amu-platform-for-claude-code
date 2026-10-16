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

  if (!isDecisionRolloutHit(input.rolloutKey, point.id, pointControls.rolloutPercent)) {
    return { allowed: false, reason: "rollout_miss" };
  }

  return { allowed: true, threshold: pointControls.threshold, controls };
}

/*
 * 런타임 경로용 3단계 게이트(JEV-116 R1). I/O 없는 판정을 먼저 끝내야 기본 OFF·opt-out 사용자에게
 * controls(DB)·circuit(Redis)·credential 조회 비용이 들지 않는다. 귀결은 resolveDecisionActivation 과 같고
 * 실패 reason 의 우선순위만 I/O 비용 순으로 달라진다.
 */

export type DecisionGateResult = { allowed: true } | { allowed: false; reason: DecisionReasonCode };

/** 1단계 — I/O 없음. 지점 존재와 사용자 opt-in 만 본다. */
export function resolveDecisionPreIoGate(input: {
  point: DecisionPoint | null;
  userSmartModeEnabled: boolean;
}): DecisionGateResult {
  if (!input.point) return { allowed: false, reason: "unknown_point" };
  if (!input.point.smartMode.supported || !input.userSmartModeEnabled) return { allowed: false, reason: "user_opt_out" };
  return { allowed: true };
}

export function isDecisionRolloutHit(rolloutKey: string, pointId: string, rolloutPercent: number): boolean {
  const bucket = Number.parseInt(
    createHash("sha256").update(`${rolloutKey}:${pointId}`).digest("hex").slice(0, 8),
    16,
  ) % 100;
  return bucket < rolloutPercent;
}

/** 2단계 — controls 한 번 읽은 값만 쓴다. rollout 은 순수 해시라 여기서 끝낸다. */
export function resolveDecisionControlsGate(input: {
  point: DecisionPoint;
  controlsRead: DecisionControlsRead;
  rolloutKey: string;
}): DecisionActivationResult {
  const { point, controlsRead } = input;
  if (!controlsRead.readable) return { allowed: false, reason: "controls_unreadable" };

  const { controls } = controlsRead;
  if (controls.killSwitch) return { allowed: false, reason: "kill_switch" };
  if (!controls.providerEnabled) return { allowed: false, reason: "provider_disabled" };
  if (controls.services[point.service]?.enabled !== true) return { allowed: false, reason: "service_disabled" };

  const pointControls = controls.decisionPoints[point.id];
  if (pointControls?.enabled !== true) return { allowed: false, reason: "point_disabled" };
  if (controls.dailyCogsUsdCap <= 0) return { allowed: false, reason: "cogs_cap_zero" };
  if (!isDecisionRolloutHit(input.rolloutKey, point.id, pointControls.rolloutPercent)) {
    return { allowed: false, reason: "rollout_miss" };
  }

  return { allowed: true, threshold: pointControls.threshold, controls };
}

/** 3단계 — 앞 단계를 통과한 지점만 자격증명·circuit 을 읽는다. */
export function resolveDecisionPostIoGate(input: {
  credentialActive: boolean;
  circuitState: "closed" | "open" | "half-open";
}): DecisionGateResult {
  if (!input.credentialActive) return { allowed: false, reason: "credential_unavailable" };
  if (input.circuitState === "open") return { allowed: false, reason: "circuit_open" };
  return { allowed: true };
}
