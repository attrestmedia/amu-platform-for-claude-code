import "server-only";

import crypto from "node:crypto";
import {
  CREDENTIALS_KMS_KEY,
  MONGODB_AMU_URL,
  NEWSLETTER_CAMPAIGN_ENABLED,
  NEWSLETTER_CONFIRMATION_TOKEN_TTL_MINUTES,
  NEWSLETTER_CONSENT_VERSION,
  NEWSLETTER_TEST_RECIPIENT_EMAIL,
  NEWSLETTER_SUBSCRIPTION_ENABLED,
  NEXTAUTH_URL,
} from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  getNewsletterConsentEvidenceExpiresAt,
  getNewsletterEmailPurgeAt,
  getMailLedgerExpiresAt,
  getMailPayloadExpiresAt,
  getFollowingNewsletterConsentNoticeAt,
  resolveNewsletterConsentNoticeSchedule,
  formatNewsletterConsentDateKst,
  isNewsletterConsentNoticeEnqueueStatusAccepted,
  MailSuppressionSchema,
  MailMessageSchema,
  NewsletterSubscriberSchema,
  type IMailMessageDocument,
  type IMailSuppressionDocument,
  type INewsletterSubscriberDocument,
  type NewsletterConsentAction,
  type NewsletterConsentMethod,
  type NewsletterSubscriptionSource,
} from "models/mail";
import { getMailRecipientHash } from "./emailHash";
import { enqueueMail } from "./mailQueue";
import { renderMailTemplate, type NewsletterIssueData } from "./templates";
import { buildNewsletterTrackedContent } from "./newsletterTracking";
import { recordNewsletterUnsubscribe } from "./newsletterPerformanceService";
import type { EnqueueMailInput, NewsletterDispatchAuthorization } from "./queueTypes";
import type { MailHeader } from "./types";

const NEWSLETTER_MODEL = "NewsletterSubscriber";
const SUPPRESSION_MODEL = "NewsletterMailSuppression";
const MESSAGE_MODEL = "NewsletterConsentNoticeMailMessage";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT_NOTICE_LEASE_MS = 5 * 60_000;
const CONSENT_NOTICE_RETRY_MS = 15 * 60_000;
const CONSENT_NOTICE_SWEEP_LIMIT = 100;

type NewsletterConsentNoticeDependencies = {
  model?: Awaited<ReturnType<typeof subscriberModel>>;
  messageModel?: Awaited<ReturnType<typeof messageModel>>;
  enqueue?: typeof enqueueMail;
};

export class NewsletterSubscriptionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: string, status = 400, retryable = false) {
    super(code);
    this.name = "NewsletterSubscriptionError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function subscriberModel() {
  return getModel<INewsletterSubscriberDocument>(
    MONGODB_AMU_URL,
    NEWSLETTER_MODEL,
    NewsletterSubscriberSchema,
    "newsletter_subscribers",
  );
}

function suppressionModel() {
  return getModel<IMailSuppressionDocument>(MONGODB_AMU_URL, SUPPRESSION_MODEL, MailSuppressionSchema, "mail_suppressions");
}

function messageModel() {
  return getModel<IMailMessageDocument>(MONGODB_AMU_URL, MESSAGE_MODEL, MailMessageSchema, "mail_messages");
}

export function isNewsletterSubscriptionEnabled() {
  return NEWSLETTER_SUBSCRIPTION_ENABLED;
}

export function isNewsletterCampaignEnabled() {
  return NEWSLETTER_CAMPAIGN_ENABLED;
}

export function getNewsletterConsentVersion() {
  return NEWSLETTER_CONSENT_VERSION;
}

export function normalizeNewsletterEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 320) {
    throw new NewsletterSubscriptionError("INVALID_NEWSLETTER_EMAIL", 400);
  }
  return normalized;
}

export function assertNewsletterTestRecipient(recipientEmail: string, configuredEmail = NEWSLETTER_TEST_RECIPIENT_EMAIL) {
  const recipient = normalizeNewsletterEmail(recipientEmail);
  const configured = configuredEmail.trim() ? normalizeNewsletterEmail(configuredEmail) : "";
  if (!configured) throw new NewsletterSubscriptionError("NEWSLETTER_TEST_RECIPIENT_NOT_CONFIGURED", 409);
  if (recipient !== configured) throw new NewsletterSubscriptionError("NEWSLETTER_TEST_RECIPIENT_NOT_ALLOWED", 403);
  return recipient;
}

export function hashNewsletterToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueNewsletterToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashNewsletterIp(ip: string | undefined) {
  const normalized = String(ip || "").trim();
  if (!normalized) return undefined;
  return crypto.createHmac("sha256", CREDENTIALS_KMS_KEY).update(`newsletter-ip:v1:${normalized}`, "utf8").digest("hex");
}

