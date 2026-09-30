import "server-only";

import type { MailMessageCategory } from "models/mail";
import { parseSnsEnvelope, type SnsEnvelope } from "./snsEnvelope";
import type { SesTopicContract } from "./sesEventTypes";

export class SesWebhookError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function topicContract(input: {
  topicArn: string;
  expectedName: string;
  region: string;
  category: MailMessageCategory;
  configurationSet: string;
}) {
  const parts = input.topicArn.split(":");
  if (
    parts.length !== 6 ||
    parts[0] !== "arn" ||
    parts[1] !== "aws" ||
    parts[2] !== "sns" ||
    parts[3] !== input.region ||
    !/^\d{12}$/.test(parts[4]) ||
    parts[5] !== input.expectedName
  ) {
    throw new SesWebhookError("SES_SNS_TOPIC_CONFIG_INVALID", 503);
  }
  return {
    topicArn: input.topicArn,
    category: input.category,
    configurationSet: input.configurationSet,
  } satisfies SesTopicContract;
}

export function buildSesTopicContracts(input: {
  region: string;
  transactionalTopicArn: string;
  newsletterTopicArn: string;
  transactionalConfigurationSet: string;
  newsletterConfigurationSet: string;
}) {
  return [
    topicContract({
      topicArn: input.transactionalTopicArn,
      expectedName: "amu-ses-transactional-events",
      region: input.region,
      category: "transactional",
      configurationSet: input.transactionalConfigurationSet,
    }),
    topicContract({
      topicArn: input.newsletterTopicArn,
      expectedName: "amu-ses-newsletter-events",
      region: input.region,
      category: "newsletter",
      configurationSet: input.newsletterConfigurationSet,
    }),
  ];
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}

export async function handleSesWebhookEnvelope(input: {
  body: unknown;
  headerType: string;
  headerTopicArn: string;
  topics: SesTopicContract[];
  verify: (envelope: SnsEnvelope) => Promise<void>;
  confirm: (envelope: SnsEnvelope) => Promise<void>;
  process: (envelope: SnsEnvelope, topic: SesTopicContract) => Promise<unknown>;
}) {
  let envelope: SnsEnvelope;
  try {
    envelope = parseSnsEnvelope(input.body);
  } catch (error) {
    throw new SesWebhookError(errorCode(error), 400);
  }
  if (input.headerType !== envelope.Type || input.headerTopicArn !== envelope.TopicArn) {
    throw new SesWebhookError("SNS_HEADER_BODY_MISMATCH", 400);
  }
  const topic = input.topics.find((candidate) => candidate.topicArn === envelope.TopicArn);
  if (!topic) throw new SesWebhookError("SNS_TOPIC_NOT_ALLOWED", 403);

  try {
    await input.verify(envelope);
  } catch (error) {
    const code = errorCode(error);
    const transient = code.startsWith("SNS_CERTIFICATE_FETCH_");
    throw new SesWebhookError(code, transient ? 503 : 401);
  }

  if (envelope.Type === "SubscriptionConfirmation") {
    try {
      await input.confirm(envelope);
    } catch (error) {
      throw new SesWebhookError(errorCode(error), 502);
    }
    return { accepted: true as const, confirmed: true as const, topic: topic.category };
  }
  if (envelope.Type === "UnsubscribeConfirmation") {
    return { accepted: true as const, ignored: true as const, topic: topic.category };
  }

  try {
    const result = await input.process(envelope, topic);
    return { accepted: true as const, confirmed: false as const, topic: topic.category, result };
  } catch (error) {
    const code = errorCode(error);
    const invalid = code.startsWith("SES_EVENT_") && (code.endsWith("_INVALID") || code.endsWith("_MISMATCH"));
    throw new SesWebhookError(code, invalid ? 422 : 503);
  }
}
