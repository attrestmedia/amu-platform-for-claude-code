import type { MailMessageStatus } from "models/mail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9:._-]{8,160}$/;
const ACCEPTED_STATUSES = new Set<MailMessageStatus>(["queued", "processing", "retry_wait", "sent"]);

export interface WpMailBridgePayload {
  messageId: string;
  recipients: string[];
  replyTo?: string[];
  subject: string;
  text: string;
  html: string;
}

export class WpMailBridgeInputError extends Error {
  readonly errorCode: string;

  constructor(errorCode: string) {
    super(errorCode);
    this.errorCode = errorCode;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function emailList(value: unknown, field: "recipients" | "replyTo", max: number, allowEmpty = false) {
  if (!Array.isArray(value)) throw new WpMailBridgeInputError(`INVALID_${field.toUpperCase()}`);
  const emails = [...new Set(value.map((item) => stringValue(item).trim().toLowerCase()))];
  if ((!allowEmpty && !emails.length) || emails.length > max || emails.some((email) => !EMAIL_PATTERN.test(email) || email.length > 320)) {
    throw new WpMailBridgeInputError(`INVALID_${field.toUpperCase()}`);
  }
  return emails;
}

export function parseWpMailBridgePayload(value: unknown): WpMailBridgePayload {
  if (!value || typeof value !== "object") throw new WpMailBridgeInputError("INVALID_PAYLOAD");
  const input = value as Record<string, unknown>;
  const messageId = stringValue(input.messageId).trim();
  const subject = stringValue(input.subject).trim();
  const text = stringValue(input.text);
  const html = stringValue(input.html);
  if (!MESSAGE_ID_PATTERN.test(messageId)) throw new WpMailBridgeInputError("INVALID_MESSAGE_ID");
  if (!subject || subject.length > 500 || /[\r\n]/.test(subject)) {
    throw new WpMailBridgeInputError("INVALID_SUBJECT");
  }
  if (!text.trim() || text.length > 500_000) throw new WpMailBridgeInputError("INVALID_TEXT");
  if (!html.trim() || html.length > 1_000_000) throw new WpMailBridgeInputError("INVALID_HTML");
  const recipients = emailList(input.recipients, "recipients", 50);
  const parsedReplyTo = input.replyTo === undefined ? undefined : emailList(input.replyTo, "replyTo", 10, true);
  const replyTo = parsedReplyTo?.length ? parsedReplyTo : undefined;
  return { messageId, recipients, replyTo, subject, text, html };
}

export function recipientMessageId(messageId: string, index: number, recipientCount: number) {
  return recipientCount === 1 ? messageId : `${messageId}:${index + 1}`;
}

export function isAcceptedWpMailStatus(status: MailMessageStatus) {
  return ACCEPTED_STATUSES.has(status);
}