function newsletterUrl(path: string, token: string) {
  const url = new URL(path, NEXTAUTH_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

export function newsletterConfirmationUrl(token: string) {
  return newsletterUrl("/api/newsletter/confirm", token);
}

export function newsletterUnsubscribeUrl(token: string) {
  return newsletterUrl("/api/newsletter/unsubscribe", token);
}

export function buildNewsletterMailHeaders(unsubscribeUrl: string): readonly MailHeader[] {
  return [
    { name: "List-Unsubscribe", value: `<${unsubscribeUrl}>` },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ];
}

function messageIdForConfirmation(emailHash: string, tokenHash: string) {
  return `newsletter-confirmation:${crypto.createHash("sha256").update(`${emailHash}:${tokenHash}`).digest("hex")}`;
}

function messageIdForIssue(emailHash: string, issueId: string) {
  return `newsletter-issue:${crypto.createHash("sha256").update(`${emailHash}:${issueId}`).digest("hex")}`;
}

export function messageIdForNewsletterConsentNotice(emailHash: string, dueAt: Date) {
  return `newsletter-consent-notice:${crypto
    .createHash("sha256")
    .update(`${emailHash}:${dueAt.toISOString()}`)
    .digest("hex")}`;
}

function consentNoticeUnsubscribeToken(emailHash: string, dueAt: Date) {
  return crypto
    .createHmac("sha256", CREDENTIALS_KMS_KEY)
    .update(`newsletter-consent-notice-unsubscribe:v1:${emailHash}:${dueAt.toISOString()}`, "utf8")
    .digest("base64url");
}

async function cancelPendingNewsletterConsentNotices(emailHash: string, now: Date) {
  const Model = await messageModel();
  return Model.updateMany(
    {
      emailHash,
      templateKey: "newsletter.consent_notice",
      status: { $in: ["queued", "retry_wait"] },
    },
    {
      $set: {
        status: "canceled",
        completedAt: now,
        payloadExpiresAt: getMailPayloadExpiresAt(now),
        expiresAt: getMailLedgerExpiresAt(now),
        leaseUntil: null,
        nextAttemptAt: null,
        lastError: {
          code: "MAIL_NEWSLETTER_CONSENT_NOTICE_STALE_CYCLE",
          reason: "newsletter consent cycle changed before dispatch",
          retryable: false,
          occurredAt: now,
        },
      },
      $unset: { leaseOwner: 1 },
    },
  );
}

export function buildNewsletterConfirmationMail(input: {
  recipientEmail: string;
  confirmationToken: string;
  issuedAt: Date;
  locale?: "ko" | "en";
}): EnqueueMailInput {
  const locale = input.locale ?? "ko";
  const rendered = renderMailTemplate({
    key: "newsletter.subscription_confirmation",
    locale,
    data: {
      actionUrl: newsletterConfirmationUrl(input.confirmationToken),
      expiresInMinutes: NEWSLETTER_CONFIRMATION_TOKEN_TTL_MINUTES,
    },
  });
  const tokenHash = hashNewsletterToken(input.confirmationToken);
  return {
    messageId: messageIdForConfirmation(getMailRecipientHash(input.recipientEmail, CREDENTIALS_KMS_KEY), tokenHash),
    category: "transactional",
    templateKey: "newsletter.subscription_confirmation",
    locale,
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

export function buildNewsletterConsentNoticeMail(input: {
  recipientEmail: string;
  emailHash: string;
  anchorAt: Date;
  dueAt: Date;
  locale?: "ko" | "en";
}): EnqueueMailInput {
  const recipientEmail = normalizeNewsletterEmail(input.recipientEmail);
  if (!/^[a-f0-9]{64}$/.test(input.emailHash)) {
    throw new NewsletterSubscriptionError("INVALID_NEWSLETTER_EMAIL_HASH", 400);
  }
  const locale = input.locale ?? "ko";
  const unsubscribeToken = consentNoticeUnsubscribeToken(input.emailHash, input.dueAt);
  const unsubscribeUrl = newsletterUnsubscribeUrl(unsubscribeToken);
  const settingsUrl = new URL("/account", NEXTAUTH_URL).toString();
  const rendered = renderMailTemplate({
    key: "newsletter.consent_notice",
    locale,
    data: {
      confirmedAt: formatNewsletterConsentDateKst(input.anchorAt),
      settingsUrl,
      unsubscribeUrl,
    },
  });
  return {
    messageId: messageIdForNewsletterConsentNotice(input.emailHash, input.dueAt),
    // 광고·캠페인이 아닌 법정 수신동의 확인 안내이며 newsletter 승인 capability를 우회하지 않는다.
    category: "transactional",
    templateKey: "newsletter.consent_notice",
    locale,
    recipientEmail,
    headers: buildNewsletterMailHeaders(unsubscribeUrl),
    ...rendered,
  };
}

export function buildNewsletterIssueMail(input: {
  recipientEmail: string;
  issueId: string;
  issueTitle: string;
  intro: string;
  stories: NewsletterIssueData["stories"];
  topic: NewsletterIssueData["topic"];
  unsubscribeUrl: string;
  locale?: "ko" | "en";
  universeId?: string;
  campaignId?: string;
  newsletterDispatch?: NewsletterDispatchAuthorization;
}): EnqueueMailInput {
  const recipientEmail = normalizeNewsletterEmail(input.recipientEmail);
  const issueId = input.issueId.trim();
  if (!issueId || issueId.length > 200) {
    throw new NewsletterSubscriptionError("INVALID_NEWSLETTER_ISSUE_ID", 400);
  }
  const locale = input.locale ?? "ko";
  const tracked = buildNewsletterTrackedContent({ issueId, stories: input.stories, topic: input.topic });
  if (input.newsletterDispatch && (!input.universeId?.trim() || !input.campaignId?.trim())) {
    throw new NewsletterSubscriptionError("NEWSLETTER_ATTRIBUTION_REQUIRED", 400);
  }
  const rendered = renderMailTemplate({
    key: "newsletter.issue",
    locale,
    data: {
      issueTitle: input.issueTitle,
      intro: input.intro,
      stories: tracked.stories,
      topic: tracked.topic,
      unsubscribeUrl: input.unsubscribeUrl,
    },
  });
  return {
    messageId: messageIdForIssue(getMailRecipientHash(recipientEmail, CREDENTIALS_KMS_KEY), issueId),
    category: "newsletter",
    templateKey: "newsletter.issue",
    locale,
    recipientEmail,
    headers: buildNewsletterMailHeaders(input.unsubscribeUrl),
    newsletterDispatch: input.newsletterDispatch,
    newsletterAttribution:
      input.universeId && input.campaignId
        ? { universeId: input.universeId.trim(), campaignId: input.campaignId.trim(), issueId }
        : undefined,
    ...rendered,
  };
}

/**
 * 테스트 메일은 뉴스레터 worker의 구독자 gate와 분리된 transactional queue로만 보낸다.
 * 운영 수신자에게 newsletter category를 직접 enqueue하는 경로는 별도 승인 capability가 필요하다.
 */
export function buildNewsletterTestMail(input: Parameters<typeof buildNewsletterIssueMail>[0]): EnqueueMailInput {
  const mail = buildNewsletterIssueMail(input);
  return {
    ...mail,
    messageId: `${mail.messageId}:test`,
    category: "transactional",
    templateKey: "newsletter.issue.test",
  };
}

function appendConsentEvent(
  row: INewsletterSubscriberDocument,
  event: {
    action: NewsletterConsentAction;
    method: NewsletterConsentMethod;
    source: NewsletterSubscriptionSource;
    version?: string;
    ip?: string;
    sourceLocation?: string;
    postSlug?: string;
    occurredAt: Date;
  },
) {
  row.consentHistory = [
    ...(row.consentHistory || []),
    {
      action: event.action,
      method: event.method,
      source: event.source,
      version: event.version ?? row.consentVersion,
      occurredAt: event.occurredAt,
      ipHash: hashNewsletterIp(event.ip),
      ...(event.sourceLocation ? { sourceLocation: event.sourceLocation } : {}),
      ...(event.postSlug ? { postSlug: event.postSlug } : {}),
    },
  ];
  row.markModified("consentHistory");
}

async function findSubscriber(input: { emailHash: string; uid?: string }) {
  const Model = await subscriberModel();
  const byEmail = Model.findOne({ emailHash: input.emailHash });
  if (!input.uid) return { row: await byEmail, Model };

  const [emailRow, uidRow] = await Promise.all([byEmail, Model.findOne({ uid: input.uid })]);
  if (emailRow && uidRow && String(emailRow._id) !== String(uidRow._id)) {
    throw new NewsletterSubscriptionError("NEWSLETTER_ACCOUNT_LINK_CONFLICT", 409);
  }
  return { row: uidRow || emailRow, Model };
}

async function findBlockingSuppression(emailHash: string) {
  const Model = await suppressionModel();
  return Model.findOne({
    emailHash,
    scope: { $in: ["all", "newsletter"] },
    reason: { $in: ["hard_bounce", "complaint", "manual"] },
  })
    .select("reason")
    .lean();
}

async function removeNewsletterUnsubscribeSuppression(emailHash: string) {
  const Model = await suppressionModel();
  await Model.deleteOne({ emailHash, scope: "newsletter", reason: "unsubscribe" });
}

async function ensureNewsletterUnsubscribeSuppression(emailHash: string, now: Date) {
  const Model = await suppressionModel();
  const existing = await Model.findOne({ emailHash, scope: "newsletter" }).select("reason").lean();
  if (existing) return;
  try {
    await Model.create({ emailHash, scope: "newsletter", reason: "unsubscribe", noteCode: "NEWSLETTER_UNSUBSCRIBE", createdAt: now, updatedAt: now });
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || (error as { code?: unknown }).code !== 11000) {
      throw error;
    }
  }
}

function validateConsentVersion(version: string) {
  if (version !== NEWSLETTER_CONSENT_VERSION) {
    throw new NewsletterSubscriptionError("NEWSLETTER_CONSENT_VERSION_REQUIRED", 409);
  }
}

function normalizeNewsletterAttribution(value: string | undefined, maxLength: number) {
  const normalized = String(value || "").trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength || /[@\s]/.test(normalized)) {
    throw new NewsletterSubscriptionError("NEWSLETTER_ATTRIBUTION_INVALID", 400);
  }
  return normalized;
}

export async function requestNewsletterSubscription(input: {
  email: string;
  uid?: string;
  consentVersion: string;
  source: NewsletterSubscriptionSource;
  method: "checkbox" | "profile_toggle";
  ip?: string;
  sourceLocation?: string;
  postSlug?: string;
  now?: Date;
}) {
  const email = normalizeNewsletterEmail(input.email);
  const uid = input.uid?.trim() || undefined;
  validateConsentVersion(input.consentVersion);
  const sourceLocation = normalizeNewsletterAttribution(input.sourceLocation, 120);
  const postSlug = normalizeNewsletterAttribution(input.postSlug, 200);
  const now = input.now ?? new Date();
  const emailHash = getMailRecipientHash(email, CREDENTIALS_KMS_KEY);
  const blocked = await findBlockingSuppression(emailHash);
  if (blocked) {
    throw new NewsletterSubscriptionError("NEWSLETTER_ADDRESS_SUPPRESSED", 409);
  }

  const { row, Model } = await findSubscriber({ emailHash, uid });
  if (row?.status === "bounced" || row?.status === "complained") {
    throw new NewsletterSubscriptionError("NEWSLETTER_ADDRESS_SUPPRESSED", 409);
  }
  if (row?.status === "subscribed" && row.emailHash === emailHash) {
    if (uid && row.uid && row.uid !== uid) throw new NewsletterSubscriptionError("NEWSLETTER_ACCOUNT_LINK_CONFLICT", 409);
    if (uid && !row.uid) {
      row.uid = uid;
      await row.save();
    }
    return { status: "subscribed" as const, confirmationSent: false };
  }

  const token = issueNewsletterToken();
  const tokenHash = hashNewsletterToken(token);
  const confirmationTokenExpiresAt = new Date(
    now.getTime() + NEWSLETTER_CONFIRMATION_TOKEN_TTL_MINUTES * 60_000,
  );
  const emailPurgeAt = getNewsletterEmailPurgeAt(confirmationTokenExpiresAt);
  const previousStatus = row?.status;
  if (row) {
    row.email = email;
    row.emailHash = emailHash;
    row.uid = uid || row.uid;
    row.status = "pending";
    row.consentVersion = input.consentVersion;
    row.consentedAt = now;
    row.confirmedAt = null;
    row.withdrawnAt = null;
    row.confirmationTokenHash = tokenHash;
    row.confirmationTokenExpiresAt = confirmationTokenExpiresAt;
    row.unsubscribeTokenHash = undefined;
    row.ipHash = hashNewsletterIp(input.ip);
    row.emailPurgeAt = emailPurgeAt;
    row.emailPurgedAt = null;
    row.consentEvidenceExpiresAt = null;
    row.consentNoticeAnchorAt = null;
    row.nextConsentNoticeAt = null;
    row.consentNoticeStatus = "scheduled";
    row.consentNoticeLeaseOwner = undefined;
    row.consentNoticeLeaseUntil = null;
    row.consentNoticeRetryAt = null;
    row.lastConsentNoticeQueuedAt = null;
    row.lastConsentNoticeSentAt = null;
    row.lastConsentNoticeMessageId = undefined;
    row.lastConsentNoticeDueAt = null;
    row.lastConsentNoticeUnsubscribeTokenHash = undefined;
    row.consentNoticeUnsubscribeTokenHashes = [];
    appendConsentEvent(row, {
      action: previousStatus === "unsubscribed" ? "resubscribe_requested" : "subscribe_requested",
      method: input.method,
      source: input.source,
      version: input.consentVersion,
      ip: input.ip,
      sourceLocation,
      postSlug,
      occurredAt: now,
    });
    await row.save();
    await cancelPendingNewsletterConsentNotices(emailHash, now);
  } else {
    const created = new Model({
      email,
      emailHash,
      ...(uid ? { uid } : {}),
      status: "pending",
      consentVersion: input.consentVersion,
      consentedAt: now,
      confirmedAt: null,
      withdrawnAt: null,
      confirmationTokenHash: tokenHash,
      confirmationTokenExpiresAt,
      ipHash: hashNewsletterIp(input.ip),
      emailPurgeAt,
      emailPurgedAt: null,
      consentEvidenceExpiresAt: null,
      consentNoticeAnchorAt: null,
      nextConsentNoticeAt: null,
      consentNoticeStatus: "scheduled",
      consentNoticeLeaseUntil: null,
      consentNoticeRetryAt: null,
      lastConsentNoticeQueuedAt: null,
      lastConsentNoticeSentAt: null,
      consentNoticeUnsubscribeTokenHashes: [],
      consentHistory: [
        {
          action: "subscribe_requested",
          method: input.method,
          source: input.source,
          version: input.consentVersion,
          occurredAt: now,
          ipHash: hashNewsletterIp(input.ip),
          ...(sourceLocation ? { sourceLocation } : {}),
          ...(postSlug ? { postSlug } : {}),
        },
      ],
    });
    await created.save();
  }

  await enqueueMail(buildNewsletterConfirmationMail({ recipientEmail: email, confirmationToken: token, issuedAt: now }));
  return { status: "pending" as const, confirmationSent: true };
}

export async function confirmNewsletterSubscription(token: string, input?: { ip?: string; now?: Date }) {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken.length > 256) throw new NewsletterSubscriptionError("INVALID_NEWSLETTER_TOKEN", 400);
  const now = input?.now ?? new Date();
  const Model = await subscriberModel();
  const row = await Model.findOne({ confirmationTokenHash: hashNewsletterToken(normalizedToken), status: "pending" });
  if (!row) throw new NewsletterSubscriptionError("NEWSLETTER_CONFIRMATION_INVALID", 400);
  if (!row.confirmationTokenExpiresAt || row.confirmationTokenExpiresAt.getTime() <= now.getTime()) {
    throw new NewsletterSubscriptionError("NEWSLETTER_CONFIRMATION_EXPIRED", 410);
  }
  const blocked = await findBlockingSuppression(row.emailHash);
  if (blocked) {
    row.status = blocked.reason === "complaint" ? "complained" : "bounced";
    row.confirmationTokenHash = undefined;
    row.confirmationTokenExpiresAt = null;
    row.emailPurgeAt = getNewsletterEmailPurgeAt(now);
    row.emailPurgedAt = null;
    row.consentEvidenceExpiresAt = getNewsletterConsentEvidenceExpiresAt(now);
    row.consentNoticeAnchorAt = null;
    row.nextConsentNoticeAt = null;
    row.consentNoticeStatus = "scheduled";
    row.consentNoticeLeaseOwner = undefined;
    row.consentNoticeLeaseUntil = null;
    row.consentNoticeRetryAt = null;
    row.lastConsentNoticeQueuedAt = null;
    row.lastConsentNoticeSentAt = null;
    row.lastConsentNoticeMessageId = undefined;
    row.lastConsentNoticeDueAt = null;
    row.lastConsentNoticeUnsubscribeTokenHash = undefined;
    row.consentNoticeUnsubscribeTokenHashes = [];
    appendConsentEvent(row, {
      action: blocked.reason === "complaint" ? "complained" : "bounced",
      method: "ses_event",
      source: "system",
      occurredAt: now,
    });
    await row.save();
    throw new NewsletterSubscriptionError("NEWSLETTER_ADDRESS_SUPPRESSED", 409);
  }

  const unsubscribeToken = issueNewsletterToken();
  row.status = "subscribed";
  row.confirmedAt = now;
  row.withdrawnAt = null;
  row.confirmationTokenHash = undefined;
  row.confirmationTokenExpiresAt = null;
  row.unsubscribeTokenHash = hashNewsletterToken(unsubscribeToken);
  row.emailPurgeAt = null;
  row.emailPurgedAt = null;
  row.consentEvidenceExpiresAt = null;
  row.consentNoticeAnchorAt = now;
  row.nextConsentNoticeAt = getFollowingNewsletterConsentNoticeAt(now, now);
  row.consentNoticeStatus = "scheduled";
  row.consentNoticeLeaseOwner = undefined;
  row.consentNoticeLeaseUntil = null;
  row.consentNoticeRetryAt = null;
  row.lastConsentNoticeQueuedAt = null;
  row.lastConsentNoticeSentAt = null;
  row.lastConsentNoticeMessageId = undefined;
  row.lastConsentNoticeDueAt = null;
  row.lastConsentNoticeUnsubscribeTokenHash = undefined;
  appendConsentEvent(row, {
    action: "confirmed",
    method: "double_opt_in",
    source: "system",
    ip: input?.ip,
    sourceLocation: row.consentHistory?.findLast((event) => event.action.endsWith("requested"))?.sourceLocation,
    postSlug: row.consentHistory?.findLast((event) => event.action.endsWith("requested"))?.postSlug,
    occurredAt: now,
  });
  await row.save();
  await removeNewsletterUnsubscribeSuppression(row.emailHash);
  const sourceEvent = row.consentHistory?.findLast((event) => event.action.endsWith("requested"));
  return {
    status: "subscribed" as const,
    unsubscribeUrl: newsletterUnsubscribeUrl(unsubscribeToken),
    sourceLocation: sourceEvent?.sourceLocation || "",
    postSlug: sourceEvent?.postSlug || "",
  };
}

async function unsubscribeRow(row: INewsletterSubscriberDocument, input: { method: NewsletterConsentMethod; source: NewsletterSubscriptionSource; ip?: string; now: Date }) {
  const wasSubscribed = row.status === "subscribed";
  if (row.status !== "bounced" && row.status !== "complained") row.status = "unsubscribed";
  row.withdrawnAt = input.now;
  row.confirmationTokenHash = undefined;
  row.confirmationTokenExpiresAt = null;
  row.emailPurgeAt = getNewsletterEmailPurgeAt(input.now);
  row.emailPurgedAt = null;
  row.consentEvidenceExpiresAt = getNewsletterConsentEvidenceExpiresAt(input.now);
  row.nextConsentNoticeAt = null;
  row.consentNoticeStatus = "scheduled";
  row.consentNoticeLeaseOwner = undefined;
  row.consentNoticeLeaseUntil = null;
  row.consentNoticeRetryAt = null;
  row.lastConsentNoticeQueuedAt = null;
  row.lastConsentNoticeSentAt = null;
  row.lastConsentNoticeMessageId = undefined;
  row.lastConsentNoticeDueAt = null;
  row.lastConsentNoticeUnsubscribeTokenHash = undefined;
  row.consentNoticeUnsubscribeTokenHashes = [];
  appendConsentEvent(row, {
    action: input.method === "account_deletion" ? "account_unlinked" : "unsubscribed",
    method: input.method,
    source: input.source,
    ip: input.ip,
    occurredAt: input.now,
  });
  await row.save();
  await cancelPendingNewsletterConsentNotices(row.emailHash, input.now);
  await ensureNewsletterUnsubscribeSuppression(row.emailHash, input.now);
  if (wasSubscribed) await recordNewsletterUnsubscribe({ occurredAt: input.now });
}

export async function unsubscribeNewsletterByToken(token: string, input?: { ip?: string; now?: Date }) {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken.length > 256) throw new NewsletterSubscriptionError("INVALID_NEWSLETTER_TOKEN", 400);
  const Model = await subscriberModel();
  const tokenHash = hashNewsletterToken(normalizedToken);
  const row = await Model.findOne({
    $or: [{ unsubscribeTokenHash: tokenHash }, { consentNoticeUnsubscribeTokenHashes: tokenHash }],
  });
  if (!row) throw new NewsletterSubscriptionError("NEWSLETTER_UNSUBSCRIBE_INVALID", 400);
  await unsubscribeRow(row, {
    method: "unsubscribe_link",
    source: "system",
    ip: input?.ip,
    now: input?.now ?? new Date(),
  });
  return { status: "unsubscribed" as const };
}

