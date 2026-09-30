import "server-only";

import {
  MAIL_DELIVERABILITY_ALERT_WEBHOOK_URL,
  MAIL_DELIVERABILITY_AUTO_BLOCK_ENABLED,
  MAIL_DELIVERABILITY_BLOCK_MINUTES,
  MAIL_DELIVERABILITY_BOUNCE_RATE_THRESHOLD,
  MAIL_DELIVERABILITY_COMPLAINT_RATE_THRESHOLD,
  MAIL_DELIVERABILITY_MIN_SENDS,
  MAIL_DELIVERABILITY_MONITOR_ENABLED,
  MAIL_DELIVERABILITY_WINDOW_MINUTES,
  MONGODB_AMU_URL,
} from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MailDeliverabilityStateSchema,
  MailEventSchema,
  type IMailDeliverabilityStateDocument,
  type IMailEventDocument,
  type MailEventType,
  type MailMessageCategory,
} from "models/mail";
import { evaluateMailDeliverabilityState, getMailDeliverabilityWindowStart, isMailDeliverabilityAutoBlockConfigValid } from "./mailDeliverabilityCore";
import { sendSesDeliverabilityAlert } from "./sesDeliverabilityNotifier";

const STATE_MODEL = "MailDeliverabilityState";
const EVENT_MODEL = "MailEvent";
const STATE_RETENTION_MS = 90 * 24 * 60 * 60_000;

function settings() {
  return {
    monitorEnabled: MAIL_DELIVERABILITY_MONITOR_ENABLED,
    autoBlockEnabled: MAIL_DELIVERABILITY_AUTO_BLOCK_ENABLED,
    windowMinutes: MAIL_DELIVERABILITY_WINDOW_MINUTES,
    minSends: MAIL_DELIVERABILITY_MIN_SENDS,
    bounceRateThreshold: MAIL_DELIVERABILITY_BOUNCE_RATE_THRESHOLD,
    complaintRateThreshold: MAIL_DELIVERABILITY_COMPLAINT_RATE_THRESHOLD,
    blockMinutes: MAIL_DELIVERABILITY_BLOCK_MINUTES,
  };
}

function stateModel() {
  return getModel<IMailDeliverabilityStateDocument>(
    MONGODB_AMU_URL,
    STATE_MODEL,
    MailDeliverabilityStateSchema,
    "mail_deliverability_states",
  );
}

function eventModel() {
  return getModel<IMailEventDocument>(MONGODB_AMU_URL, EVENT_MODEL, MailEventSchema, "mail_events");
}

function shouldTrack(eventType: MailEventType) {
  return eventType === "send" || eventType === "bounce" || eventType === "complaint";
}

function stateExpiresAt(windowStart: Date, windowMinutes: number) {
  return new Date(windowStart.getTime() + windowMinutes * 60_000 + STATE_RETENTION_MS);
}

