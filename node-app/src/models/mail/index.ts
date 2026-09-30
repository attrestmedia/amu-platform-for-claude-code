export {
  type IMailMessageDocument,
  type IMailMessageError,
  type IMailMessagePayload,
  type MailLocale,
  type MailMessageCategory,
  type MailMessageStatus,
  MAIL_LOCALES,
  MAIL_MESSAGE_CATEGORIES,
  MAIL_MESSAGE_STATUSES,
  MailMessageSchema,
} from "./MailMessageSchema";
export {
  type IMailEventDocument,
  type MailEventType,
  MAIL_EVENT_TYPES,
  MailEventSchema,
} from "./MailEventSchema";
export {
  type IMailSuppressionDocument,
  type MailSuppressionReason,
  type MailSuppressionScope,
  MAIL_SUPPRESSION_REASONS,
  MAIL_SUPPRESSION_SCOPES,
  MailSuppressionSchema,
} from "./MailSuppressionSchema";
export {
  type IMailDeliverabilityStateDocument,
  MailDeliverabilityStateSchema,
} from "./MailDeliverabilityStateSchema";
export {
  type IMailVolumeDailyDocument,
  MailVolumeDailySchema,
} from "./MailVolumeDailySchema";
export {
  type IMailVolumeEventDocument,
  MailVolumeEventSchema,
} from "./MailVolumeEventSchema";
export {
  getMailEventExpiresAt,
  getMailLedgerExpiresAt,
  getMailPayloadExpiresAt,
  getNewsletterConsentEvidenceExpiresAt,
  getNewsletterEmailPurgeAt,
  getFollowingNewsletterConsentNoticeAt,
  resolveNewsletterConsentNoticeSchedule,
  getNewsletterNextConsentNoticeAt,
  formatNewsletterConsentDateKst,
  isNewsletterConsentNoticeEnqueueStatusAccepted,
  MAIL_LEDGER_RETENTION_DAYS,
  MAIL_TRANSIENT_PAYLOAD_RETENTION_DAYS,
  NEWSLETTER_CONSENT_EVIDENCE_RETENTION_YEARS,
  NEWSLETTER_CONSENT_NOTICE_INTERVAL_YEARS,
  NEWSLETTER_EMAIL_PURGE_GRACE_DAYS,
  NEWSLETTER_ENGAGEMENT_EVENT_RETENTION_DAYS,
} from "./retention";
export {
  type INewsletterConsentEvent,
  type NewsletterConsentNoticeStatus,
  type INewsletterSubscriberDocument,
  type NewsletterConsentAction,
  type NewsletterConsentMethod,
  type NewsletterSubscriptionSource,
  type NewsletterSubscriberStatus,
  NEWSLETTER_CONSENT_ACTIONS,
  NEWSLETTER_CONSENT_NOTICE_STATUSES,
  NEWSLETTER_CONSENT_METHODS,
  NEWSLETTER_SUBSCRIPTION_SOURCES,
  NEWSLETTER_SUBSCRIBER_STATUSES,
  NewsletterSubscriberSchema,
} from "./NewsletterSubscriberSchema";
export {
  type INewsletterCampaignDocument,
  type NewsletterCampaignStatus,
  NEWSLETTER_CAMPAIGN_STATUSES,
  NewsletterCampaignSchema,
} from "./NewsletterCampaignSchema";
