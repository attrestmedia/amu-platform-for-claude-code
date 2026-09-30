import type { MailEventType } from "models/mail";

export const MAIL_VOLUME_TRACKED_METRICS = ["send", "delivery", "bounce", "complaint", "reject"] as const;
export type MailVolumeMetric = (typeof MAIL_VOLUME_TRACKED_METRICS)[number];

export interface MailVolumeAlertSettings {
  dailySendAlertThreshold: number;
  spikeMultiplier: number;
  minSends: number;
}

export interface MailVolumeAlertDecision {
  breached: boolean;
  reasons: readonly ("daily_threshold" | "spike")[];
  alertKey?: string;
  shouldAlert: boolean;
}

const EVENT_METRIC: Partial<Record<MailEventType, MailVolumeMetric>> = {
  send: "send",
  delivery: "delivery",
  bounce: "bounce",
  complaint: "complaint",
  reject: "reject",
};

export function mailVolumeDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function mailVolumeMetricForEvent(eventType: MailEventType) {
  return EVENT_METRIC[eventType];
}

/** USD를 소수 오차 없이 micro-dollar 단위로 환산한다. */
export function costMicrosPerRecipient(costPerThousandUsd: number) {
  return Math.max(0, Math.round((costPerThousandUsd * 1_000_000) / 1_000));
}

export function estimatedCostMicros(recipientCount: number, costPerThousandUsd: number) {
  return Math.max(0, Math.round(recipientCount) * costMicrosPerRecipient(costPerThousandUsd));
}

/** 동일 messageId에 대한 추가 send event만 중복 발송 후보로 센다. */
export function duplicateSendExtraCount(sendEventCount: number) {
  return Math.max(0, Math.floor(sendEventCount) - 1);
}

export function evaluateMailVolumeAlert(input: {
  date: string;
  sendCount: number;
  previousSevenDayAverage: number;
  lastAlertKey?: string | null;
  settings: MailVolumeAlertSettings;
}): MailVolumeAlertDecision {
  const reasons = [
    ...(input.settings.dailySendAlertThreshold > 0 && input.sendCount >= input.settings.dailySendAlertThreshold
      ? (["daily_threshold"] as const)
      : []),
    ...(input.sendCount >= input.settings.minSends &&
    input.previousSevenDayAverage > 0 &&
    input.sendCount >= input.previousSevenDayAverage * input.settings.spikeMultiplier
      ? (["spike"] as const)
      : []),
  ];
  const breached = reasons.length > 0;
  const alertKey = breached ? `volume:${input.date}:${reasons.join(",")}` : undefined;
  return {
    breached,
    reasons,
    alertKey,
    shouldAlert: Boolean(alertKey && input.lastAlertKey !== alertKey),
  };
}

export function mailVolumeCostUsd(estimatedCostMicrosValue: number) {
  return Math.max(0, estimatedCostMicrosValue) / 1_000_000;
}
