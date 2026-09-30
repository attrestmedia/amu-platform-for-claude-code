import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export const NEWSLETTER_CAMPAIGN_STATUSES = [
  "waiting_review",
  "approved",
  "test_sent",
  "live_queued",
  "sent",
  "canceled",
  "failed",
] as const;
export type NewsletterCampaignStatus = (typeof NEWSLETTER_CAMPAIGN_STATUSES)[number];

export interface INewsletterCampaignDocument extends Document {
  campaignId: string;
  universeId: string;
  issueId: string;
  status: NewsletterCampaignStatus;
  /** public source reference와 검수 대상 문안만 저장하며 수신자 이메일은 저장하지 않는다. */
  draft: UnknownRecord;
  requestedBy: string;
  reviewedBy?: string;
  approvedBy?: string;
  approvalId?: string;
  reviewChecklist?: UnknownRecord;
  testMessageId?: string;
  scheduledAt?: Date | null;
  liveQueuedAt?: Date | null;
  sentAt?: Date | null;
  canceledAt?: Date | null;
  canceledBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const NewsletterCampaignSchema = new Schema<INewsletterCampaignDocument>(
  {
    campaignId: { type: String, required: true, trim: true, unique: true, index: true },
    universeId: { type: String, required: true, trim: true, index: true },
    issueId: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: NEWSLETTER_CAMPAIGN_STATUSES, required: true, default: "waiting_review", index: true },
    draft: { type: Schema.Types.Mixed, required: true },
    requestedBy: { type: String, required: true, trim: true, index: true },
    reviewedBy: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    approvalId: { type: String, default: "" },
    reviewChecklist: { type: Schema.Types.Mixed, default: {} },
    testMessageId: { type: String, default: "" },
    scheduledAt: { type: Date, default: null },
    liveQueuedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    canceledBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "newsletter_campaigns" },
);

NewsletterCampaignSchema.index({ universeId: 1, status: 1, createdAt: -1 }, { name: "newsletter_campaign_status" });
NewsletterCampaignSchema.index({ universeId: 1, issueId: 1 }, { name: "newsletter_campaign_issue" });
