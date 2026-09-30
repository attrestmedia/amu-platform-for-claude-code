import "server-only";

import type { TradingNotificationSeverity, TradingNotificationType } from "models/trading";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Private Trade Lab — 트레이딩 알림 기록 + Slack 웹훅 (TL-204)
 * @process 이벤트 발생  DB 저장  Slack 웹훅(선택)  로그 기록
 * @domain trading
 * @scope private-trade-lab
 *
 * 무인 운영 중 알아채야 하는 이벤트를 trading_notifications에 저장하고,
 * TRADING_SLACK_WEBHOOK_URL이 설정되어 있으면 Slack으로도 전송한다.
 */

const MODEL_NAME = "TradingNotification";

async function getModel() {
  const { TradingNotificationSchema } = await import("models/trading");
  const mongoose = await import("mongoose");
  return mongoose.models[MODEL_NAME] ?? mongoose.model(MODEL_NAME, TradingNotificationSchema);
}

async function sendSlackWebhook(text: string): Promise<boolean> {
  const webhookUrl = process.env.TRADING_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    return true;
  } catch {
    return false;
  }
}

export type NotifyTradingEventArgs = {
  type: TradingNotificationType;
  severity: TradingNotificationSeverity;
  provider?: string;
  title: string;
  detail: string;
};

export async function notifyTradingEvent(args: NotifyTradingEventArgs): Promise<void> {
  const { type, severity, provider, title, detail } = args;

  // 로그
  const logMeta: Record<string, unknown> = { type, severity, title };
  if (provider) logMeta.provider = provider;
  if (severity === "critical") {
    logger.error("[trading-notify] " + detail, logMeta);
  } else if (severity === "warn") {
    logger.warn("[trading-notify] " + detail, logMeta);
  } else {
    logger.info("[trading-notify] " + detail, logMeta);
  }

  // DB 저장
  try {
    const Model = await getModel();
    await Model.create({
      type,
      severity,
      provider: provider || undefined,
      title,
      detail,
      read: false,
    });
  } catch (error) {
    logger.error("[trading-notify] DB 저장 실패", { error: String(error) });
  }

  // Slack 웹훅 (warn 이상만 전송)
  if (severity !== "info") {
    const emoji = severity === "critical" ? "🔴" : "🟡";
    const providerTag = provider ? `[${provider}] ` : "";
    const slackText = `${emoji} ${providerTag}*${title}*\n${detail}`;
    sendSlackWebhook(slackText).catch(() => null);
  }
}

/** 최근 알림 N건 조회 */
export async function getRecentNotifications(limit = 20) {
  try {
    const Model = await getModel();
    const docs = await Model.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map((doc: Record<string, unknown>) => ({
      id: String(doc._id),
      type: String(doc.type || ""),
      severity: String(doc.severity || "info"),
      provider: doc.provider ? String(doc.provider) : undefined,
      title: String(doc.title || ""),
      detail: String(doc.detail || ""),
      read: Boolean(doc.read),
      createdAt: doc.createdAt ? new Date(String(doc.createdAt)).toISOString() : null,
    }));
  } catch {
    return [];
  }
}

/** 읽지 않은 알림 수 */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const Model = await getModel();
    return await Model.countDocuments({ read: false });
  } catch {
    return 0;
  }
}