export async function unsubscribeNewsletterByIdentity(input: {
  uid?: string;
  email?: string;
  source: NewsletterSubscriptionSource;
  method: "profile_toggle" | "account_deletion";
  ip?: string;
  now?: Date;
}) {
  const email = input.email ? normalizeNewsletterEmail(input.email) : undefined;
  const emailHash = email ? getMailRecipientHash(email, CREDENTIALS_KMS_KEY) : "";
  if (!input.uid?.trim() && !emailHash) return { found: false, status: "unsubscribed" as const };
  const { row } = await findSubscriber({ emailHash, uid: input.uid?.trim() || undefined });
  if (!row) return { found: false, status: "unsubscribed" as const };
  await unsubscribeRow(row, {
    method: input.method,
    source: input.source,
    ip: input.ip,
    now: input.now ?? new Date(),
  });
  if (input.method === "account_deletion") {
    row.uid = undefined;
    row.markModified("uid");
    await row.save();
  }
  return { found: true, status: "unsubscribed" as const };
}

export async function getNewsletterSubscription(input: { uid?: string; email?: string }) {
  const email = input.email ? normalizeNewsletterEmail(input.email) : undefined;
  const emailHash = email ? getMailRecipientHash(email, CREDENTIALS_KMS_KEY) : "";
  if (!input.uid?.trim() && !emailHash) return { status: "none" as const, subscribed: false, pending: false };
  const { row } = await findSubscriber({ emailHash, uid: input.uid?.trim() || undefined });
  const status = row?.status || "none";
  return {
    status,
    subscribed: status === "subscribed",
    pending: status === "pending",
    linked: Boolean(row?.uid && input.uid && row.uid === input.uid),
  };
}

