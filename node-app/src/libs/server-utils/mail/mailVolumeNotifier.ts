import "server-only";

import { MAIL_VOLUME_ALERT_WEBHOOK_URL } from "consts/env/server";
import { logger } from "utils/log";
import type { MailMessageCategory } from "models/mail";

export async function sendMailVolumeAlert(input: {
  category: MailMessageCategory;
  date: string;
  configurationSet: string;
  sendCount: number;
  previousSevenDayAverage: number;
  estimatedCostUsd: number;
  duplicateSendCount: number;
  reasons: readonly string[];
}) {
  const webhookUrl = MAIL_VOLUME_ALERT_WEBHOOK_URL.trim();
  if (!webhookUrl) {
    logger.warn("[ses-volume] 발송량 알림 webhook이 없어 알림을 건너뜁니다.", {
      category: input.category,
      date: input.date,
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
        text: `[SES volume] ${input.category} 발송량 이상 (${input.reasons.join(", ")})`,
        blocks: [
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Category*\n${input.category}` },
              { type: "mrkdwn", text: `*Date*\n${input.date}` },
              { type: "mrkdwn", text: `*Configuration set*\n${input.configurationSet}` },
              { type: "mrkdwn", text: `*Sends*\n${input.sendCount}` },
              { type: "mrkdwn", text: `*7d avg*\n${input.previousSevenDayAverage.toFixed(2)}` },
              { type: "mrkdwn", text: `*Estimated cost*\n$${input.estimatedCostUsd.toFixed(6)}` },
              { type: "mrkdwn", text: `*Duplicate send candidates*\n${input.duplicateSendCount}` },
              { type: "mrkdwn", text: `*Reason*\n${input.reasons.join(", ")}` },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      logger.warn("[ses-volume] 발송량 알림 webhook 요청이 실패했습니다.", {
        status: response.status,
        category: input.category,
        date: input.date,
      });
      return { ok: false as const, status: "failed" as const };
    }
    return { ok: true as const, status: "sent" as const };
  } catch (error) {
    logger.warn("[ses-volume] 발송량 알림 전송 중 오류가 발생했습니다.", {
      category: input.category,
      date: input.date,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, status: "failed" as const };
  } finally {
    clearTimeout(timeout);
  }
}
