import "server-only";

import { NEWSLETTER_CAMPAIGN_ENABLED } from "consts/env/server";
import type { IMailMessageError, MailMessageCategory } from "models/mail";
import type { MailProvider } from "./types";
import type { MailQueueJob, MailQueueStore, MailRateGate } from "./queueTypes";
import type { MailHeader } from "./types";
import { getNewsletterDeliverabilityGuard } from "./mailDeliverability";

export const MAIL_LEASE_MS = 60_000;

function errorDetails(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const reason = error instanceof Error ? error.message : String(error || "unknown_error");
  const status = Number(record.$metadata && typeof record.$metadata === "object" ? (record.$metadata as Record<string, unknown>).httpStatusCode : 0);
  const name = String(record.name || "");
  const retryable =
    status === 429 ||
    status >= 500 ||
    /timeout|throttl|temporar|network|econn|socket/i.test(`${name} ${reason}`) ||
    !status;
  return { code: name || "MAIL_SEND_FAILED", reason, retryable };
}

function payloadReplyTo(headers: unknown) {
  if (!headers || typeof headers !== "object") return undefined;
  const value = (headers as Record<string, unknown>).replyTo;
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function payloadHeaders(headers: unknown): readonly MailHeader[] | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const value = (headers as Record<string, unknown>).custom;
  if (!Array.isArray(value)) return undefined;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).name === "string" &&
      typeof (item as Record<string, unknown>).value === "string",
  )
    ? (value as MailHeader[])
    : undefined;
}

async function recordFailure(
  store: MailQueueStore,
  job: MailQueueJob,
  workerId: string,
  error: unknown,
  now: Date,
  code?: string,
) {
  const detail = errorDetails(error);
  return store.markError(
    job,
    workerId,
    {
      code: code ?? detail.code,
      reason: detail.reason.slice(0, 500),
      retryable: detail.retryable,
      occurredAt: now,
    } satisfies IMailMessageError,
    now,
  );
}