/** 뉴스레터 worker가 발송 직전에 확인하는 이중 opt-in gate. 조회 실패는 호출자가 fail-closed로 처리한다. */
export async function isNewsletterRecipientEligible(emailHash: string) {
  if (!/^[a-f0-9]{64}$/.test(emailHash)) return false;
  const Model = await subscriberModel();
  const row = await Model.findOne({ emailHash, status: "subscribed" }).select("_id").lean();
  return Boolean(row);
}

/** 법정 수신동의 확인 안내는 transactional category지만 발송 직전 구독 상태를 다시 확인한다. */
export async function isNewsletterConsentNoticeEligible(
  emailHash: string,
  messageId: string,
  dependencies?: Pick<NewsletterConsentNoticeDependencies, "model">,
) {
  if (!/^[a-f0-9]{64}$/.test(emailHash) || !messageId.trim()) return false;
  const Model = dependencies?.model ?? await subscriberModel();
  const row = await Model.findOne({
    emailHash,
    status: "subscribed",
    consentNoticeStatus: "queued",
    lastConsentNoticeMessageId: messageId,
  })
    .select("consentNoticeAnchorAt nextConsentNoticeAt lastConsentNoticeDueAt lastConsentNoticeMessageId +lastConsentNoticeUnsubscribeTokenHash +consentNoticeUnsubscribeTokenHashes")
    .lean();
  if (
    !row?.consentNoticeAnchorAt ||
    !row.nextConsentNoticeAt ||
    !row.lastConsentNoticeDueAt ||
    !row.lastConsentNoticeUnsubscribeTokenHash ||
    row.nextConsentNoticeAt.getTime() < row.lastConsentNoticeDueAt.getTime()
  ) {
    return false;
  }
  const expectedMessageId = messageIdForNewsletterConsentNotice(emailHash, row.lastConsentNoticeDueAt);
  const expectedTokenHash = hashNewsletterToken(consentNoticeUnsubscribeToken(emailHash, row.lastConsentNoticeDueAt));
  return (
    row.lastConsentNoticeMessageId === expectedMessageId &&
    messageId === expectedMessageId &&
    row.lastConsentNoticeUnsubscribeTokenHash === expectedTokenHash &&
    row.consentNoticeUnsubscribeTokenHashes?.includes(expectedTokenHash) === true
  );
}