export async function recordMailDeliverabilityEvent(input: {
  category: MailMessageCategory;
  eventType: MailEventType;
  eventAt: Date;
  observedAt: Date;
}) {
  const config = settings();
  if (!config.monitorEnabled && !config.autoBlockEnabled) return { tracked: false as const, reason: "disabled" as const };
  if (!shouldTrack(input.eventType)) return { tracked: false as const, reason: "unsupported_event" as const };

  const windowStart = getMailDeliverabilityWindowStart(input.eventAt, config.windowMinutes);
  const windowEnd = new Date(windowStart.getTime() + config.windowMinutes * 60_000);
  const State = await stateModel();
  const Event = await eventModel();
  const state = await State.findOneAndUpdate(
    { category: input.category, windowStart },
    {
      $setOnInsert: {
        category: input.category,
        windowStart,
        sendCount: 0,
        bounceCount: 0,
        complaintCount: 0,
        expiresAt: stateExpiresAt(windowStart, config.windowMinutes),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  if (!state) throw new Error("MAIL_DELIVERABILITY_STATE_CREATE_FAILED");

  const eventWindow = { $gte: windowStart, $lt: windowEnd };
  const [sendCount, bounceCount, complaintCount] = await Promise.all([
    Event.countDocuments({ category: input.category, type: "send", eventAt: eventWindow }),
    // AWS SES bounce rate는 hard/permanent bounce만 분모에 반영한다.
    Event.countDocuments({ category: input.category, type: "bounce", bounceType: "Permanent", eventAt: eventWindow }),
    Event.countDocuments({ category: input.category, type: "complaint", eventAt: eventWindow }),
  ]);
  await State.updateOne(
    { _id: state._id },
    {
      $set: {
        sendCount,
        bounceCount,
        complaintCount,
        lastEventAt: input.observedAt,
      },
    },
  );

  const decision = evaluateMailDeliverabilityState(
    {
      category: input.category,
      windowStart,
      sendCount,
      bounceCount,
      complaintCount,
      blockedUntil: state.blockedUntil,
      lastAlertKey: state.lastAlertKey,
    },
    config,
    input.observedAt,
  );
  if (!decision.breached || (!decision.shouldAlert && !decision.shouldBlock)) {
    return { tracked: true as const, breached: decision.breached, alerted: false, blocked: Boolean(state.blockedUntil) };
  }

  const claimFilter = {
    _id: state._id,
    $or: [
      ...(decision.shouldAlert ? [{ lastAlertKey: { $ne: decision.alertKey } }] : []),
      ...(decision.shouldBlock ? [{ blockedUntil: null }, { blockedUntil: { $lte: input.observedAt } }] : []),
    ],
  };
  const claimUpdate: Record<string, unknown> = { $set: {} };
  const setFields = claimUpdate.$set as Record<string, unknown>;
  if (decision.shouldAlert && decision.alertKey) {
    setFields.lastAlertKey = decision.alertKey;
    setFields.lastAlertAt = input.observedAt;
  }
  if (decision.shouldBlock && decision.blockedUntil) {
    setFields.blockedUntil = decision.blockedUntil;
    setFields.blockReason = decision.reasons.join(",");
  }
  const claimed = await State.findOneAndUpdate(claimFilter, claimUpdate, { new: true }).lean();
  if (!claimed) {
    return { tracked: true as const, breached: true, alerted: false, blocked: Boolean(state.blockedUntil) };
  }

  await sendSesDeliverabilityAlert({
    category: input.category,
    windowStart,
    sendCount,
    bounceCount,
    complaintCount,
    bounceRate: decision.bounceRate,
    complaintRate: decision.complaintRate,
    reasons: decision.reasons,
    blockedUntil: decision.blockedUntil,
  });
  return {
    tracked: true as const,
    breached: true,
    alerted: decision.shouldAlert,
    blocked: decision.shouldBlock,
    blockedUntil: decision.blockedUntil,
  };
}

export async function getNewsletterDeliverabilityGuard(now = new Date()) {
  const config = settings();
  if (!config.autoBlockEnabled) return { blocked: false as const };
  if (!isMailDeliverabilityAutoBlockConfigValid(config)) {
    return {
      blocked: true as const,
      reason: "config_invalid" as const,
      blockedUntil: new Date(now.getTime() + config.blockMinutes * 60_000),
    };
  }

  const State = await stateModel();
  const state = await State.findOne({ category: "newsletter", blockedUntil: { $gt: now } })
    .sort({ windowStart: -1 })
    .select("blockedUntil blockReason")
    .lean();
  if (!state?.blockedUntil) return { blocked: false as const };
  return {
    blocked: true as const,
    reason: state.blockReason || "threshold_exceeded",
    blockedUntil: state.blockedUntil,
  };
}

export function getMailDeliverabilityConfigurationForDiagnostics() {
  const config = settings();
  return {
    monitorEnabled: config.monitorEnabled,
    autoBlockEnabled: config.autoBlockEnabled,
    windowMinutes: config.windowMinutes,
    minSends: config.minSends,
    bounceRateThreshold: config.bounceRateThreshold,
    complaintRateThreshold: config.complaintRateThreshold,
    blockMinutes: config.blockMinutes,
    alertWebhookConfigured: Boolean(MAIL_DELIVERABILITY_ALERT_WEBHOOK_URL.trim()),
  };
}