export async function processMailQueueOnce(input: {
  workerId: string;
  provider: MailProvider;
  store: MailQueueStore;
  rateGate: MailRateGate;
  resolveFromAddress: (category: MailMessageCategory) => string;
  now?: Date;
  leaseMs?: number;
  deliverabilityGuard?: typeof getNewsletterDeliverabilityGuard;
}) {
  const store = input.store;
  const rateGate = input.rateGate;
  const now = input.now ?? new Date();
  const job = await store.claim(input.workerId, now, input.leaseMs ?? MAIL_LEASE_MS);
  if (!job) return { status: "idle" as const };

  if (job.category === "newsletter") {
    try {
      const guard = await (input.deliverabilityGuard ?? getNewsletterDeliverabilityGuard)(now);
      if (guard.blocked) {
        const error: IMailMessageError = {
          code:
            guard.reason === "config_invalid"
              ? "MAIL_NEWSLETTER_DELIVERABILITY_CONFIG_INVALID"
              : "MAIL_NEWSLETTER_DELIVERABILITY_BLOCKED",
          reason: `newsletter dispatch paused by SES deliverability guard: ${guard.reason}`,
          retryable: true,
          occurredAt: now,
        };
        if (store.defer) {
          await store.defer(job, input.workerId, guard.blockedUntil, error, now);
          return { status: "retry_wait" as const, messageId: job.messageId, errorCode: error.code };
        }
        const status = await store.markError(job, input.workerId, error, now);
        return { status, messageId: job.messageId, errorCode: error.code };
      }
    } catch (error) {
      const status = await recordFailure(store, job, input.workerId, error, now, "MAIL_DELIVERABILITY_GUARD_UNAVAILABLE");
      return { status, messageId: job.messageId, errorCode: "MAIL_DELIVERABILITY_GUARD_UNAVAILABLE" };
    }
  }

  if (job.category === "newsletter") {
    const approval = job.payload.newsletterDispatch;
    if (
      !approval ||
      approval.mode !== "production" ||
      !approval.campaignId ||
      !approval.approvedBy ||
      !approval.approvalId
    ) {
      const status = await recordFailure(
        store,
        job,
        input.workerId,
        new Error("newsletter dispatch approval missing"),
        now,
        "MAIL_NEWSLETTER_APPROVAL_MISSING",
      );
      return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_APPROVAL_MISSING" };
    }
    if (!NEWSLETTER_CAMPAIGN_ENABLED) {
      const status = await recordFailure(
        store,
        job,
        input.workerId,
        new Error("newsletter campaign disabled"),
        now,
        "MAIL_NEWSLETTER_CAMPAIGN_DISABLED",
      );
      return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_CAMPAIGN_DISABLED" };
    }
    try {
      const { isNewsletterCampaignDispatchAuthorized } = await import("./newsletterCampaignService");
      const authorized = await isNewsletterCampaignDispatchAuthorized(approval);
      if (!authorized) {
        const status = await recordFailure(
          store,
          job,
          input.workerId,
          new Error("newsletter campaign approval does not match persisted campaign"),
          now,
          "MAIL_NEWSLETTER_APPROVAL_INVALID",
        );
        return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_APPROVAL_INVALID" };
      }
    } catch (error) {
      const status = await recordFailure(store, job, input.workerId, error, now, "MAIL_NEWSLETTER_APPROVAL_LOOKUP_FAILED");
      return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_APPROVAL_LOOKUP_FAILED" };
    }
  }

  let suppression;
  try {
    suppression = await store.findSuppression(
      job.emailHash,
      job.templateKey === "newsletter.consent_notice" ? "newsletter" : job.category,
    );
  } catch (error) {
    const status = await recordFailure(store, job, input.workerId, error, now, "MAIL_SUPPRESSION_LOOKUP_FAILED");
    return { status, messageId: job.messageId, errorCode: "MAIL_SUPPRESSION_LOOKUP_FAILED" };
  }
  if (suppression) {
    await store.markSuppressed(job, input.workerId, suppression, now);
    return { status: "suppressed" as const, messageId: job.messageId, reason: suppression.reason };
  }

  if (job.templateKey === "newsletter.consent_notice") {
    let eligible = false;
    try {
      const { isNewsletterConsentNoticeEligible } = await import("./newsletterSubscriberService");
      eligible = await isNewsletterConsentNoticeEligible(job.emailHash, job.messageId);
    } catch (error) {
      const status = await recordFailure(
        store,
        job,
        input.workerId,
        error,
        now,
        "MAIL_NEWSLETTER_CONSENT_NOTICE_LOOKUP_FAILED",
      );
      return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_CONSENT_NOTICE_LOOKUP_FAILED" };
    }
    if (!eligible) {
      const status = await store.markError(
        job,
        input.workerId,
        {
          code: "MAIL_NEWSLETTER_CONSENT_NOTICE_NOT_ELIGIBLE",
          reason: "newsletter subscriber is no longer eligible for the consent notice",
          retryable: false,
          occurredAt: now,
        },
        now,
      );
      return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_CONSENT_NOTICE_NOT_ELIGIBLE" };
    }
  }

  if (job.category === "newsletter") {
    let eligible = false;
    try {
      // transactional worker 테스트와 기동 경로가 뉴스레터 전용 DB 설정을 불필요하게 평가하지 않도록 지연 import한다.
      const { isNewsletterRecipientEligible } = await import("./newsletterSubscriberService");
      eligible = await isNewsletterRecipientEligible(job.emailHash);
    } catch (error) {
      const status = await recordFailure(store, job, input.workerId, error, now, "MAIL_NEWSLETTER_SUBSCRIBER_LOOKUP_FAILED");
      return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_SUBSCRIBER_LOOKUP_FAILED" };
    }
    if (!eligible) {
      const status = await store.markError(
        job,
        input.workerId,
        {
          code: "MAIL_NEWSLETTER_NOT_CONFIRMED",
          reason: "newsletter subscriber is not in subscribed state",
          retryable: false,
          occurredAt: now,
        },
        now,
      );
      return { status, messageId: job.messageId, errorCode: "MAIL_NEWSLETTER_NOT_CONFIRMED" };
    }
  }

  try {
    const attribution = job.payload.newsletterAttribution;
    const permit = await rateGate.acquire(now.getTime());
    if (!permit.allowed) {
      const rateError = new Error(`SES_RATE_LIMIT_WAIT_${permit.retryAfterMs}MS`);
      const status = await recordFailure(store, job, input.workerId, rateError, now, "MAIL_RATE_LIMIT_WAIT");
      return { status, messageId: job.messageId, errorCode: "MAIL_RATE_LIMIT_WAIT" };
    }

    const result = await input.provider.send({
      from: { address: input.resolveFromAddress(job.category), name: "All My Universe" },
      to: job.recipientEmail,
      replyTo: payloadReplyTo(job.payload.headers),
      headers: payloadHeaders(job.payload.headers),
      subject: job.payload.subject,
      text: job.payload.text ?? "",
      html: job.payload.html ?? "",
      configurationSet: job.configurationSet,
      tags: {
        category: job.category,
        ...(job.category === "newsletter" && attribution
          ? {
              "newsletter:universe_id": attribution.universeId,
              "newsletter:campaign_id": attribution.campaignId,
              "newsletter:issue_id": attribution.issueId,
            }
          : {}),
      },
    });
    await store.markSent(job, input.workerId, result.providerMessageId, now);
    if (job.templateKey === "newsletter.consent_notice") {
      const { markNewsletterConsentNoticeSent } = await import("./newsletterSubscriberService");
      await markNewsletterConsentNoticeSent(job.emailHash, job.messageId, now).catch(() => false);
    }
    return { status: "sent" as const, messageId: job.messageId };
  } catch (error) {
    const status = await recordFailure(store, job, input.workerId, error, now);
    return { status, messageId: job.messageId, errorCode: errorDetails(error).code };
  }
}
