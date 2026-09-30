import "server-only";

import { MAIL_DELIVERABILITY_ALERT_WEBHOOK_URL } from "consts/env/server";
import { logger } from "utils/log";
import type { MailMessageCategory } from "models/mail";

export async function sendSesDeliverabilityAlert(input: {
  category: MailMessageCategory;
  windowStart: Date;
  sendCount: number;
  bounceCount: number;
  complaintCount: number;
  bounceRate: number;
  complaintRate: number;
  reasons: readonly string[];
  blockedUntil?: Date;
}) {
  const webhookUrl = MAIL_DELIVERABILITY_ALERT_WEBHOOK_URL.trim();
  if (!webhookUrl) {
    logger.warn("[ses-deliverability] 알림 webhook이 없어 알림을 건너뜁니다.", {
      category: input.category,
      reasons: input.reasons,
    });
    return { ok: true as const, status: "disabled" as const };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text: `[SES deliverability] ${input.category} 임계 초과 (${input.reasons.join(", ")})`,
        blocks: [
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Category*\n${input.category}` },
              { type: "mrkdwn", text: `*Window*\n${input.windowStart.toISOString()}` },
              { type: "mrkdwn", text: `*Sends*\n${input.sendCount}` },
              { type: "mrkdwn", text: `*Bounce*\n${input.bounceCount} (${input.bounceRate.toFixed(3)}%)` },
              { type: "mrkdwn", text: `*Complaint*\n${input.complaintCount} (${input.complaintRate.toFixed(3)}%)` },
              { type: "mrkdwn", text: `*Action*\n${input.blockedUntil ? `newsletter 보류: ${input.blockedUntil.toISOString()}` : "알림만"}` },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      logger.warn("[ses-deliverability] 알림 webhook 요청이 실패했습니다.", {
        status: response.status,
        category: input.category,
      });
      return { ok: false as const, status: "failed" as const };
    }
    return { ok: true as const, status: "sent" as const };
  } catch (error) {
    logger.warn("[ses-deliverability] 알림 전송 중 오류가 발생했습니다.", {
      category: input.category,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, status: "failed" as const };
  } finally {
    clearTimeout(timeout);
  }
}
