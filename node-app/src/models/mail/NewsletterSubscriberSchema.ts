import { Schema, type Document } from "mongoose";

export const NEWSLETTER_SUBSCRIBER_STATUSES = [
  "pending",
  "subscribed",
  "unsubscribed",
  "bounced",
  "complained",
] as const;
export type NewsletterSubscriberStatus = (typeof NEWSLETTER_SUBSCRIBER_STATUSES)[number];

export const NEWSLETTER_CONSENT_ACTIONS = [
  "subscribe_requested",
  "resubscribe_requested",
  "confirmed",
  "unsubscribed",
  "account_unlinked",
  "bounced",
  "complained",
] as const;
export type NewsletterConsentAction = (typeof NEWSLETTER_CONSENT_ACTIONS)[number];

export const NEWSLETTER_CONSENT_METHODS = [
  "checkbox",
  "profile_toggle",
  "double_opt_in",
  "unsubscribe_link",
  "account_deletion",
  "ses_event",
] as const;
export type NewsletterConsentMethod = (typeof NEWSLETTER_CONSENT_METHODS)[number];

export const NEWSLETTER_SUBSCRIPTION_SOURCES = ["magazine", "platform", "api", "system"] as const;
export type NewsletterSubscriptionSource = (typeof NEWSLETTER_SUBSCRIPTION_SOURCES)[number];

export const NEWSLETTER_CONSENT_NOTICE_STATUSES = [
  "scheduled",
  "claiming",
  "queued",
  "sent",
  "blocked_missing_email",
  "blocked_terminal",
] as const;
export type NewsletterConsentNoticeStatus = (typeof NEWSLETTER_CONSENT_NOTICE_STATUSES)[number];

export interface INewsletterConsentEvent {
  action: NewsletterConsentAction;
  version: string;
  method: NewsletterConsentMethod;
  source: NewsletterSubscriptionSource;
  occurredAt: Date;
  ipHash?: string;
  sourceLocation?: string;
  postSlug?: string;
}

