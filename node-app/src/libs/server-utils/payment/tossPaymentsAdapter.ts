import "server-only";

import { buildPaymentPgSummary, type PaymentPgSummary } from "./paymentPgSummary";
import type { UnknownRecord } from "utils/common";

export type TossCancelResult =
  | {
      ok: true;
      status: "CANCELED";
      summary: PaymentPgSummary;
      alreadyCanceled: boolean;
    }
  | {
      ok: false;
      code: string;
      retryable: boolean;
      ambiguous: boolean;
      httpStatus?: number;
      summary?: PaymentPgSummary;
    };

export type TossFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function readRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

async function readResponse(response: Response): Promise<UnknownRecord> {
  try {
    return readRecord(await response.json());
  } catch {
    return {};
  }
}

export function buildTossCancelUrl(baseUrl: string, paymentKey: string): string {
  const normalizedBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  const normalizedPaymentKey = String(paymentKey || "").trim();
  if (!normalizedBase || !normalizedPaymentKey) {
    throw Object.assign(new Error("Toss 취소 URL 구성값이 없습니다."), {
      errorCode: "TOSS_CANCEL_CONFIG_INVALID",
      status: 500,
    });
  }

  const cancelBase = normalizedBase.endsWith("/confirm")
    ? normalizedBase.slice(0, -"/confirm".length)
    : normalizedBase;
  return `${cancelBase}/${encodeURIComponent(normalizedPaymentKey)}/cancel`;
}

/**
 * Toss 전체 취소 adapter.
 * 응답 원문은 반환하지 않으며, timeout/네트워크 오류는 취소 성공으로 간주하지 않는다.
 */
export async function cancelTossPayment(input: {
  baseUrl: string;
  secretKey: string;
  paymentKey: string;
  cancelReason: "tax_reconciliation_failed" | "manual_review" | "customer_request";
  idempotencyKey?: string;
  fetchImpl?: TossFetch;
  timeoutMs?: number;
}): Promise<TossCancelResult> {
  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = Math.max(1_000, Math.min(30_000, input.timeoutMs || 15_000));
  const paymentKey = String(input.paymentKey || "").trim();
  if (!paymentKey || !String(input.secretKey || "").trim()) {
    return { ok: false, code: "TOSS_CANCEL_CONFIG_INVALID", retryable: false, ambiguous: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(buildTossCancelUrl(input.baseUrl, paymentKey), {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${input.secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({ cancelReason: input.cancelReason }),
      signal: controller.signal,
    });
    const data = await readResponse(response);
    const summary = buildPaymentPgSummary({ response: data, paymentKey });
    const providerCode = typeof data.code === "string" ? data.code : "";
    const providerStatus = typeof data.status === "string" ? data.status : "";

    if (response.ok && providerStatus === "CANCELED") {
      return {
        ok: true,
        status: "CANCELED",
        summary,
        alreadyCanceled: false,
      };
    }

    // A 2xx transport response does not prove that the cancel state was parsed.
    // The provider may have completed the money movement while the body was
    // truncated or changed shape, so every non-CANCELED 2xx remains ambiguous.
    if (response.ok) {
      const partial = providerStatus === "PARTIAL_CANCELED";
      return {
        ok: false,
        code: partial ? "TOSS_PARTIAL_CANCEL_UNEXPECTED" : "TOSS_CANCEL_RESPONSE_AMBIGUOUS",
        retryable: !partial,
        ambiguous: true,
        httpStatus: response.status || undefined,
        summary,
      };
    }

    // 이 adapter는 전액 취소 전용이다. 부분 취소 응답을 완료로 수렴시키면
    // 앱 원장과 PG 잔액이 달라지므로 운영자 확인 대상으로 fail-closed 처리한다.
    if (providerStatus === "PARTIAL_CANCELED") {
      return {
        ok: false,
        code: "TOSS_PARTIAL_CANCEL_UNEXPECTED",
        retryable: false,
        ambiguous: false,
        httpStatus: response.status || undefined,
        summary,
      };
    }

    if (providerCode === "ALREADY_CANCELED" || providerStatus === "CANCELED") {
      return { ok: true, status: "CANCELED", summary, alreadyCanceled: true };
    }

    const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
    return {
      ok: false,
      code: providerCode || `TOSS_CANCEL_HTTP_${response.status || 502}`,
      retryable,
      ambiguous: !response.ok && (response.status === 408 || response.status === 429 || response.status >= 500),
      httpStatus: response.status || undefined,
      summary,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      code: isAbort ? "TOSS_CANCEL_TIMEOUT" : "TOSS_CANCEL_NETWORK_ERROR",
      retryable: true,
      ambiguous: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