/** 발송 성공 후 subscriber 원장에도 현재 주기의 terminal 상태를 명시한다. */
export async function markNewsletterConsentNoticeSent(
  emailHash: string,
  messageId: string,
  sentAt: Date,
  dependencies?: Pick<NewsletterConsentNoticeDependencies, "model">,
) {
  if (!/^[a-f0-9]{64}$/.test(emailHash) || !messageId.trim()) return false;
  const Model = dependencies?.model ?? await subscriberModel();
  const result = await Model.updateOne(
    {
      emailHash,
      status: "subscribed",
      consentNoticeStatus: "queued",
      lastConsentNoticeMessageId: messageId,
    },
    {
      $set: {
        consentNoticeStatus: "sent",
        lastConsentNoticeSentAt: sentAt,
      },
    },
  );
  return result.modifiedCount === 1;
}

async function backfillLegacyNewsletterConsentNoticeSchedules(
  Model: Awaited<ReturnType<typeof subscriberModel>>,
  now: Date,
  limit: number,
) {
  let backfilled = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = await Model.findOne({
      status: "subscribed",
      confirmedAt: { $type: "date" },
      $or: [
        { consentNoticeAnchorAt: null },
        { consentNoticeAnchorAt: { $exists: false } },
        { nextConsentNoticeAt: null },
        { nextConsentNoticeAt: { $exists: false } },
      ],
    })
      .select("confirmedAt consentNoticeAnchorAt nextConsentNoticeAt")
      .sort({ confirmedAt: 1, createdAt: 1 })
      .lean();
    if (!row?.confirmedAt) break;
    const anchorAt = row.consentNoticeAnchorAt ?? row.confirmedAt;
    if (!Number.isFinite(anchorAt.getTime())) break;
    const schedule = resolveNewsletterConsentNoticeSchedule(anchorAt, now);
    const restoredNextDueAt = schedule.currentDueAt ?? schedule.nextDueAt;
    const result = await Model.updateOne(
      {
        _id: row._id,
        status: "subscribed",
        confirmedAt: row.confirmedAt,
        $or: [
          { consentNoticeAnchorAt: null },
          { consentNoticeAnchorAt: { $exists: false } },
          { nextConsentNoticeAt: null },
          { nextConsentNoticeAt: { $exists: false } },
        ],
      },
      {
        $set: {
          consentNoticeAnchorAt: anchorAt,
          nextConsentNoticeAt: restoredNextDueAt,
          consentNoticeStatus: "scheduled",
          consentNoticeLeaseUntil: null,
          consentNoticeRetryAt: null,
        },
        $unset: { consentNoticeLeaseOwner: 1 },
      },
    );
    if (result.modifiedCount !== 1) break;
    backfilled += 1;
  }
  return backfilled;
}