export interface INewsletterSubscriberDocument extends Document {
  /** 발송에 필요한 원문 이메일. 조회 기본값에서 제외하고 계약 시점에 맞춰 worker가 제거한다. */
  email?: string;
  /** mail suppression과 동일한 keyed HMAC-SHA-256 해시. */
  emailHash: string;
  /** AMU ID와 분리된 선택적 연결. 탈퇴 접수 시 해제한다. */
  uid?: string;
  status: NewsletterSubscriberStatus;
  consentVersion: string;
  consentedAt: Date;
  confirmedAt?: Date | null;
  withdrawnAt?: Date | null;
  confirmationTokenHash?: string;
  confirmationTokenExpiresAt?: Date | null;
  unsubscribeTokenHash?: string;
  ipHash?: string;
  emailPurgeAt?: Date | null;
  emailPurgedAt?: Date | null;
  consentEvidenceExpiresAt?: Date | null;
  /** 현재 구독의 최초 double opt-in 확인 시각. 2년 주기 계산의 불변 기준점이다. */
  consentNoticeAnchorAt?: Date | null;
  nextConsentNoticeAt?: Date | null;
  consentNoticeStatus?: NewsletterConsentNoticeStatus;
  consentNoticeLeaseOwner?: string;
  consentNoticeLeaseUntil?: Date | null;
  consentNoticeRetryAt?: Date | null;
  lastConsentNoticeQueuedAt?: Date | null;
  lastConsentNoticeSentAt?: Date | null;
  lastConsentNoticeMessageId?: string;
  lastConsentNoticeDueAt?: Date | null;
  lastConsentNoticeUnsubscribeTokenHash?: string;
  /** 과거 메일의 해지 링크를 무효화하지 않기 위해 정기 안내별 토큰 해시를 누적한다. */
  consentNoticeUnsubscribeTokenHashes: string[];
  consentHistory: INewsletterConsentEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterConsentEventSchema = new Schema<INewsletterConsentEvent>(
  {
    action: { type: String, enum: NEWSLETTER_CONSENT_ACTIONS, required: true },
    version: { type: String, required: true, trim: true },
    method: { type: String, enum: NEWSLETTER_CONSENT_METHODS, required: true },
    source: { type: String, enum: NEWSLETTER_SUBSCRIPTION_SOURCES, required: true },
    occurredAt: { type: Date, required: true },
    ipHash: { type: String, match: /^[a-f0-9]{64}$/, default: undefined },
    sourceLocation: { type: String, trim: true, maxlength: 120, default: undefined },
    postSlug: { type: String, trim: true, maxlength: 200, default: undefined },
  },
  { _id: false },
);

export const NewsletterSubscriberSchema = new Schema<INewsletterSubscriberDocument>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, select: false },
    emailHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    uid: { type: String, trim: true, default: undefined },
    status: { type: String, enum: NEWSLETTER_SUBSCRIBER_STATUSES, required: true, default: "pending" },
    consentVersion: { type: String, required: true, trim: true },
    consentedAt: { type: Date, required: true },
    confirmedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
    confirmationTokenHash: { type: String, match: /^[a-f0-9]{64}$/, default: undefined, select: false },
    confirmationTokenExpiresAt: { type: Date, default: null },
    unsubscribeTokenHash: { type: String, match: /^[a-f0-9]{64}$/, default: undefined, select: false },
    ipHash: { type: String, match: /^[a-f0-9]{64}$/, default: undefined },
    emailPurgeAt: { type: Date, default: null },
    emailPurgedAt: { type: Date, default: null },
    consentEvidenceExpiresAt: { type: Date, default: null },
    consentNoticeAnchorAt: { type: Date, default: null },
    nextConsentNoticeAt: { type: Date, default: null },
    consentNoticeStatus: {
      type: String,
      enum: NEWSLETTER_CONSENT_NOTICE_STATUSES,
      default: "scheduled",
    },
    consentNoticeLeaseOwner: { type: String, trim: true, default: undefined },
    consentNoticeLeaseUntil: { type: Date, default: null },
    consentNoticeRetryAt: { type: Date, default: null },
    lastConsentNoticeQueuedAt: { type: Date, default: null },
    lastConsentNoticeSentAt: { type: Date, default: null },
    lastConsentNoticeMessageId: { type: String, trim: true, default: undefined },
    lastConsentNoticeDueAt: { type: Date, default: null },
    lastConsentNoticeUnsubscribeTokenHash: {
      type: String,
      match: /^[a-f0-9]{64}$/,
      default: undefined,
      select: false,
    },
    consentNoticeUnsubscribeTokenHashes: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },
    consentHistory: { type: [NewsletterConsentEventSchema], required: true, default: [] },
  },
  { timestamps: true, collection: "newsletter_subscribers" },
);

NewsletterSubscriberSchema.index({ emailHash: 1 }, { unique: true, name: "newsletter_subscriber_email_unique" });
NewsletterSubscriberSchema.index({ uid: 1 }, { unique: true, sparse: true, name: "newsletter_subscriber_uid_unique" });
NewsletterSubscriberSchema.index(
  { confirmationTokenHash: 1 },
  { unique: true, sparse: true, name: "newsletter_confirmation_token_unique" },
);
NewsletterSubscriberSchema.index(
  { unsubscribeTokenHash: 1 },
  { unique: true, sparse: true, name: "newsletter_unsubscribe_token_unique" },
);
NewsletterSubscriberSchema.index({ status: 1, updatedAt: -1 }, { name: "newsletter_subscriber_delivery_candidates" });
NewsletterSubscriberSchema.index(
  { emailPurgeAt: 1, emailPurgedAt: 1 },
  { name: "newsletter_subscriber_email_cleanup" },
);
NewsletterSubscriberSchema.index(
  { consentEvidenceExpiresAt: 1 },
  { expireAfterSeconds: 0, name: "newsletter_consent_evidence_ttl" },
);
NewsletterSubscriberSchema.index(
  { status: 1, nextConsentNoticeAt: 1 },
  { name: "newsletter_consent_notice_due" },
);
NewsletterSubscriberSchema.index(
  { status: 1, consentNoticeStatus: 1, nextConsentNoticeAt: 1, consentNoticeRetryAt: 1, consentNoticeLeaseUntil: 1 },
  { name: "newsletter_consent_notice_claim" },
);
NewsletterSubscriberSchema.index(
  { consentNoticeUnsubscribeTokenHashes: 1 },
  { name: "newsletter_consent_notice_unsubscribe_token" },
);
