import type { MailSuppressionReason, NewsletterSubscriberStatus } from "models/mail";

export type NewsletterDeliverySuppressionReason = Extract<MailSuppressionReason, "hard_bounce" | "complaint">;

export function getNewsletterSuppressionTargetStatus(
  reason: NewsletterDeliverySuppressionReason,
): Extract<NewsletterSubscriberStatus, "bounced" | "complained"> {
  return reason === "complaint" ? "complained" : "bounced";
}

export function shouldApplyNewsletterSuppression(
  currentStatus: NewsletterSubscriberStatus,
  reason: NewsletterDeliverySuppressionReason,
) {
  return reason === "complaint"
    ? currentStatus !== "complained"
    : currentStatus !== "bounced" && currentStatus !== "complained";
}

export function getNewsletterSuppressionStatusGuard(reason: NewsletterDeliverySuppressionReason) {
  return reason === "complaint"
    ? { $ne: "complained" as const }
    : { $nin: ["bounced", "complained"] as const };
}

export function getNewsletterSuppressionErrorCode(reason: NewsletterDeliverySuppressionReason) {
  return reason === "complaint" ? "MAIL_CANCELED_SES_COMPLAINT" : "MAIL_CANCELED_SES_HARD_BOUNCE";
}
