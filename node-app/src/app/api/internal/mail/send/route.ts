import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeJsonRequest } from "libs/server-utils/api/wpBridgeAuth";
import { enqueueMail } from "libs/server-utils/mail/mailQueue";
import {
  isAcceptedWpMailStatus,
  parseWpMailBridgePayload,
  recipientMessageId,
  WpMailBridgeInputError,
} from "libs/server-utils/mail/wpMailBridge";
import { logger } from "utils/log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const bodyText = await request.text();
  const verified = verifyWpBridgeJsonRequest({ request, bodyText });
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error, requestId }, { status: verified.status });
  }
  if (bodyText.length > 1_600_000) {
    return NextResponse.json({ ok: false, error: "invalid_mail_payload", errorCode: "PAYLOAD_TOO_LARGE", requestId }, { status: 413 });
  }

  try {
    let decoded: unknown;
    try {
      decoded = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json", requestId }, { status: 400 });
    }
    const payload = parseWpMailBridgePayload(decoded);
    const results = [];
    for (const [index, recipientEmail] of payload.recipients.entries()) {
      const result = await enqueueMail({
        messageId: recipientMessageId(payload.messageId, index, payload.recipients.length),
        category: "transactional",
        templateKey: "wordpress.wp_mail",
        locale: "ko",
        recipientEmail,
        replyTo: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      results.push(result);
    }
    if (results.some((result) => !isAcceptedWpMailStatus(result.status))) {
      return NextResponse.json({ ok: false, error: "mail_not_accepted", requestId }, { status: 409 });
    }
    return NextResponse.json(
      {
        ok: true,
        data: {
          messageId: payload.messageId,
          recipientCount: results.length,
          results: results.map(({ messageId, created, status }) => ({ messageId, created, status })),
        },
        requestId,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof WpMailBridgeInputError) {
      return NextResponse.json(
        { ok: false, error: "invalid_mail_payload", errorCode: error.errorCode, requestId },
        { status: 400 },
      );
    }
    logger.error("WordPress mail bridge enqueue failed", { requestId });
    return NextResponse.json({ ok: false, error: "mail_queue_unavailable", requestId }, { status: 503 });
  }
}
