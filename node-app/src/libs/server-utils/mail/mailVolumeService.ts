import "server-only";

import {
  MAIL_VOLUME_ALERT_MIN_SENDS,
  MAIL_VOLUME_ALERT_SPIKE_MULTIPLIER,
  MAIL_VOLUME_ALERT_WEBHOOK_URL,
  MAIL_VOLUME_COST_PER_1000_USD,
  MAIL_VOLUME_DAILY_SEND_ALERT_THRESHOLD,
  MAIL_VOLUME_MONITOR_ENABLED,
  MONGODB_AMU_URL,
} from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MailEventSchema,
  MailVolumeDailySchema,
  MailVolumeEventSchema,
  type IMailEventDocument,
  type IMailVolumeDailyDocument,
  type IMailVolumeEventDocument,
  type MailEventType,
  type MailMessageCategory,
} from "models/mail";
import {
  estimatedCostMicros,
  evaluateMailVolumeAlert,
  mailVolumeCostUsd,
  mailVolumeDate,
  mailVolumeMetricForEvent,
} from "./mailVolumeCore";
import { sendMailVolumeAlert } from "./mailVolumeNotifier";

const VOLUME_MODEL = "MailVolumeDaily";
const VOLUME_EVENT_MODEL = "MailVolumeEvent";
const EVENT_MODEL = "MailEvent";
const VOLUME_RETENTION_DAYS = 400;

function volumeModel() {
  return getModel<IMailVolumeDailyDocument>(MONGODB_AMU_URL, VOLUME_MODEL, MailVolumeDailySchema, "mail_volume_daily");
}

function eventModel() {
  return getModel<IMailEventDocument>(MONGODB_AMU_URL, EVENT_MODEL, MailEventSchema, "mail_events");
}

