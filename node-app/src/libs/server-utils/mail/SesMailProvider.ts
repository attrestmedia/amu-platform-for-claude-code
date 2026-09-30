import "server-only";
import crypto from "node:crypto";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { MailAddress, MailHeader, MailProvider, MailProviderInput, MailProviderResult } from "./types";

const UTF8 = "UTF-8";
const SEND_TIMEOUT_MS = 10_000;

function assertHeaderValue(value: string, field: string) {
  if (!value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`INVALID_MAIL_${field.toUpperCase()}`);
  }
}

function formatFromAddress(from: MailAddress) {
  assertHeaderValue(from.address, "from");
  if (!from.name) return from.address;

  assertHeaderValue(from.name, "from_name");
  const encodedName = /^[\x20-\x7E]+$/.test(from.name)
    ? `"${from.name.replace(/(["\\])/g, "\\$1")}"`
    : `=?UTF-8?B?${Buffer.from(from.name, "utf8").toString("base64")}?=`;
  return `${encodedName} <${from.address}>`;
}

function formatHeaderValue(value: string, field: string) {
  assertHeaderValue(value, field);
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64Body(value: string) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || "";
}

function buildRawMime(input: MailProviderInput) {
  const boundary = `amu-${crypto.randomUUID()}`;
  const headers = [
    `From: ${formatFromAddress(input.from)}`,
    `To: ${input.to}`,
    `Subject: ${formatHeaderValue(input.subject, "subject")}`,
    ...(input.replyTo?.length ? [`Reply-To: ${input.replyTo.join(", ")}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...(input.headers || []).map((header: MailHeader) => `${header.name}: ${header.value}`),
  ];
  return [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(input.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export class SesMailProvider implements MailProvider {
  private readonly client: SESv2Client;

  constructor(region: string) {
    if (!region.trim()) throw new Error("INVALID_SES_REGION");
    this.client = new SESv2Client({ region });
  }

  async send(input: MailProviderInput): Promise<MailProviderResult> {
    assertHeaderValue(input.to, "to");
    assertHeaderValue(input.subject, "subject");
    assertHeaderValue(input.configurationSet, "configuration_set");
    input.replyTo?.forEach((address) => assertHeaderValue(address, "reply_to"));
    input.headers?.forEach((header) => {
      assertHeaderValue(header.name, "header_name");
      assertHeaderValue(header.value, "header_value");
    });
    if (!input.text.trim()) throw new Error("MAIL_TEXT_REQUIRED");
    if (!input.html.trim()) throw new Error("MAIL_HTML_REQUIRED");

    const response = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: formatFromAddress(input.from),
        Destination: { ToAddresses: [input.to] },
        ReplyToAddresses: input.headers?.length ? undefined : input.replyTo ? [...input.replyTo] : undefined,
        Content: input.headers?.length
          ? { Raw: { Data: Buffer.from(buildRawMime(input), "utf8") } }
          : {
              Simple: {
                Subject: { Data: input.subject, Charset: UTF8 },
                Body: {
                  Text: { Data: input.text, Charset: UTF8 },
                  Html: { Data: input.html, Charset: UTF8 },
                },
              },
            },
        ConfigurationSetName: input.configurationSet,
        EmailTags: input.tags
          ? Object.entries(input.tags).map(([Name, Value]) => ({ Name, Value }))
          : undefined,
      }),
      { abortSignal: AbortSignal.timeout(SEND_TIMEOUT_MS) },
    );

    if (!response.MessageId) throw new Error("SES_SEND_MISSING_MESSAGE_ID");
    return { providerMessageId: response.MessageId };
  }
}
