import { getMailEventExpiresAt } from "models/mail";
import { getMailRecipientHash } from "./emailHash";
import { parseSesEventNotification } from "./sesEventParser";
import type { SnsEnvelope } from "./snsEnvelope";
import type { MailEventStore, SesTopicContract } from "./sesEventTypes";

export async function processSesEventWithStore(input: {
  envelope: SnsEnvelope;
  topic: SesTopicContract;
  hashSecret: string;
  store: MailEventStore;
  receivedAt?: Date;
}) {
  const receivedAt = input.receivedAt ?? new Date();
  const event = parseSesEventNotification(input.envelope, input.topic);
  if (!event) return { accepted: true as const, ignored: true as const };

  const message = await input.store.findMessageBySesId(event.sesMessageId);
  const newsletterUniverseId = message?.newsletterUniverseId ?? event.newsletterUniverseId;
  const newsletterCampaignId = message?.newsletterCampaignId ?? event.newsletterCampaignId;
  const newsletterIssueId = message?.newsletterIssueId ?? event.newsletterIssueId;
  const engagementEvent = event.type === "open" || event.type === "click";
  const emailHash =
    message?.emailHash ??
    (engagementEvent && event.category === "newsletter"
      ? undefined
      : event.recipientEmail
        ? getMailRecipientHash(event.recipientEmail, input.hashSecret)
        : undefined);
  const stored = await input.store.upsertEvent({
    eventId: event.eventId,
    messageId: message?.messageId,
    sesMessageId: event.sesMessageId,
    type: event.type,
    category: event.category,
    configurationSet: event.configurationSet,
    eventAt: event.eventAt,
    receivedAt,
    emailHash,
    bounceType: event.bounceType,
    bounceSubType: event.bounceSubType,
    complaintFeedbackType: event.complaintFeedbackType,
    delayType: event.delayType,
    reasonCode: event.reasonCode,
    newsletterUniverseId,
    newsletterCampaignId,
    newsletterIssueId,
    expiresAt: getMailEventExpiresAt(receivedAt, event.category, event.type),
  });

  const deliverability =
    input.store.recordDeliverabilityEvent &&
    (event.type === "send" || event.type === "bounce" || event.type === "complaint")
      ? await input.store.recordDeliverabilityEvent({
          category: event.category,
          eventType: event.type,
          eventAt: event.eventAt,
          observedAt: receivedAt,
        })
      : undefined;

  const volume =
    input.store.recordMailVolumeEvent
      ? await input.store.recordMailVolumeEvent({
          eventId: event.eventId,
          category: event.category,
          configurationSet: event.configurationSet,
          eventType: event.type,
          eventAt: event.eventAt,
          observedAt: receivedAt,
        })
      : undefined;

  if (
    stored.created &&
    event.category === "newsletter" &&
    input.store.recordNewsletterPerformance &&
    newsletterUniverseId &&
    newsletterCampaignId &&
    newsletterIssueId
  ) {
    await input.store.recordNewsletterPerformance({
      universeId: newsletterUniverseId,
      campaignId: newsletterCampaignId,
      issueId: newsletterIssueId,
      eventType: event.type,
      eventAt: event.eventAt,
    });
  }

  let suppressionLatencyMs: number | undefined;
  let newsletterSuppressionSync:
    | { subscriberTransitioned: boolean; canceledMessages: number }
    | undefined;
  if (event.suppressionReason) {
    if (!emailHash) throw new Error("SES_SUPPRESSION_EMAIL_HASH_REQUIRED");
    await input.store.upsertSuppression({
      emailHash,
      reason: event.suppressionReason,
      sourceEventId: event.eventId,
      sesMessageId: event.sesMessageId,
      noteCode: event.bounceSubType ?? event.complaintFeedbackType,
    });
    if (event.category === "newsletter" || message?.templateKey === "newsletter.consent_notice") {
      newsletterSuppressionSync = await input.store.synchronizeNewsletterSuppression({
        emailHash,
        reason: event.suppressionReason,
        eventAt: event.eventAt,
        observedAt: receivedAt,
      });
    }
    suppressionLatencyMs = Math.max(0, receivedAt.getTime() - event.eventAt.getTime());
  }

  return {
    accepted: true as const,
    ignored: false as const,
    created: stored.created,
    eventId: event.eventId,
    eventType: event.type,
    suppressed: Boolean(event.suppressionReason),
    suppressionLatencyMs,
    newsletterSuppressionSync,
    deliverability,
    volume,
  };
}
