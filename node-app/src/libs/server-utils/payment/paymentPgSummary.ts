import "server-only";

import { createHash } from "node:crypto";
import type { UnknownRecord } from "utils/common";

type SafeMoneyField = "totalAmount" | "suppliedAmount" | "vat" | "taxFreeAmount" | "balanceAmount";

export type PaymentPgSummary = {
  status?: string;
  method?: string;
  totalAmount?: number;
  suppliedAmount?: number;
  vat?: number;
  taxFreeAmount?: number;
  balanceAmount?: number;
  transactionKeyHash?: string;
  observedAt: Date;
};

function safeMoney(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function safeString(value: unknown, maxLength = 48): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

/**
 * Toss 응답에서 결제 원문·카드정보·고객정보를 제거하고 대사에 필요한 최소 요약만 만든다.
 * paymentKey는 취소에 필요하므로 별도 내부 필드로 보관하되, 요약에는 해시만 남긴다.
 */
export function buildPaymentPgSummary(input: {
  response: UnknownRecord;
  paymentKey?: string;
  observedAt?: Date;
}): PaymentPgSummary {
  const response = input.response;
  const summary: PaymentPgSummary = {
    observedAt: input.observedAt || new Date(),
  };

  for (const field of ["totalAmount", "suppliedAmount", "vat", "taxFreeAmount", "balanceAmount"] as SafeMoneyField[]) {
    const value = safeMoney(response[field]);
    if (value !== undefined) summary[field] = value;
  }

  const status = safeString(response.status);
  const method = safeString(response.method);
  if (status) summary.status = status;
  if (method) summary.method = method;

  const paymentKey = String(input.paymentKey || "").trim();
  if (paymentKey) {
    summary.transactionKeyHash = createHash("sha256").update(paymentKey).digest("hex");
  }
  return summary;
}

export function buildPaymentPgSummaryFromPayment(input: {
  totalAmount?: unknown;
  suppliedAmount?: unknown;
  vat?: unknown;
  taxFreeAmount?: unknown;
  paymentKey?: string;
  observedAt?: Date;
}): PaymentPgSummary {
  return buildPaymentPgSummary({
    response: {
      status: "ORDER_SNAPSHOT",
      totalAmount: input.totalAmount,
      suppliedAmount: input.suppliedAmount,
      vat: input.vat,
      taxFreeAmount: input.taxFreeAmount,
    },
    paymentKey: input.paymentKey,
    observedAt: input.observedAt,
  });
}
