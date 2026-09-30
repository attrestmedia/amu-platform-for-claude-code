import "server-only";

import {
  incrementMarketingPerformanceDaily,
  listMarketingPerformanceDaily,
} from "libs/database/marketing";
import type { MailEventType } from "models/mail";

export const NEWSLETTER_PERFORMANCE_METRICS = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
] as const;
export type NewsletterPerformanceMetric = (typeof NEWSLETTER_PERFORMANCE_METRICS)[number];

const EVENT_METRIC: Partial<Record<MailEventType, NewsletterPerformanceMetric>> = {
  send: "sent",
  delivery: "delivered",
  open: "opened",
  click: "clicked",
  bounce: "bounced",
  complaint: "complained",
};

function safeString(value: unknown) {
  return String(value || "").trim();
}

export function newsletterPerformanceDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function newsletterMetricForSesEvent(eventType: MailEventType) {
  return EVENT_METRIC[eventType];
}

export async function recordNewsletterPerformanceEvent(input: {
  universeId: string;
  campaignId: string;
  issueId: string;
  eventType: MailEventType;
  eventAt: Date;
}) {
  const universeId = safeString(input.universeId);
  const campaignId = safeString(input.campaignId);
  const issueId = safeString(input.issueId);
  const metric = newsletterMetricForSesEvent(input.eventType);
  if (!universeId || !campaignId || !issueId || !metric) return { recorded: false as const };

  await incrementMarketingPerformanceDaily({
    universeId,
    channel: "email",
    date: newsletterPerformanceDate(input.eventAt),
    entityType: "campaign",
    entityId: campaignId,
    metric,
    meta: { metricBasis: "ses_event", source: "ses_event", issueId },
  });
  return { recorded: true as const, metric };
}

/** 해지는 SES event가 아니므로 subscriber 원장 변화에서 별도 집계한다. */
export async function recordNewsletterUnsubscribe(input: { occurredAt: Date }) {
  await incrementMarketingPerformanceDaily({
    universeId: "global",
    channel: "email",
    date: newsletterPerformanceDate(input.occurredAt),
    entityType: "campaign",
    entityId: "newsletter:global",
    metric: "unsubscribed",
    meta: { metricBasis: "consent_event", source: "newsletter_subscriber" },
  });
  return { recorded: true as const };
}

function numberMetric(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

export async function getNewsletterPerformance(input: { universeId: string; days: number }) {
  const universeId = safeString(input.universeId);
  if (!universeId) throw new Error("UNIVERSE_ID_REQUIRED");
  const days = Math.max(1, Math.min(180, Math.floor(input.days || 30)));
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const dateFrom = newsletterPerformanceDate(start);
  const dateTo = newsletterPerformanceDate(end);
  const rows = await listMarketingPerformanceDaily({
    universeId,
    channel: "email",
    entityType: "campaign",
    dateFrom,
    dateTo,
    limit: 500,
  });
  const globalRows =
    universeId === "global"
      ? []
      : await listMarketingPerformanceDaily({
          universeId: "global",
          channel: "email",
          entityType: "campaign",
          dateFrom,
          dateTo,
          entityId: "newsletter:global",
          limit: 500,
        });
  const items = [...rows, ...globalRows].map((row) => ({
    date: row.date,
    campaignId: row.entityId,
    issueId: safeString(row.meta?.issueId),
    metrics: row.metrics || {},
    meta: row.meta || {},
  }));
  const totals = NEWSLETTER_PERFORMANCE_METRICS.reduce<Record<string, number>>((acc, metric) => {
    acc[metric] = items.reduce((sum, row) => sum + numberMetric(row.metrics?.[metric]), 0);
    return acc;
  }, {});
  return {
    days,
    dateFrom,
    dateTo,
    items,
    totals,
    metricBasis: ["ses_event", "consent_event"],
    asOf: new Date().toISOString(),
  };
}