function volumeEventModel() {
  return getModel<IMailVolumeEventDocument>(
    MONGODB_AMU_URL,
    VOLUME_EVENT_MODEL,
    MailVolumeEventSchema,
    "mail_volume_events",
  );
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function expiresAt(date: Date) {
  return new Date(date.getTime() + VOLUME_RETENTION_DAYS * 86_400_000);
}

function previousDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function seoulDateUtcRange(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("MAIL_VOLUME_MONTH_INVALID");
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { dateFrom: `${month}-01`, dateTo: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function daysRange(days: number) {
  const safeDays = Math.max(1, Math.min(400, Math.floor(days || 30)));
  const end = new Date();
  const start = new Date(end.getTime() - (safeDays - 1) * 86_400_000);
  return { dateFrom: mailVolumeDate(start), dateTo: mailVolumeDate(end), days: safeDays };
}

function sumRows(rows: Array<Pick<IMailVolumeDailyDocument, "sendCount" | "recipientCount" | "deliveryCount" | "bounceCount" | "complaintCount" | "rejectCount" | "duplicateSendCount" | "estimatedCostMicros">>) {
  return rows.reduce(
    (totals, row) => ({
      sendCount: totals.sendCount + Number(row.sendCount || 0),
      recipientCount: totals.recipientCount + Number(row.recipientCount || 0),
      deliveryCount: totals.deliveryCount + Number(row.deliveryCount || 0),
      bounceCount: totals.bounceCount + Number(row.bounceCount || 0),
      complaintCount: totals.complaintCount + Number(row.complaintCount || 0),
      rejectCount: totals.rejectCount + Number(row.rejectCount || 0),
      duplicateSendCount: totals.duplicateSendCount + Number(row.duplicateSendCount || 0),
      estimatedCostMicros: totals.estimatedCostMicros + Number(row.estimatedCostMicros || 0),
    }),
    {
      sendCount: 0,
      recipientCount: 0,
      deliveryCount: 0,
      bounceCount: 0,
      complaintCount: 0,
      rejectCount: 0,
      duplicateSendCount: 0,
      estimatedCostMicros: 0,
    },
  );
}

type MailVolumeTotals = {
  sendCount: number;
  recipientCount: number;
  deliveryCount: number;
  bounceCount: number;
  complaintCount: number;
  rejectCount: number;
  estimatedCostMicros: number;
  lastEventAt: Date | null;
};

export function getMailVolumeConfigurationForDiagnostics() {
  return {
    monitorEnabled: MAIL_VOLUME_MONITOR_ENABLED,
    costPer1000Usd: MAIL_VOLUME_COST_PER_1000_USD,
    dailySendAlertThreshold: MAIL_VOLUME_DAILY_SEND_ALERT_THRESHOLD,
    spikeMultiplier: MAIL_VOLUME_ALERT_SPIKE_MULTIPLIER,
    alertMinSends: MAIL_VOLUME_ALERT_MIN_SENDS,
    alertWebhookConfigured: Boolean(MAIL_VOLUME_ALERT_WEBHOOK_URL.trim()),
    costBasis: "ses_outbound_recipient_estimate",
  } as const;
}

export async function recordMailVolumeEvent(input: {
  eventId: string;
  category: MailMessageCategory;
  configurationSet: string;
  eventType: MailEventType;
  eventAt: Date;
  observedAt: Date;
}) {
  if (!MAIL_VOLUME_MONITOR_ENABLED) return { tracked: false as const, reason: "disabled" as const };
  const metric = mailVolumeMetricForEvent(input.eventType);
  if (!metric) return { tracked: false as const, reason: "unsupported_event" as const };

  const date = mailVolumeDate(input.eventAt);
  const VolumeEvent = await volumeEventModel();
  try {
    await VolumeEvent.create({
      eventId: input.eventId,
      date,
      category: input.category,
      configurationSet: input.configurationSet,
      metric,
      eventAt: input.eventAt,
      recipientCount: metric === "send" ? 1 : 0,
      estimatedCostMicros: metric === "send" ? estimatedCostMicros(1, MAIL_VOLUME_COST_PER_1000_USD) : 0,
      expiresAt: expiresAt(input.eventAt),
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  const [eventRows, duplicateRows] = await Promise.all([
    VolumeEvent.find({ date, category: input.category, configurationSet: input.configurationSet })
      .select("metric eventAt recipientCount estimatedCostMicros")
      .lean(),
    metric === "send"
      ? (await eventModel()).aggregate<{ duplicateSendCount: number }>([
          {
            $match: {
              category: input.category,
              configurationSet: input.configurationSet,
              type: "send",
              messageId: { $type: "string" },
              eventAt: { $gte: seoulDateUtcRange(date).start, $lt: seoulDateUtcRange(date).end },
            },
          },
          { $group: { _id: "$messageId", count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $group: { _id: null, duplicateSendCount: { $sum: { $subtract: ["$count", 1] } } } },
        ])
      : Promise.resolve([]),
  ]);
  const totals = eventRows.reduce<MailVolumeTotals>(
    (acc, row) => {
      switch (row.metric) {
        case "send":
          acc.sendCount += 1;
          break;
        case "delivery":
          acc.deliveryCount += 1;
          break;
        case "bounce":
          acc.bounceCount += 1;
          break;
        case "complaint":
          acc.complaintCount += 1;
          break;
        case "reject":
          acc.rejectCount += 1;
          break;
      }
      acc.recipientCount += Number(row.recipientCount || 0);
      acc.estimatedCostMicros += Number(row.estimatedCostMicros || 0);
      if (row.eventAt && (!acc.lastEventAt || row.eventAt > acc.lastEventAt)) acc.lastEventAt = row.eventAt;
      return acc;
    },
    {
      sendCount: 0,
      recipientCount: 0,
      deliveryCount: 0,
      bounceCount: 0,
      complaintCount: 0,
      rejectCount: 0,
      estimatedCostMicros: 0,
      lastEventAt: null as Date | null,
    } satisfies MailVolumeTotals,
  );
  const duplicateSendCount = duplicateRows[0]?.duplicateSendCount || 0;
  const Volume = await volumeModel();
  const row = await Volume.findOneAndUpdate(
    { date, category: input.category, configurationSet: input.configurationSet },
    {
      $setOnInsert: {
        date,
        category: input.category,
        configurationSet: input.configurationSet,
        sendCount: totals.sendCount,
        recipientCount: totals.recipientCount,
        deliveryCount: totals.deliveryCount,
        bounceCount: totals.bounceCount,
        complaintCount: totals.complaintCount,
        rejectCount: totals.rejectCount,
        duplicateSendCount,
        estimatedCostMicros: totals.estimatedCostMicros,
        expiresAt: expiresAt(input.eventAt),
      },
      $set: {
        sendCount: totals.sendCount,
        recipientCount: totals.recipientCount,
        deliveryCount: totals.deliveryCount,
        bounceCount: totals.bounceCount,
        complaintCount: totals.complaintCount,
        rejectCount: totals.rejectCount,
        duplicateSendCount,
        estimatedCostMicros: totals.estimatedCostMicros,
        lastEventAt: totals.lastEventAt || input.observedAt,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  if (!row) throw new Error("MAIL_VOLUME_ROLLUP_CREATE_FAILED");

  const previousRows = await Volume.find({
    category: input.category,
    configurationSet: input.configurationSet,
    date: { $gte: previousDate(date, 7), $lt: date },
  })
    .select("sendCount")
    .lean();
  const previousSevenDayAverage = previousRows.length
    ? previousRows.reduce((sum, item) => sum + Number(item.sendCount || 0), 0) / 7
    : 0;
  const decision = evaluateMailVolumeAlert({
    date,
    sendCount: row.sendCount,
    previousSevenDayAverage,
    lastAlertKey: row.lastAlertKey,
    settings: {
      dailySendAlertThreshold: MAIL_VOLUME_DAILY_SEND_ALERT_THRESHOLD,
      spikeMultiplier: MAIL_VOLUME_ALERT_SPIKE_MULTIPLIER,
      minSends: MAIL_VOLUME_ALERT_MIN_SENDS,
    },
  });
  if (!decision.shouldAlert || !decision.alertKey) {
    return {
      tracked: true as const,
      date,
      alerted: false,
      duplicateSendCount: row.duplicateSendCount,
      estimatedCostUsd: mailVolumeCostUsd(row.estimatedCostMicros),
    };
  }

  const claimed = await Volume.findOneAndUpdate(
    { _id: row._id, lastAlertKey: { $ne: decision.alertKey } },
    { $set: { lastAlertKey: decision.alertKey, lastAlertAt: input.observedAt, lastAlertReason: decision.reasons.join(",") } },
    { new: true },
  ).lean();
  if (!claimed) return { tracked: true as const, date, alerted: false, duplicateSendCount: row.duplicateSendCount };

  const alert = await sendMailVolumeAlert({
    category: input.category,
    date,
    configurationSet: input.configurationSet,
    sendCount: row.sendCount,
    previousSevenDayAverage,
    estimatedCostUsd: mailVolumeCostUsd(row.estimatedCostMicros),
    duplicateSendCount: row.duplicateSendCount,
    reasons: decision.reasons,
  });
  return {
    tracked: true as const,
    date,
    alerted: alert.status === "sent",
    alertStatus: alert.status,
    duplicateSendCount: row.duplicateSendCount,
    estimatedCostUsd: mailVolumeCostUsd(row.estimatedCostMicros),
  };
}

export async function getMailVolumeReport(input: { days?: number; month?: string }) {
  const range = input.month ? { ...monthRange(input.month), days: undefined } : daysRange(input.days ?? 30);
  const Volume = await volumeModel();
  const rows = await Volume.find({ date: { $gte: range.dateFrom, $lte: range.dateTo } })
    .sort({ date: 1, category: 1, configurationSet: 1 })
    .lean();
  const totals = sumRows(rows);
  return {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    days: range.days,
    month: input.month || null,
    costBasis: "ses_outbound_recipient_estimate",
    costPer1000Usd: MAIL_VOLUME_COST_PER_1000_USD,
    items: rows.map((row) => ({
      date: row.date,
      category: row.category,
      configurationSet: row.configurationSet,
      sendCount: row.sendCount,
      recipientCount: row.recipientCount,
      deliveryCount: row.deliveryCount,
      bounceCount: row.bounceCount,
      complaintCount: row.complaintCount,
      rejectCount: row.rejectCount,
      duplicateSendCount: row.duplicateSendCount,
      estimatedCostUsd: mailVolumeCostUsd(row.estimatedCostMicros),
      lastEventAt: row.lastEventAt?.toISOString() || null,
      lastAlertAt: row.lastAlertAt?.toISOString() || null,
      lastAlertReason: row.lastAlertReason || null,
    })),
    totals: {
      ...totals,
      estimatedCostUsd: mailVolumeCostUsd(totals.estimatedCostMicros),
    },
    asOf: new Date().toISOString(),
  };
}
