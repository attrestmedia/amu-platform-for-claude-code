import "server-only";
import { logger } from "utils/log";
import type { AiCostMonitorFxObservation, AiCostMonitorFxUnavailableReason } from "types/ai";

/**
 * @docHint
 * @purpose Frankfurter USD/KRW 관측값을 관리자 비용 모니터에서 읽는다
 * @process 고정 공개 endpoint를 1회 조회하고 응답을 검증해 실패 상태를 반환한다
 * @domain ai
 * @scope server
 */

const FRANKFURTER_USD_KRW_URL = "https://api.frankfurter.dev/v2/rate/USD/KRW";
const SOURCE = "frankfurter_v2" as const;

type FxObservationReaderOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function fetchedAtIso(now: () => Date) {
  const value = now();
  return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
}

function unavailable(
  reason: AiCostMonitorFxUnavailableReason,
  fetchedAt: string,
): AiCostMonitorFxObservation {
  return {
    status: "unavailable",
    reason,
    rate: null,
    rateDate: null,
    fetchedAt,
    source: SOURCE,
    sourceUrl: FRANKFURTER_USD_KRW_URL,
  };
}

export async function readFrankfurterUsdKrw({
  fetchImpl = fetch,
  now = () => new Date(),
  timeoutMs = 3000,
}: FxObservationReaderOptions = {}): Promise<AiCostMonitorFxObservation> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(FRANKFURTER_USD_KRW_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const fetchedAt = fetchedAtIso(now);

    if (!response.ok) {
      logger.warn("[ai-cost-monitor] FX observation unavailable", { reason: "FX_HTTP_ERROR" });
      return unavailable("FX_HTTP_ERROR", fetchedAt);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      const reason = timedOut ? "FX_TIMEOUT" : "FX_INVALID_RESPONSE";
      logger.warn("[ai-cost-monitor] FX observation unavailable", { reason });
      return unavailable(reason, fetchedAt);
    }

    if (
      !isRecord(payload) ||
      typeof payload.rate !== "number" || !Number.isFinite(payload.rate) || payload.rate <= 0 ||
      !isDate(payload.date) || payload.base !== "USD" || payload.quote !== "KRW"
    ) {
      logger.warn("[ai-cost-monitor] FX observation unavailable", { reason: "FX_INVALID_RESPONSE" });
      return unavailable("FX_INVALID_RESPONSE", fetchedAt);
    }

    return {
      status: "ok",
      rate: payload.rate,
      rateDate: payload.date,
      fetchedAt,
      source: SOURCE,
      sourceUrl: FRANKFURTER_USD_KRW_URL,
    };
  } catch (error: unknown) {
    const isAbort = error !== null && typeof error === "object" && "name" in error && error.name === "AbortError";
    const reason: AiCostMonitorFxUnavailableReason = timedOut || isAbort ? "FX_TIMEOUT" : "FX_NETWORK_ERROR";
    logger.warn("[ai-cost-monitor] FX observation unavailable", { reason });
    return unavailable(reason, fetchedAtIso(now));
  } finally {
    clearTimeout(timeout);
  }
}