async function reconcileSentNewsletterConsentNotices(
  Model: Awaited<ReturnType<typeof subscriberModel>>,
  MessageModel: Awaited<ReturnType<typeof messageModel>>,
  limit: number,
) {
  const rows = await Model.find({
    status: "subscribed",
    consentNoticeStatus: "queued",
    lastConsentNoticeMessageId: { $type: "string" },
  })
    .select("emailHash lastConsentNoticeMessageId")
    .sort({ lastConsentNoticeQueuedAt: 1, updatedAt: 1 })
    .limit(limit)
    .lean();
  let reconciled = 0;
  for (const row of rows) {
    const messageId = String(row.lastConsentNoticeMessageId || "");
    if (!messageId) continue;
    const sent = await MessageModel.findOne({
      messageId,
      emailHash: row.emailHash,
      templateKey: "newsletter.consent_notice",
      status: "sent",
    })
      .select("sentAt")
      .lean();
    if (!sent?.sentAt) continue;
    const result = await Model.updateOne(
      {
        _id: row._id,
        status: "subscribed",
        consentNoticeStatus: "queued",
        lastConsentNoticeMessageId: messageId,
      },
      {
        $set: {
          consentNoticeStatus: "sent",
          lastConsentNoticeSentAt: sent.sentAt,
        },
      },
    );
    if (result.modifiedCount === 1) reconciled += 1;
  }
  return reconciled;
}

