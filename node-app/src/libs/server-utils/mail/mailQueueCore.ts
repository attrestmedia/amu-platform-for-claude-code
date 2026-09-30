import type { MailMessageCategory } from "models/mail";
import { getMailRecipientHash, normalizeMailRecipient } from "./emailHash";
import type { EnqueueMailInput, MailQueueStore } from "./queueTypes";
import type { MailHeader } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeReplyTo(input: readonly string[] | undefined) {
  if (!input?.length) return undefined;
  const replyTo = [...new Set(input.map(normalizeMailRecipient))];
  if (replyTo.length > 10 || replyTo.some((email) => !EMAIL_PATTERN.test(email))) {
    throw new Error("INVALID_MAIL_REPLY_TO");
  }
  return replyTo;
}

const MAIL_HEADER_NAME_PATTERN = /^[!-9;-@A-~]{1,126}$/;
const RESERVED_MAIL_HEADER_NAMES = new Set([
  "bcc",
  "cc",
  "content-disposition",
  "content-type",
  "date",
  "from",
  "message-id",
  "mime-version",
  "reply-to",
  "return-path",
  "subject",
  "to",
]);

function normalizeHeaders(input: readonly MailHeader[] | undefined) {
  if (!input?.length) return undefined;
  if (input.length > 15) throw new Error("INVALID_MAIL_HEADERS");
  const headers = input.map((header) => {
    const name = header.name.trim();
    const value = header.value.trim();
    if (
      !MAIL_HEADER_NAME_PATTERN.test(name) ||
      RESERVED_MAIL_HEADER_NAMES.has(name.toLowerCase()) ||
      !value ||
      value.length > 1000 ||
      /[\r\n]/.test(value)
    ) {
      throw new Error("INVALID_MAIL_HEADERS");
    }
    return { name, value };
  });
  const uniqueNames = new Set(headers.map((header) => header.name.toLowerCase()));
  if (uniqueNames.size !== headers.length) throw new Error("INVALID_MAIL_HEADERS");
  return headers;
}

function hasHeader(headers: readonly MailHeader[] | undefined, name: string) {
  return headers?.some((header) => header.name.toLowerCase() === name.toLowerCase()) === true;
}

function validateInput(input: EnqueueMailInput) {
  const messageId = input.messageId.trim();
  const recipientEmail = normalizeMailRecipient(input.recipientEmail);
  const templateKey = input.templateKey.trim();
  if (!messageId || messageId.length > 200) throw new Error("INVALID_MAIL_MESSAGE_ID");
  if (!EMAIL_PATTERN.test(recipientEmail)) throw new Error("INVALID_MAIL_RECIPIENT");
  if (!templateKey || templateKey.length > 100) throw new Error("INVALID_MAIL_TEMPLATE_KEY");
  if (!input.subject.trim()) throw new Error("MAIL_SUBJECT_REQUIRED");
  if (!input.text.trim()) throw new Error("MAIL_TEXT_REQUIRED");
  if (!input.html.trim()) throw new Error("MAIL_HTML_REQUIRED");
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("INVALID_MAIL_MAX_ATTEMPTS");
  }
  const headers = normalizeHeaders(input.headers);
  if (input.category === "newsletter" && (!hasHeader(headers, "List-Unsubscribe") || !hasHeader(headers, "List-Unsubscribe-Post"))) {
    throw new Error("NEWSLETTER_UNSUBSCRIBE_HEADERS_REQUIRED");
  }
  if (input.category === "newsletter") {
    const approval = input.newsletterDispatch;
    if (
      !approval ||
      approval.mode !== "production" ||
      !approval.campaignId.trim() ||
      !approval.approvedBy.trim() ||
      !approval.approvalId.trim()
    ) {
      throw new Error("NEWSLETTER_DISPATCH_APPROVAL_REQUIRED");
    }
    const attribution = input.newsletterAttribution;
    const attributionValues = attribution ? [attribution.universeId, attribution.campaignId, attribution.issueId] : [];
    if (
      attributionValues.length !== 3 ||
      attributionValues.some((value) => {
        const normalized = String(value || "").trim();
        return !normalized || normalized.length > 200 || /[@\s\r\n]/.test(normalized);
      })
    ) {
      throw new Error("NEWSLETTER_ATTRIBUTION_REQUIRED");
    }
  }
  return {
    messageId,
    recipientEmail,
    templateKey,
    maxAttempts,
    replyTo: normalizeReplyTo(input.replyTo),
    headers,
  };
}

export async function enqueueMailWithStore(
  store: MailQueueStore,
  input: EnqueueMailInput,
  options: {
    hashSecret: string;
    configurationSet: (category: MailMessageCategory) => string;
    now?: Date;
  },
) {
  const valid = validateInput(input);
  const scheduledAt = input.scheduledAt ?? options.now ?? new Date();
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("INVALID_MAIL_SCHEDULED_AT");
  const result = await store.createOnce({
    messageId: valid.messageId,
    category: input.category,
    templateKey: valid.templateKey,
    locale: input.locale ?? "ko",
    recipientEmail: valid.recipientEmail,
    emailHash: getMailRecipientHash(valid.recipientEmail, options.hashSecret),
    payload: {
      subject: input.subject.trim(),
      text: input.text,
      html: input.html,
      headers: valid.replyTo || valid.headers ? { replyTo: valid.replyTo, custom: valid.headers } : undefined,
      newsletterDispatch: input.newsletterDispatch,
      newsletterAttribution: input.newsletterAttribution,
    },
    configurationSet: options.configurationSet(input.category),
    scheduledAt,
    maxAttempts: valid.maxAttempts,
  });
  return { messageId: valid.messageId, ...result };
}
