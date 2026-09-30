import type { MailEventType, MailMessageCategory, MailSuppressionReason } from "models/mail";

export interface SesTopicContract {
  topicArn: string;
  category: MailMessageCategory;
  configurationSet: string;
}

export interface NormalizedSesEvent {
  eventId: string;
  sesMessageId: string;
  type: MailEventType;
  category: MailMessageCategory;
  configurationSet: string;
  eventAt: Date;
  recipientEmail?: string;
  bounceType?: string;
  bounceSubType?: string;
  complaintFeedbackType?: string;
  delayType?: string;
  reasonCode?: string;
  newsletterUniverseId?: string;
  newsletterCampaignId?: string;
  newsletterIssueId?: string;
  suppressionReason?: Extract<MailSuppressionReason, "hard_bounce" | "complaint">;
}

export interface MailEventStore {
  findMessageBySesId(sesMessageId: string): Promise<{
    messageId?: string;
    templateKey?: string;
    emailHash?: string;
    newsletterUniverseId?: string;
    newsletterCampaignId?: string;
    newsletterIssueId?: string;
  } | null>;
  upsertEvent(input: {
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
  }): Promise<{ created: boolean }>;
  upsertSuppression(input: {
    emailHash: string;
    reason: Extract<MailSuppressionReason, "hard_bounce" | "complaint">;
    sourceEventId: string;
    sesMessageId: string;
    noteCode?: string;
  }): Promise<void>;
  synchronizeNewsletterSuppression(input: {
    emailHash: string;
    reason: Extract<MailSuppressionReason, "hard_bounce" | "complaint">;
    eventAt: Date;
    observedAt: Date;
  }): Promise<{ subscriberTransitioned: boolean; canceledMessages: number }>;
  recordNewsletterPerformance?: (input: {
    universeId: string;
    campaignId: string;
    issueId: string;
    eventType: MailEventType;
    eventAt: Date;
  }) => Promise<void>;
  recordDeliverabilityEvent?: (input: {
    category: MailMessageCategory;
    eventType: MailEventType;
    eventAt: Date;
    observedAt: Date;
  }) => Promise<unknown>;
  recordMailVolumeEvent?: (input: {
    eventId: string;
    category: MailMessageCategory;
    configurationSet: string;
    eventType: MailEventType;
    eventAt: Date;
    observedAt: Date;
  }) => Promise<unknown>;
}