/**
 * 최초 double opt-in 시각에 고정된 2년 주기 안내를 bounded claim으로 queue에 넣는다.
 * messageId와 해지 토큰은 dueAt 기준으로 결정적이므로 enqueue 직후 프로세스가 중단돼도 같은 메일만 재사용한다.
 */
export async function sweepDueNewsletterConsentNotices(input: {
  workerId: string;
  now?: Date;
  limit?: number;
  dependencies?: NewsletterConsentNoticeDependencies;
}) {
  const workerId = input.workerId.trim();
  if (!workerId || workerId.length > 160) throw new Error("NEWSLETTER_CONSENT_NOTICE_WORKER_ID_INVALID");
  const now = input.now ?? new Date();
  const requestedLimit = input.limit ?? CONSENT_NOTICE_SWEEP_LIMIT;
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(CONSENT_NOTICE_SWEEP_LIMIT, requestedLimit))
    : CONSENT_NOTICE_SWEEP_LIMIT;
  const Model = input.dependencies?.model ?? await subscriberModel();
  const MessageModel = input.dependencies?.messageModel ?? await messageModel();
  const enqueue = input.dependencies?.enqueue ?? enqueueMail;
  const backfilledLegacy = await backfillLegacyNewsletterConsentNoticeSchedules(Model, now, limit);
  const reconciledSent = await reconcileSentNewsletterConsentNotices(Model, MessageModel, limit);

  const missingEmail = await Model.updateMany(
    {
      status: "subscribed",
      nextConsentNoticeAt: { $lte: now },
      $or: [
        { email: { $exists: false } },
        { email: "" },
        { emailPurgedAt: { $type: "date" } },
        { emailPurgeAt: { $type: "date" } },
      ],
    },
    {
      $set: {
        consentNoticeStatus: "blocked_missing_email",
        consentNoticeLeaseUntil: null,
        consentNoticeRetryAt: null,
      },
      $unset: { consentNoticeLeaseOwner: 1 },
    },
  );

  let queued = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const leaseUntil = new Date(now.getTime() + CONSENT_NOTICE_LEASE_MS);
    const row = await Model.findOneAndUpdate(
      {
        status: "subscribed",
        nextConsentNoticeAt: { $lte: now },
        consentNoticeStatus: { $nin: ["blocked_missing_email", "blocked_terminal"] },
        email: { $exists: true, $type: "string", $ne: "" },
        $and: [
          { $or: [{ emailPurgedAt: null }, { emailPurgedAt: { $exists: false } }] },
          { $or: [{ emailPurgeAt: null }, { emailPurgeAt: { $exists: false } }] },
          { $or: [{ consentNoticeRetryAt: null }, { consentNoticeRetryAt: { $exists: false } }, { consentNoticeRetryAt: { $lte: now } }] },
          { $or: [{ consentNoticeLeaseUntil: null }, { consentNoticeLeaseUntil: { $exists: false } }, { consentNoticeLeaseUntil: { $lte: now } }] },
        ],
      },
      {
        $set: {
          consentNoticeStatus: "claiming",
          consentNoticeLeaseOwner: workerId,
          consentNoticeLeaseUntil: leaseUntil,
        },
      },
      { new: true, sort: { nextConsentNoticeAt: 1, createdAt: 1 } },
    )
      .select("+email +consentNoticeUnsubscribeTokenHashes")
      .lean();

    if (!row) break;
    const dueAt = row.nextConsentNoticeAt;
    const anchorAt = row.consentNoticeAnchorAt ?? row.confirmedAt;
    if (!row.email || !dueAt || !anchorAt) {
      await Model.updateOne(
        { _id: row._id, consentNoticeLeaseOwner: workerId },
        {
          $set: { consentNoticeStatus: "blocked_missing_email", consentNoticeLeaseUntil: null },
          $unset: { consentNoticeLeaseOwner: 1 },
        },
      );
      continue;
    }

    try {
      const mail = buildNewsletterConsentNoticeMail({
        recipientEmail: row.email,
        emailHash: row.emailHash,
        anchorAt,
        dueAt,
      });
      const unsubscribeTokenHash = hashNewsletterToken(consentNoticeUnsubscribeToken(row.emailHash, dueAt));
      const tokenClaim = await Model.updateOne(
        {
          _id: row._id,
          status: "subscribed",
          consentNoticeLeaseOwner: workerId,
          nextConsentNoticeAt: dueAt,
        },
        {
          $set: {
            consentNoticeStatus: "queued",
            lastConsentNoticeMessageId: mail.messageId,
            lastConsentNoticeDueAt: dueAt,
            lastConsentNoticeUnsubscribeTokenHash: unsubscribeTokenHash,
          },
          $addToSet: { consentNoticeUnsubscribeTokenHashes: unsubscribeTokenHash },
        },
      );
      if (tokenClaim.matchedCount !== 1) continue;
      const enqueueResult = await enqueue(mail);
      if (!isNewsletterConsentNoticeEnqueueStatusAccepted(enqueueResult.status)) {
        failed += 1;
        await Model.updateOne(
          {
            _id: row._id,
            status: "subscribed",
            consentNoticeLeaseOwner: workerId,
            nextConsentNoticeAt: dueAt,
            lastConsentNoticeMessageId: mail.messageId,
          },
          {
            $set: {
              consentNoticeStatus: "blocked_terminal",
              consentNoticeLeaseUntil: null,
              consentNoticeRetryAt: null,
            },
            $unset: { consentNoticeLeaseOwner: 1 },
          },
        );
        continue;
      }
      const nextConsentNoticeAt = getFollowingNewsletterConsentNoticeAt(anchorAt, now);
      const alreadySent = enqueueResult.status === "sent";
      let result = await Model.updateOne(
        {
          _id: row._id,
          status: "subscribed",
          consentNoticeStatus: "queued",
          consentNoticeLeaseOwner: workerId,
          nextConsentNoticeAt: dueAt,
          lastConsentNoticeMessageId: mail.messageId,
          lastConsentNoticeDueAt: dueAt,
          lastConsentNoticeUnsubscribeTokenHash: unsubscribeTokenHash,
        },
        {
          $set: {
            consentNoticeStatus: alreadySent ? "sent" : "queued",
            consentNoticeLeaseUntil: null,
            consentNoticeRetryAt: null,
            lastConsentNoticeQueuedAt: now,
            ...(alreadySent ? { lastConsentNoticeSentAt: now } : {}),
            lastConsentNoticeMessageId: mail.messageId,
            nextConsentNoticeAt,
          },
          $unset: { consentNoticeLeaseOwner: 1 },
        },
      );
      if (result.modifiedCount !== 1) {
        // enqueue 직후 worker가 먼저 SES 발송을 마치면 subscriber는 이미 sent다.
        // 같은 current-cycle 증거를 모두 확인한 뒤 일정만 전진시키고 sent를 보존한다.
        result = await Model.updateOne(
          {
            _id: row._id,
            status: "subscribed",
            consentNoticeStatus: "sent",
            consentNoticeLeaseOwner: workerId,
            nextConsentNoticeAt: dueAt,
            lastConsentNoticeMessageId: mail.messageId,
            lastConsentNoticeDueAt: dueAt,
            lastConsentNoticeUnsubscribeTokenHash: unsubscribeTokenHash,
          },
          {
            $set: {
              consentNoticeLeaseUntil: null,
              consentNoticeRetryAt: null,
              lastConsentNoticeQueuedAt: now,
              nextConsentNoticeAt,
            },
            $unset: { consentNoticeLeaseOwner: 1 },
          },
        );
      }
      if (result.modifiedCount === 1) queued += 1;
    } catch {
      failed += 1;
      await Model.updateOne(
        { _id: row._id, status: "subscribed", consentNoticeLeaseOwner: workerId },
        {
          $set: {
            consentNoticeStatus: "scheduled",
            consentNoticeLeaseUntil: null,
            consentNoticeRetryAt: new Date(now.getTime() + CONSENT_NOTICE_RETRY_MS),
          },
          $unset: { consentNoticeLeaseOwner: 1 },
        },
      );
    }
  }

  return { queued, failed, blockedMissingEmail: missingEmail.modifiedCount, backfilledLegacy, reconciledSent };
}

/** 기존 mail-worker 주기에 맞춰 만료된 원문 이메일과 확인 토큰 해시를 제거한다. */
export async function purgeExpiredNewsletterPersonalData(now: Date = new Date()) {
  const Model = await subscriberModel();
  const result = await Model.updateMany(
    {
      emailPurgeAt: { $lte: now },
      $or: [{ emailPurgedAt: null }, { emailPurgedAt: { $exists: false } }],
      $and: [
        {
          $or: [
            { consentNoticeStatus: { $ne: "claiming" } },
            { consentNoticeLeaseUntil: null },
            { consentNoticeLeaseUntil: { $lte: now } },
          ],
        },
      ],
    },
    {
      $unset: { email: 1, confirmationTokenHash: 1 },
      $set: { emailPurgedAt: now },
    },
  );
  return result.modifiedCount;
}
