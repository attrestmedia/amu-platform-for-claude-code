export { SesMailProvider } from "./SesMailProvider";
export { enqueueMail, enqueueMailWithStore, resolveMailFromAddress } from "./mailQueue";
export { processMailQueueOnce } from "./mailWorker";
export { processSesEvent } from "./sesEventService";
export {
  buildNewsletterConfirmationMail,
  buildNewsletterMailHeaders,
  buildNewsletterTestMail,
  assertNewsletterTestRecipient,
  confirmNewsletterSubscription,
  getNewsletterConsentVersion,
  getNewsletterSubscription,
  isNewsletterRecipientEligible,
  isNewsletterCampaignEnabled,
  isNewsletterSubscriptionEnabled,
  newsletterConfirmationUrl,
  newsletterUnsubscribeUrl,
  normalizeNewsletterEmail,
  requestNewsletterSubscription,
  unsubscribeNewsletterByIdentity,
  unsubscribeNewsletterByToken,
} from "./newsletterSubscriberService";
export { NewsletterSubscriptionError } from "./newsletterSubscriberService";
export { buildPaymentConfirmedMail, buildPaymentStatusMail } from "./internalNotificationBuilder";
export type { EnqueueMailInput } from "./queueTypes";
export {
  MAIL_TEMPLATE_KEYS,
  MAIL_TEMPLATE_REGISTRY,
  renderMailTemplate,
} from "./templates";
export type {
  MailTemplateDataByKey,
  MailTemplateKey,
  MailTemplateLocale,
  RenderedMailTemplate,
} from "./templates";
export type { MailAddress, MailHeader, MailProvider, MailProviderInput, MailProviderResult } from "./types";
