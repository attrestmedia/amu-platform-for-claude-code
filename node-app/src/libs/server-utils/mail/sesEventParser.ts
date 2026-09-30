import { isUnknownRecord } from "utils/common";
import type { SnsEnvelope } from "./snsEnvelope";
import type { NormalizedSesEvent, SesTopicContract } from "./sesEventTypes";

const EVENT_TYPE_MAP = {
  Send: "send",
  Delivery: "delivery",
  Bounce: "bounce",
  Complaint: "complaint",
  Open: "open",
  Click: "click",
  DeliveryDelay: "delivery_delay",
  Reject: "reject",
} as const;

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredDate(value: unknown, fallback: string) {
  const parsed = new Date(typeof value === "string" ? value : fallback);
  if (Number.isNaN(parsed.getTime())) throw new Error("SES_EVENT_TIMESTAMP_INVALID");
  return parsed;
}

function firstString(value: unknown) {
  return Array.isArray(value) ? optionalString(value[0]) : undefined;
}

function firstRecipient(container: Record<string, unknown>, key: string) {
  const rows = Array.isArray(container[key]) ? container[key] : [];
  const first = rows[0];
  return isUnknownRecord(first) ? optionalString(first.emailAddress) : undefined;
}

export function parseSesEventNotification(
  envelope: SnsEnvelope,
  topic: SesTopicContract,
): NormalizedSesEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope.Message);
  } catch {
    throw new Error("SES_EVENT_MESSAGE_JSON_INVALID");
  }
  if (!isUnknownRecord(parsed)) throw new Error("SES_EVENT_MESSAGE_INVALID");
  const rawEventType = optionalString(parsed.eventType ?? parsed.notificationType);
  const type = rawEventType ? EVENT_TYPE_MAP[rawEventType as keyof typeof EVENT_TYPE_MAP] : undefined;
  if (!type) return null;

  const mail = isUnknownRecord(parsed.mail) ? parsed.mail : {};
  const sesMessageId = optionalString(mail.messageId);
  if (!sesMessageId) throw new Error("SES_EVENT_MESSAGE_ID_REQUIRED");
  const tags = isUnknownRecord(mail.tags) ? mail.tags : {};
  const configurationSet = firstString(tags["ses:configuration-set"]);
  if (configurationSet !== topic.configurationSet) throw new Error("SES_EVENT_CONFIGURATION_SET_MISMATCH");

  const detailKey = rawEventType === "DeliveryDelay" ? "deliveryDelay" : String(rawEventType || "").toLowerCase();
  const detail = isUnknownRecord(parsed[detailKey]) ? (parsed[detailKey] as Record<string, unknown>) : {};
  const bounceType = type === "bounce" ? optionalString(detail.bounceType) : undefined;
  const recipientEmail =
    (type === "bounce" ? firstRecipient(detail, "bouncedRecipients") : undefined) ??
    (type === "complaint" ? firstRecipient(detail, "complainedRecipients") : undefined) ??
    firstString(mail.destination);
  const reasonCode =
    (type === "bounce" && Array.isArray(detail.bouncedRecipients) && isUnknownRecord(detail.bouncedRecipients[0])
      ? optionalString(detail.bouncedRecipients[0].status)
      : undefined) ??
    (type === "reject" ? optionalString(detail.reason) : undefined);

  return {
    eventId: envelope.MessageId,
    sesMessageId,
    type,
    category: topic.category,
    configurationSet,
    eventAt: requiredDate(detail.timestamp, optionalString(mail.timestamp) ?? envelope.Timestamp),
    recipientEmail,
    bounceType,
    bounceSubType: type === "bounce" ? optionalString(detail.bounceSubType) : undefined,
    complaintFeedbackType: type === "complaint" ? optionalString(detail.complaintFeedbackType) : undefined,
    delayType: type === "delivery_delay" ? optionalString(detail.delayType) : undefined,
    reasonCode,
    newsletterUniverseId: firstString(tags["newsletter:universe_id"]),
    newsletterCampaignId: firstString(tags["newsletter:campaign_id"]),
    newsletterIssueId: firstString(tags["newsletter:issue_id"]),
    suppressionReason:
      type === "complaint"
        ? "complaint"
        : type === "bounce" && bounceType?.toLowerCase() === "permanent"
          ? "hard_bounce"
          : undefined,
  };
}
