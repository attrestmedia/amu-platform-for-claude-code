import { NextRequest, NextResponse } from "next/server";
import {
  AWS_SES_NEWSLETTER_CONFIGURATION_SET,
  AWS_SES_NEWSLETTER_TOPIC_ARN,
  AWS_SES_REGION,
  AWS_SES_TRANSACTIONAL_CONFIGURATION_SET,
  AWS_SES_TRANSACTIONAL_TOPIC_ARN,
  CREDENTIALS_KMS_KEY,
} from "consts/env/server";
import { processSesEvent } from "libs/server-utils/mail/sesEventService";
import { confirmSnsSubscription, verifySnsEnvelopeSignature } from "libs/server-utils/mail/snsEnvelope";
import { buildSesTopicContracts, handleSesWebhookEnvelope, SesWebhookError } from "libs/server-utils/mail/sesWebhook";
import { logger } from "utils/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_SNS_BODY_BYTES = 270 * 1024;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SNS_BODY_BYTES) {
    return NextResponse.json({ success: false, error: "SNS_BODY_TOO_LARGE" }, { status: 413 });
  }
  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > MAX_SNS_BODY_BYTES) {
    return NextResponse.json({ success: false, error: "SNS_BODY_TOO_LARGE" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ success: false, error: "SNS_BODY_INVALID" }, { status: 400 });
  }

  try {
    const topics = buildSesTopicContracts({
      region: AWS_SES_REGION,
      transactionalTopicArn: AWS_SES_TRANSACTIONAL_TOPIC_ARN,
      newsletterTopicArn: AWS_SES_NEWSLETTER_TOPIC_ARN,
      transactionalConfigurationSet: AWS_SES_TRANSACTIONAL_CONFIGURATION_SET,
      newsletterConfigurationSet: AWS_SES_NEWSLETTER_CONFIGURATION_SET,
    });
    const result = await handleSesWebhookEnvelope({
      body,
      headerType: request.headers.get("x-amz-sns-message-type") || "",
      headerTopicArn: request.headers.get("x-amz-sns-topic-arn") || "",
      topics,
      verify: (envelope) => verifySnsEnvelopeSignature(envelope, AWS_SES_REGION),
      confirm: (envelope) => confirmSnsSubscription(envelope, AWS_SES_REGION),
      process: (envelope, topic) =>
        processSesEvent({ envelope, topic, hashSecret: CREDENTIALS_KMS_KEY, receivedAt: new Date() }),
    });
    const eventResult = "result" in result && result.result && typeof result.result === "object" ? result.result : {};
    logger.info("[ses-webhook] accepted", {
      topic: result.topic,
      confirmed: "confirmed" in result ? result.confirmed : false,
      eventType: "eventType" in eventResult ? eventResult.eventType : undefined,
      created: "created" in eventResult ? eventResult.created : undefined,
      suppressed: "suppressed" in eventResult ? eventResult.suppressed : undefined,
      suppressionLatencyMs: "suppressionLatencyMs" in eventResult ? eventResult.suppressionLatencyMs : undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const status = error instanceof SesWebhookError ? error.status : 500;
    const code = error instanceof SesWebhookError ? error.code : "SES_WEBHOOK_INTERNAL_ERROR";
    logger.warn("[ses-webhook] rejected", { status, code });
    return NextResponse.json({ success: false, error: code }, { status });
  }
}
