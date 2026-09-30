import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_notifications (무인 운영 알림 저장소)
 * @process 이벤트 발생  DB 저장  대시보드 노출  웹훅(선택)
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §7.2 컬렉션 목록.
 *
 * 동기화 실패·인증 오류·키 만료 임박 등 무인 운영 중 알아채야 하는
 * 이벤트를 저장한다. 대시보드에서 최근 알림을 확인하고,
 * TRADING_SLACK_WEBHOOK_URL이 설정되어 있으면 Slack으로도 전송한다.
 */

export const TRADING_NOTIFICATION_TYPES = [
  "sync_failed",
  "auth_error",
  "key_expiry_warning",
  "key_expiry_critical",
  "key_expired",
  "connection_invalid",
  "system",
] as const;
export type TradingNotificationType = (typeof TRADING_NOTIFICATION_TYPES)[number];

export const TRADING_NOTIFICATION_SEVERITIES = ["info", "warn", "critical"] as const;
export type TradingNotificationSeverity = (typeof TRADING_NOTIFICATION_SEVERITIES)[number];

export interface ITradingNotificationDocument extends Document {
  type: TradingNotificationType;
  severity: TradingNotificationSeverity;
  provider?: string;
  title: string;
  detail: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const TradingNotificationSchema = new Schema<ITradingNotificationDocument>(
  {
    type: { type: String, required: true, enum: TRADING_NOTIFICATION_TYPES, index: true },
    severity: { type: String, required: true, enum: TRADING_NOTIFICATION_SEVERITIES },
    provider: { type: String, default: undefined },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

/** 최근 알림을 빠르게 조회하기 위한 인덱스 */
TradingNotificationSchema.index({ createdAt: -1 });
TradingNotificationSchema.index({ type: 1, createdAt: -1 });