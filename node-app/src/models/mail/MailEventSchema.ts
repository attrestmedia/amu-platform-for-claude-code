import { Schema, type Document } from "mongoose";
import { MAIL_MESSAGE_CATEGORIES, type MailMessageCategory } from "./MailMessageSchema";

export const MAIL_EVENT_TYPES = [
  "send",
  "delivery",
  "bounce",
  "complaint",
  "open",
  "click",
  "delivery_delay",
  "reject",
] as const;
export type MailEventType = (typeof MAIL_EVENT_TYPES)[number];

export interface IMailEventDocument extends Document {
  /** SNS MessageId 등 재전달에도 변하지 않는 이벤트 멱등키다. */
  eventId: string;
  messageId?: string;
  sesMessageId: string;
  type: MailEventType;
  category: MailMessageCategory;
  configurationSet: string;
  eventAt: Date;
  receivedAt: Date;
  emailHash?: string;
  bounceType?: string;
  bounceSubType?: string;
  complaintFeedbackType?: string;
  delayType?: string;
  reasonCode?: string;
  newsletterUniverseId?: string;
  newsletterCampaignId?: string;
  newsletterIssueId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MailEventSchema = new Schema<IMailEventDocument>(
  {
    eventId: { type: String, required: true, trim: true },
    messageId: { type: String, trim: true, default: undefined },
    sesMessageId: { type: String, required: true, trim: true },
    type: { type: String, enum: MAIL_EVENT_TYPES, required: true },
    category: { type: String, enum: MAIL_MESSAGE_CATEGORIES, required: true },
    configurationSet: { type: String, required: true, trim: true },
    eventAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    emailHash: { type: String, match: /^[a-f0-9]{64}$/, default: undefined },
    bounceType: { type: String, default: undefined },
    bounceSubType: { type: String, default: undefined },
    complaintFeedbackType: { type: String, default: undefined },
    delayType: { type: String, default: undefined },
    reasonCode: { type: String, default: undefined },
    newsletterUniverseId: { type: String, trim: true, default: undefined },
    newsletterCampaignId: { type: String, trim: true, default: undefined },
    newsletterIssueId: { type: String, trim: true, default: undefined },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "mail_events" },
);

MailEventSchema.index({ eventId: 1 }, { unique: true, name: "mail_event_id_unique" });
MailEventSchema.index({ sesMessageId: 1, eventAt: 1 }, { name: "mail_event_ses_join" });
MailEventSchema.index({ messageId: 1, eventAt: 1 }, { name: "mail_event_message_join" });
MailEventSchema.index({ type: 1, eventAt: -1 }, { name: "mail_event_type_history" });
MailEventSchema.index(
  { category: 1, type: 1, eventAt: -1 },
  { name: "mail_event_deliverability_window" },
);
MailEventSchema.index({ newsletterCampaignId: 1, eventAt: -1 }, { name: "mail_event_newsletter_performance" });
MailEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "mail_event_retention_ttl" });
