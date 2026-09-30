import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export const MAIL_MESSAGE_CATEGORIES = ["transactional", "newsletter"] as const;
export type MailMessageCategory = (typeof MAIL_MESSAGE_CATEGORIES)[number];

export const MAIL_MESSAGE_STATUSES = [
  "queued",
  "processing",
  "retry_wait",
  "sent",
  "failed",
  "suppressed",
  "canceled",
] as const;
export type MailMessageStatus = (typeof MAIL_MESSAGE_STATUSES)[number];

export const MAIL_LOCALES = ["ko", "en"] as const;
export type MailLocale = (typeof MAIL_LOCALES)[number];

export interface IMailMessagePayload {
  subject: string;
  text?: string;
  html?: string;
  headers?: UnknownRecord;
  templateData?: UnknownRecord;
  newsletterDispatch?: {
    mode: "production";
    campaignId: string;
    approvedBy: string;
    approvalId: string;
  };
  newsletterAttribution?: {
    universeId: string;
    campaignId: string;
    issueId: string;
  };
}

export interface IMailMessageError {
  code: string;
  reason: string;
  retryable: boolean;
  occurredAt: Date;
}

export interface IMailMessageDocument extends Document {
  /** 호출자가 원본 이벤트에서 결정적으로 생성하는 전역 멱등키다. */
  messageId: string;
  category: MailMessageCategory;
  templateKey: string;
  locale: MailLocale;
  /** 발송 경로의 원문 이메일. 처리 종료 후 payload와 함께 제거한다. */
  recipientEmail?: string;
  /** keyed HMAC-SHA-256의 소문자 hex. 원문 제거 후 조인·감사에 사용한다. */
  emailHash: string;
  /** 본문 전문을 장기 원장에 남기지 않기 위한 일시 발송 입력이다. */
  payload?: IMailMessagePayload;
  status: MailMessageStatus;
  scheduledAt: Date;
  nextAttemptAt?: Date | null;
  leaseOwner?: string;
  leaseUntil?: Date | null;
  attempts: number;
  maxAttempts: number;
  sesMessageId?: string;
  configurationSet: string;
  sentAt?: Date | null;
  completedAt?: Date | null;
  payloadExpiresAt?: Date | null;
  payloadPurgedAt?: Date | null;
  expiresAt?: Date | null;
  lastError?: IMailMessageError | null;
  createdAt: Date;
  updatedAt: Date;
}

const MailMessagePayloadSchema = new Schema<IMailMessagePayload>(
  {
    subject: { type: String, required: true },
    text: { type: String, default: undefined },
    html: { type: String, default: undefined },
    headers: { type: Schema.Types.Mixed, default: undefined },
    templateData: { type: Schema.Types.Mixed, default: undefined },
    newsletterDispatch: { type: Schema.Types.Mixed, default: undefined },
    newsletterAttribution: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

const MailMessageErrorSchema = new Schema<IMailMessageError>(
  {
    code: { type: String, required: true },
    reason: { type: String, required: true },
    retryable: { type: Boolean, required: true, default: false },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

export const MailMessageSchema = new Schema<IMailMessageDocument>(
  {
    messageId: { type: String, required: true, trim: true },
    category: { type: String, enum: MAIL_MESSAGE_CATEGORIES, required: true, index: true },
    templateKey: { type: String, required: true, trim: true },
    locale: { type: String, enum: MAIL_LOCALES, required: true, default: "ko" },
    recipientEmail: { type: String, trim: true, lowercase: true, default: undefined, select: false },
    emailHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    payload: { type: MailMessagePayloadSchema, default: undefined, select: false },
    status: { type: String, enum: MAIL_MESSAGE_STATUSES, required: true, default: "queued" },
    scheduledAt: { type: Date, required: true, default: () => new Date() },
    nextAttemptAt: { type: Date, default: null },
    leaseOwner: { type: String, default: undefined },
    leaseUntil: { type: Date, default: null },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    maxAttempts: { type: Number, required: true, min: 1, default: 3 },
    sesMessageId: { type: String, trim: true, default: undefined },
    configurationSet: { type: String, required: true, trim: true },
    sentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    payloadExpiresAt: { type: Date, default: null },
    payloadPurgedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    lastError: { type: MailMessageErrorSchema, default: null },
  },
  { timestamps: true, collection: "mail_messages" },
);

MailMessageSchema.index({ messageId: 1 }, { unique: true, name: "mail_message_id_unique" });
MailMessageSchema.index(
  { sesMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { sesMessageId: { $type: "string" } },
    name: "mail_ses_message_id_unique",
  },
);
MailMessageSchema.index(
  { status: 1, scheduledAt: 1, nextAttemptAt: 1, leaseUntil: 1 },
  { name: "mail_message_queue_claim" },
);
MailMessageSchema.index({ status: 1, payloadExpiresAt: 1 }, { name: "mail_message_payload_cleanup" });
MailMessageSchema.index(
  { emailHash: 1, category: 1, status: 1 },
  { name: "mail_message_recipient_pending" },
);
MailMessageSchema.index({ category: 1, createdAt: -1 }, { name: "mail_message_history" });
MailMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "mail_message_retention_ttl" });
