import { Schema, type Document } from "mongoose";

export const MAIL_SUPPRESSION_REASONS = ["hard_bounce", "complaint", "manual", "unsubscribe"] as const;
export type MailSuppressionReason = (typeof MAIL_SUPPRESSION_REASONS)[number];

export const MAIL_SUPPRESSION_SCOPES = ["all", "transactional", "newsletter"] as const;
export type MailSuppressionScope = (typeof MAIL_SUPPRESSION_SCOPES)[number];

export interface IMailSuppressionDocument extends Document {
  /** 이메일 원문 대신 서버 비밀키로 만든 HMAC-SHA-256 소문자 hex만 저장한다. */
  emailHash: string;
  scope: MailSuppressionScope;
  reason: MailSuppressionReason;
  sourceEventId?: string;
  sesMessageId?: string;
  noteCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MailSuppressionSchema = new Schema<IMailSuppressionDocument>(
  {
    emailHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    scope: { type: String, enum: MAIL_SUPPRESSION_SCOPES, required: true, default: "all" },
    reason: { type: String, enum: MAIL_SUPPRESSION_REASONS, required: true },
    sourceEventId: { type: String, trim: true, default: undefined },
    sesMessageId: { type: String, trim: true, default: undefined },
    noteCode: { type: String, trim: true, default: undefined },
  },
  { timestamps: true, collection: "mail_suppressions" },
);

MailSuppressionSchema.index(
  { emailHash: 1, scope: 1 },
  { unique: true, name: "mail_suppression_hot_path_unique" },
);
MailSuppressionSchema.index({ reason: 1, createdAt: -1 }, { name: "mail_suppression_reason_history" });
MailSuppressionSchema.index({ sourceEventId: 1 }, { sparse: true, name: "mail_suppression_source_event" });
