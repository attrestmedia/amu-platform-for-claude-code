import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  getMailLedgerExpiresAt,
  getMailPayloadExpiresAt,
  getNewsletterConsentEvidenceExpiresAt,
  getNewsletterEmailPurgeAt,
  type IMailMessageDocument,
  type INewsletterSubscriberDocument,
  MailMessageSchema,
  NewsletterSubscriberSchema,
} from "models/mail";
import {
  getNewsletterSuppressionErrorCode,
  getNewsletterSuppressionStatusGuard,
  getNewsletterSuppressionTargetStatus,
  type NewsletterDeliverySuppressionReason,
} from "./newsletterSuppressionCore";

const EMAIL_HASH_PATTERN = /^[a-f0-9]{64}$/;

function subscriberModel() {
  return getModel<INewsletterSubscriberDocument>(
    MONGODB_AMU_URL,
    "NewsletterSubscriber",
    NewsletterSubscriberSchema,
    "newsletter_subscribers",
  );
}

function messageModel() {
  return getModel<IMailMessageDocument>(MONGODB_AMU_URL, "MailMessage", MailMessageSchema, "mail_messages");
}

export async function synchronizeNewsletterSuppression(input: {
  emailHash: string;
  reason: NewsletterDeliverySuppressionReason;
  eventAt: Date;
  observedAt: Date;
}) {
  if (!EMAIL_HASH_PATTERN.test(input.emailHash)) {
    throw new Error("NEWSLETTER_SUPPRESSION_EMAIL_HASH_INVALID");
  }

  const Subscriber = await subscriberModel();
  const subscriber = await Subscriber.findOne({ emailHash: input.emailHash })
    .select("_id status consentVersion")
    .lean();
  let subscriberTransitioned = false;

  if (subscriber) {
    const targetStatus = getNewsletterSuppressionTargetStatus(input.reason);
    const transition = await Subscriber.updateOne(
      {
        _id: subscriber._id,
        status: getNewsletterSuppressionStatusGuard(input.reason),
      },
      {
        $set: {
          status: targetStatus,
          confirmationTokenExpiresAt: null,
          emailPurgeAt: getNewsletterEmailPurgeAt(input.observedAt),
          emailPurgedAt: null,
          consentEvidenceExpiresAt: getNewsletterConsentEvidenceExpiresAt(input.observedAt),
          nextConsentNoticeAt: null,
          consentNoticeStatus: "scheduled",
          consentNoticeLeaseUntil: null,
          consentNoticeRetryAt: null,
          lastConsentNoticeQueuedAt: null,
          lastConsentNoticeDueAt: null,
        },
        $unset: {
          confirmationTokenHash: 1,
          unsubscribeTokenHash: 1,
          consentNoticeLeaseOwner: 1,
          lastConsentNoticeMessageId: 1,
          lastConsentNoticeUnsubscribeTokenHash: 1,
          consentNoticeUnsubscribeTokenHashes: 1,
        },
        $push: {
          consentHistory: {
            action: targetStatus,
            version: subscriber.consentVersion,
            method: "ses_event",
            source: "system",
            occurredAt: input.eventAt,
          },
        },
      },
    );
    subscriberTransitioned = transition.modifiedCount === 1;
  }

  const Message = await messageModel();
  const canceled = await Message.updateMany(
    {
      emailHash: input.emailHash,
      $or: [{ category: "newsletter" }, { templateKey: "newsletter.consent_notice" }],
      status: { $in: ["queued", "retry_wait"] },
    },
    {
      $set: {
        status: "canceled",
        completedAt: input.observedAt,
        payloadExpiresAt: getMailPayloadExpiresAt(input.observedAt),
        expiresAt: getMailLedgerExpiresAt(input.observedAt),
        leaseUntil: null,
        nextAttemptAt: null,
        lastError: {
          code: getNewsletterSuppressionErrorCode(input.reason),
          reason: `newsletter:${input.reason}`,
          retryable: false,
          occurredAt: input.observedAt,
        },
      },
      $unset: { leaseOwner: 1 },
    },
  );

  return {
    subscriberTransitioned,
    canceledMessages: canceled.modifiedCount,
  };
}
