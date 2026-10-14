import "server-only";
import { estimateSpeechListPriceUsd } from "consts/ai/speechListPrice";
import { getPlatformCredentialEnvironment } from "consts/secure/platformCredentials";
import {
  adjustSpeechBudgetUsageForReservation,
  findSpeechBudgetReservation,
  listExpiredSpeechBudgetReservations,
  runSpeechBudgetTransaction,
  transitionSpeechBudgetReservation,
} from "libs/database/system";
import { logger } from "utils/log";
import type { SpeechBudgetReservation } from "./speechBudgetReservation";

/**
 * @docHint
 * @purpose 열린 speech 예산 예약의 멱등 정산·해제·unknown 전환 및 만료 sweep
 * @process terminal 상태 조건 갱신  동일 transaction usage 조정  실패 안전 로깅
 * @domain speech
 * @scope server
 */

const RESERVATION_RETENTION_DAYS = 400;
type ReservationTransition = "settled" | "released" | "unknown_outcome";

function usageExpiry(at: Date) {
  return new Date(at.getTime() + RESERVATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function safeErrorMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const record = error as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : "Error",
    code: typeof record.code === "string" || typeof record.code === "number" ? record.code : undefined,
  };
}

function logStorageFailure(stage: string, error: unknown) {
  logger.error(`[speech-budget] ${stage} 실패 — 저장소 작업을 확인해야 합니다.`, safeErrorMetadata(error));
}

async function transitionReservation(args: {
  environment: string;
  reservationKey: string;
  target: ReservationTransition;
  actualQuantity?: number;
  reason: string;
}): Promise<boolean> {
  return await runSpeechBudgetTransaction(async (session) => {
    const record = await findSpeechBudgetReservation({
      environment: args.environment,
      reservationKey: args.reservationKey,
      session,
    });
    if (!record || record.state !== "reserved") {
      if (record?.state === "settled") logger.debug("[speech-budget] 이미 정산된 예약은 다시 반영하지 않습니다.");
      else logger.error("[speech-budget] 열린 예약을 찾지 못했거나 이미 terminal 상태입니다.");
      return false;
    }

    const now = new Date();
    const reservedUsd = Number(record.reservedUsd);
    let actualUsd: number | null = null;
    let budgetAccounting: "actual" | "assumed_charged" | "released" = "released";
    let spentUsdDelta = 0;
    let requestCountDelta = 0;
    if (args.target === "settled") {
      actualUsd =
        estimateSpeechListPriceUsd({
          provider: record.provider,
          modelName: record.modelName,
          unit: record.unit,
          quantity: Number(args.actualQuantity),
        }) ?? reservedUsd;
      budgetAccounting = "actual";
      spentUsdDelta = actualUsd;
      requestCountDelta = 1;
    } else if (args.target === "unknown_outcome") {
      actualUsd = reservedUsd;
      budgetAccounting = "assumed_charged";
      spentUsdDelta = reservedUsd;
      requestCountDelta = 1;
    }

    const changed = await transitionSpeechBudgetReservation({
      environment: args.environment,
      reservationKey: args.reservationKey,
      session,
      state: args.target,
      budgetAccounting,
      actualUsd,
      reason: args.target === "settled" ? null : args.reason.slice(0, 120),
      resolvedAt: now,
    });
    if (!changed) return false;

    await adjustSpeechBudgetUsageForReservation({
      environment: args.environment,
      owner: record.owner,
      provider: record.provider,
      dayKey: record.dayKey,
      monthKey: record.monthKey,
      reservedUsdDelta: -reservedUsd,
      spentUsdDelta,
      requestCountDelta,
      expiresAt: usageExpiry(now),
      session,
    });
    if (args.target === "settled" && actualUsd !== null && actualUsd > reservedUsd) {
      logger.warn("[speech-budget] 실사용 정산액이 예약 상한보다 큽니다.", {
        provider: record.provider,
        modelName: record.modelName,
        reservedUsd,
        actualUsd,
      });
    }
    return true;
  });
}

async function settleUnknownOrRelease(args: {
  reservation: SpeechBudgetReservation;
  target: ReservationTransition;
  reason: string;
  actualQuantity?: number;
}) {
  if (!args.reservation.enforced) return false;
  try {
    return await transitionReservation({
      environment: getPlatformCredentialEnvironment(),
      reservationKey: args.reservation.reservationKey,
      target: args.target,
      reason: args.reason || args.target,
      actualQuantity: args.actualQuantity,
    });
  } catch (error) {
    logStorageFailure(`${args.target} reservation`, error);
    return false;
  }
}

/** 정산 실패는 응답 실패로 바꾸지 않는다. 열린 예약은 만료 sweep에서 보수적으로 확정된다. */
export async function settleSpeechBudget(args: {
  reservation: SpeechBudgetReservation;
  actualQuantity: number;
}): Promise<void> {
  await settleUnknownOrRelease({
    reservation: args.reservation,
    target: "settled",
    actualQuantity: args.actualQuantity,
    reason: "usage_settled",
  });
}

/** provider 요청이 전송되지 않았음이 확정된 경우에만 호출한다. */
export async function releaseSpeechBudget(args: { reservation: SpeechBudgetReservation; reason: string }): Promise<void> {
  await settleUnknownOrRelease({ reservation: args.reservation, target: "released", reason: args.reason });
}

/** provider 요청이 전송됐지만 실제 과금 여부가 불명확한 경우 예약액을 지출로 보존한다. */
export async function markSpeechBudgetUnknownOutcome(args: {
  reservation: SpeechBudgetReservation;
  reason: string;
}): Promise<void> {
  await settleUnknownOrRelease({ reservation: args.reservation, target: "unknown_outcome", reason: args.reason });
}

/** 만료된 reserved 예약을 건별 트랜잭션으로 assumed_charged 처리한다. */
export async function sweepExpiredSpeechBudgetReservations(args?: {
  provider?: string;
  limit?: number;
  now?: Date;
}): Promise<{ converted: number }> {
  const now = args?.now || new Date();
  const environment = getPlatformCredentialEnvironment();
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(args?.limit) || 20)));
  let records: Awaited<ReturnType<typeof listExpiredSpeechBudgetReservations>>;
  try {
    records = await listExpiredSpeechBudgetReservations({
      environment,
      provider: args?.provider,
      limit,
      now,
    });
  } catch (error) {
    logStorageFailure("expired reservation lookup", error);
    throw error;
  }

  let converted = 0;
  for (const record of records) {
    try {
      const changed = await transitionReservation({
        environment,
        reservationKey: record.reservationKey,
        target: "unknown_outcome",
        reason: "reservation_ttl_expired",
      });
      if (changed) converted += 1;
    } catch (error) {
      logStorageFailure("expired reservation conversion", error);
    }
  }
  return { converted };
}
