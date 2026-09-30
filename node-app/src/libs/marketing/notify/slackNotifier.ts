import "server-only";

import { NEXTAUTH_URL } from "consts/env/server";
import { MARKETING_SLACK_ENABLED } from "consts/marketing/server";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { decodeHtmlEntities } from "utils/common";
import { logger } from "utils/log";

type MarketingSlackEvent =
  | "queue_enqueued"
  | "threads_published"
  | "threads_failed"
  | "waiting_review"
  | "job_partial"
  | "job_failed"
  | "job_success";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function getEventTitle(event: MarketingSlackEvent) {
  switch (event) {
    case "queue_enqueued":
      return "마케팅 큐 적재";
    case "threads_published":
      return "Threads 자동 발행 성공";
    case "threads_failed":
      return "Threads 자동 발행 실패";
    case "waiting_review":
      return "운영 검토 대기";
    case "job_partial":
      return "마케팅 job 부분 실패";
    case "job_failed":
      return "마케팅 job 실패";
    case "job_success":
      return "마케팅 job 완료";
    default:
      return "마케팅 상태 알림";
  }
}

function toChannelLines(channels?: Record<string, string>) {
  return Object.entries(channels || {})
    .map(([key, value]) => `• ${key}: ${value}`)
    .join("\n");
}

function toDashboardUrl(universeId: string, jobId: string) {
  const base = toSafeString(NEXTAUTH_URL).replace(/\/+$/, "");
  return `${base}/api/marketing/content-queue/${encodeURIComponent(jobId)}?universeId=${encodeURIComponent(universeId)}`;
}

export async function sendMarketingSlackNotification(args: {
  universeId: string;
  jobId: string;
  event: MarketingSlackEvent;
  postTitle?: string;
  postUrl?: string;
  summary?: string;
  channels?: Record<string, string>;
}) {
  if (!MARKETING_SLACK_ENABLED) {
    return { ok: true as const, status: "disabled" as const };
  }

  try {
    const credential = await getDecryptedCredential(args.universeId, "slack");
    const webhookUrl = toSafeString(credential?.clientSecret);
    if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
      return { ok: true as const, status: "missing_credential" as const };
    }

    const dashboardUrl = toDashboardUrl(args.universeId, args.jobId);
    const channelLines = toChannelLines(args.channels);
    const postTitle = decodeHtmlEntities(toSafeString(args.postTitle));
    const body = {
      text: `[${getEventTitle(args.event)}] ${postTitle || args.jobId}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: getEventTitle(args.event),
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Job ID*\n${args.jobId}`,
            },
            {
              type: "mrkdwn",
              text: `*Universe*\n${args.universeId}`,
            },
          ],
        },
        ...(postTitle || toSafeString(args.postUrl)
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*원본 글*\n${postTitle || "-"}\n${toSafeString(args.postUrl) || ""}`.trim(),
                },
              },
            ]
          : []),
        ...(channelLines
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*채널 상태*\n${channelLines}`,
                },
              },
            ]
          : []),
        ...(toSafeString(args.summary)
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*요약*\n${toSafeString(args.summary)}`,
                },
              },
            ]
          : []),
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "job detail",
              },
              url: dashboardUrl,
            },
          ],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => "");
      logger.warn("[marketing/slack] webhook failed", {
        status: response.status,
        body: rawText,
        event: args.event,
        jobId: args.jobId,
      });
      return {
        ok: false as const,
        status: "failed" as const,
        error: `slack_webhook_failed:${response.status}`,
      };
    }

    return { ok: true as const, status: "sent" as const, dashboardUrl };
  } catch (error: unknown) {
    const errLike = error as { message?: unknown } | null | undefined;
    logger.warn("[marketing/slack] send failed", {
      message: (typeof errLike?.message === "string" && errLike.message) || String(error),
      event: args.event,
      jobId: args.jobId,
    });
    return {
      ok: false as const,
      status: "failed" as const,
      error: toSafeString(errLike?.message) || "slack_send_failed",
    };
  }
}
