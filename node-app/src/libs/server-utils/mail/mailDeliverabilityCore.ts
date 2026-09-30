import type { MailMessageCategory } from "models/mail";

export interface MailDeliverabilitySettings {
  monitorEnabled: boolean;
  autoBlockEnabled: boolean;
  windowMinutes: number;
  minSends: number;
  /** 비율은 퍼센트 단위다. 예: 5 = 5%, 0.1 = 0.1%. */
  bounceRateThreshold: number;
  complaintRateThreshold: number;
  blockMinutes: number;
}

export interface MailDeliverabilityWindowState {
  category: MailMessageCategory;
  windowStart: Date;
  sendCount: number;
  bounceCount: number;
  complaintCount: number;
  blockedUntil?: Date | null;
  lastAlertKey?: string | null;
}

export interface MailDeliverabilityDecision {
  bounceRate: number;
  complaintRate: number;
  breached: boolean;
  reasons: readonly ("bounce" | "complaint")[];
  alertKey?: string;
  shouldAlert: boolean;
  shouldBlock: boolean;
  blockedUntil?: Date;
}

export function getMailDeliverabilityWindowStart(eventAt: Date, windowMinutes: number) {
  const windowMs = windowMinutes * 60_000;
  return new Date(Math.floor(eventAt.getTime() / windowMs) * windowMs);
}

export function isMailDeliverabilityAutoBlockConfigValid(settings: MailDeliverabilitySettings) {
  return (
    settings.windowMinutes >= 1 &&
    settings.minSends >= 1 &&
    settings.blockMinutes >= 1 &&
    (settings.bounceRateThreshold > 0 || settings.complaintRateThreshold > 0)
  );
}

function rate(count: number, sends: number) {
  return sends > 0 ? (count / sends) * 100 : 0;
}

export function evaluateMailDeliverabilityState(
  state: MailDeliverabilityWindowState,
  settings: MailDeliverabilitySettings,
  now: Date,
): MailDeliverabilityDecision {
  const sendCount = Math.max(0, state.sendCount);
  const bounceRate = rate(Math.max(0, state.bounceCount), sendCount);
  const complaintRate = rate(Math.max(0, state.complaintCount), sendCount);
  const reasons = [
    ...(settings.bounceRateThreshold > 0 && sendCount >= settings.minSends && bounceRate >= settings.bounceRateThreshold
      ? (["bounce"] as const)
      : []),
    ...(settings.complaintRateThreshold > 0 &&
    sendCount >= settings.minSends &&
    complaintRate >= settings.complaintRateThreshold
      ? (["complaint"] as const)
      : []),
  ];
  const breached = reasons.length > 0;
  const alertKey = breached ? `${state.category}:${state.windowStart.toISOString()}:${reasons.join(",")}` : undefined;
  const shouldAlert = Boolean(alertKey && state.lastAlertKey !== alertKey);
  const activeBlock = Boolean(state.blockedUntil && state.blockedUntil.getTime() > now.getTime());
  const shouldBlock =
    breached && settings.autoBlockEnabled && state.category === "newsletter" && !activeBlock;
  const blockedUntil = shouldBlock
    ? new Date(now.getTime() + settings.blockMinutes * 60_000)
    : undefined;

  return {
    bounceRate,
    complaintRate,
    breached,
    reasons,
    alertKey,
    shouldAlert,
    shouldBlock,
    blockedUntil,
  };
}
