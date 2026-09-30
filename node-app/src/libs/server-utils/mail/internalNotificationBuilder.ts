import { createHash } from "crypto";
import type { EnqueueMailInput } from "./queueTypes";
import { renderMailTemplate } from "./templates";
import { buildPaymentNotificationMessageId, type PaymentNotificationEvent } from "libs/server-utils/payment/paymentNotificationContract";

type DeletionWordPressStatus = "deleted" | "suspended" | "not_linked";

function internalMessageId(kind: string, entityId: string, eventAt: Date) {
  const digest = createHash("sha256")
    .update(`${kind}:${entityId}:${eventAt.toISOString()}`)
    .digest("hex");
  return `internal-${kind}:${digest}`;
}

function formatKoreanDateTime(value: Date) {
  return value.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export function buildAccountDeletionRequestedMail(input: {
  requestId: string;
  recipientEmail: string;
  requestedAt: Date;
  supportUrl: string;
  reviewRequired?: boolean;
}): EnqueueMailInput {
  const key = input.reviewRequired ? "account.deletion_review_required" : "account.deletion_requested";
  const rendered = renderMailTemplate({
    key,
    locale: "ko",
    data: {
      requestedAt: formatKoreanDateTime(input.requestedAt),
      supportUrl: input.supportUrl,
    },
  });
  return {
    messageId: internalMessageId(
      input.reviewRequired ? "deletion-review-required" : "deletion-requested",
      input.requestId,
      input.requestedAt,
    ),
    category: "transactional",
    templateKey: key,
    locale: "ko",
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

export function buildAccountDeletionProcessingMail(input: {
  requestId: string;
  recipientEmail: string;
  processedAt: Date;
  wordpressStatus: DeletionWordPressStatus;
  supportUrl: string;
}): EnqueueMailInput {
  const wordpressStatus = {
    deleted: "삭제됨",
    suspended: "접근 정지됨 — 최종 삭제 재처리 필요",
    not_linked: "연결된 매거진 계정 없음",
  }[input.wordpressStatus];
  const rendered = renderMailTemplate({
    key: "account.deletion_processing",
    locale: "ko",
    data: {
      processedAt: formatKoreanDateTime(input.processedAt),
      wordpressStatus,
      supportUrl: input.supportUrl,
    },
  });
  return {
    messageId: internalMessageId("deletion-processing", input.requestId, input.processedAt),
    category: "transactional",
    templateKey: "account.deletion_processing",
    locale: "ko",
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

export function buildAccountDeletionFailedMail(input: {
  requestId: string;
  recipientEmail: string;
  failedAt: Date;
  supportUrl: string;
}): EnqueueMailInput {
  const rendered = renderMailTemplate({
    key: "account.deletion_failed",
    locale: "ko",
    data: {
      failedAt: formatKoreanDateTime(input.failedAt),
      supportUrl: input.supportUrl,
    },
  });
  return {
    messageId: internalMessageId("deletion-failed", input.requestId, input.failedAt),
    category: "transactional",
    templateKey: "account.deletion_failed",
    locale: "ko",
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

export function buildPaymentConfirmedMail(input: {
  orderId: string;
  recipientEmail: string;
  paidAt: Date;
  amount: number;
  creditedCoins: number;
  purpose: "subscription" | "coin_pack";
  context: string;
  stateVersion?: number;
}): EnqueueMailInput {
  const rendered = renderMailTemplate({
    key: "payment.confirmed",
    locale: "ko",
    data: {
      orderId: input.orderId,
      paidAt: formatKoreanDateTime(input.paidAt),
      amount: `${Math.max(0, input.amount).toLocaleString("ko-KR")}원`,
      creditedCoins: `${Math.max(0, input.creditedCoins).toLocaleString("ko-KR")}코인`,
      purpose: input.purpose === "subscription" ? "Membership 구독" : "Charged 코인 충전",
      context: input.context,
    },
  });
  return {
    messageId: input.stateVersion === undefined
      ? internalMessageId("payment-confirmed", input.orderId, input.paidAt)
      : buildPaymentNotificationMessageId({ orderId: input.orderId, event: "payment.confirmed", stateVersion: input.stateVersion }),
    category: "transactional",
    templateKey: "payment.confirmed",
    locale: "ko",
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

type PaymentStatusMailEvent = Exclude<PaymentNotificationEvent, "payment.confirmed">;

export function buildPaymentStatusMail(input: {
  event: PaymentStatusMailEvent;
  orderId: string;
  recipientEmail: string;
  occurredAt: Date;
  stateVersion: number;
  supportUrl: string;
  amount?: number;
  locale?: "ko" | "en";
}): EnqueueMailInput {
  const locale = input.locale || "ko";
  if ((input.event === "payment.canceled" || input.event === "payment.refunded") && input.amount === undefined) {
    throw new Error("PAYMENT_NOTIFICATION_AMOUNT_REQUIRED");
  }
  const occurredAt = formatKoreanDateTime(input.occurredAt);
  const amount = `${Math.max(0, input.amount ?? 0).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}원`;
  const common = {
    locale,
    orderId: input.orderId,
    occurredAt,
    supportUrl: input.supportUrl,
  };
  const rendered = input.event === "payment.reconciliation_failed"
    ? renderMailTemplate({ key: input.event, locale, data: common })
    : input.event === "payment.manual_review"
      ? renderMailTemplate({ key: input.event, locale, data: common })
      : renderMailTemplate({ key: input.event, locale, data: { ...common, amount } });
  return {
    messageId: buildPaymentNotificationMessageId({ orderId: input.orderId, event: input.event, stateVersion: input.stateVersion }),
    category: "transactional",
    templateKey: input.event,
    locale,
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}
