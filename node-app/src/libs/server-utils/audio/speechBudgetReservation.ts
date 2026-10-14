import "server-only";
import { randomUUID } from "node:crypto";
import { SPEECH_RUNTIME_MANIFEST, type SpeechBudgetRole } from "consts/ai/speechRuntimeManifest";
import { estimateSpeechListPriceUsd } from "consts/ai/speechListPrice";
import type { SpeechBillingUnitType } from "consts/ai/speechModel";
import { resolveSpeechBudgetBlock, type SpeechBudgetOwnerType } from "consts/system/speechRuntimeControls";
import { getPlatformCredentialEnvironment } from "consts/secure/platformCredentials";
import {
  adjustSpeechBudgetUsageForReservation,
  createSpeechBudgetReservationRecord,
  findSpeechBudgetReservation,
  incrementSpeechBudgetGuard,
  readCommittedSpeechBudgetUsage,
  runSpeechBudgetTransaction,
} from "libs/database/system";
import { getSpeechRuntimeControls, getStoredSpeechRuntimeControls } from "libs/server-utils/system/speechRuntimeControls";
import { logger } from "utils/log";
import { resolveElevenLabsAudienceBlock } from "./elevenlabsAudiencePolicy";
import { createSpeechError } from "./guards";
import {
  isRetiredSpeechBudgetOwner,
  isSpeechBudgetEnforced,
  resolveSpeechBudgetOwner,
  resolveSpeechBudgetPeriodKeys,
} from "./speechBudgetPolicy";
import type { ISpeechBillingContext } from "./types";
import { resolveAdultEligibility } from "./voiceDataConsent";
import { sweepExpiredSpeechBudgetReservations } from "./speechBudgetReservationReconciliation";

/**
 * @docHint
 * @purpose speech 예산 상한의 provider 전 예약과 check-only 사전 판정 orchestration
 * @process owner·audience·가격 판정  committed 상한 확인  Mongo transaction 예약
 * @domain speech
 * @scope server
 */

export {
  markSpeechBudgetUnknownOutcome,
  releaseSpeechBudget,
  settleSpeechBudget,
  sweepExpiredSpeechBudgetReservations,
} from "./speechBudgetReservationReconciliation";

/** 예약이 provider 요청 timeout을 넘겨도 열린 요청을 잠그지 않도록 하는 기술적 만료 시간. */
export const SPEECH_BUDGET_RESERVATION_TTL_MS = 10 * 60 * 1000;
const RESERVATION_RETENTION_DAYS = 400;

export type SpeechBudgetReservation =
  | { enforced: false }
  | {
      enforced: true;
      reservationKey: string;
      owner: SpeechBudgetOwnerType;
      provider: string;
      modelName: string;
      unit: SpeechBillingUnitType;
      reservedUsd: number;
    };

type SpeechBudgetRequest = {
  role: SpeechBudgetRole;
  provider: string;
  modelName: string;
  unit: SpeechBillingUnitType;
  quantity: number;
  billing?: ISpeechBillingContext;
  user?: unknown;
};

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  return String(record.errorCode || "");
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
  // DB driver 오류의 message/stack에는 연결 URI가 포함될 수 있어 안전한 메타데이터만 기록한다.
  logger.error(`[speech-budget] ${stage} 실패 — 저장소 작업을 확인해야 합니다.`, safeErrorMetadata(error));
}

function throwStoreUnavailable(error?: unknown): never {
  if (error) logStorageFailure("reservation", error);
  throw createSpeechError("음성 예산 저장소를 확인할 수 없어 요청을 처리할 수 없습니다.", "SPEECH_BUDGET_STORE_UNAVAILABLE", 503);
}

function throwBudgetExceeded(args: {
  provider: string;
  modelName: string;
  owner?: SpeechBudgetOwnerType;
  role: SpeechBudgetRole;
  estimatedUsd: number;
  controls: Awaited<ReturnType<typeof getSpeechRuntimeControls>>;
  usage?: Awaited<ReturnType<typeof readCommittedSpeechBudgetUsage>>;
}): never | void {
  const blockedReason = resolveSpeechBudgetBlock({
    controls: args.controls,
    provider: args.provider,
    owner: args.owner || "",
    role: args.role,
    estimatedUsd: args.estimatedUsd,
    ownerUsage: args.usage?.owner,
    globalUsage: args.usage?.global,
  });
  if (!blockedReason) return;
  throw createSpeechError("승인된 음성 지출 상한을 넘어 요청을 처리할 수 없습니다.", "SPEECH_BUDGET_EXCEEDED", 429, {
    provider: args.provider,
    modelName: args.modelName,
    owner: args.owner || null,
    estimatedUsd: args.estimatedUsd,
    blockedReason,
  });
}

function assertKnownBudgetOwner(
  owner: SpeechBudgetOwnerType | undefined,
  provider: string,
  modelName: string,
  estimatedUsd: number,
): asserts owner is SpeechBudgetOwnerType {
  if (owner) return;
  throw createSpeechError("음성 예산 소유자를 확인할 수 없어 요청을 처리할 수 없습니다.", "SPEECH_BUDGET_EXCEEDED", 429, {
    provider,
    modelName,
    owner: null,
    estimatedUsd,
    blockedReason: "budget_owner_unknown",
  });
}

async function resolveRequest(args: SpeechBudgetRequest) {
  const provider = String(args.provider || "").trim().toLowerCase();
  const modelName = String(args.modelName || "").trim();
  const owner = resolveSpeechBudgetOwner(args.billing);
  if (!isSpeechBudgetEnforced(provider, owner, SPEECH_RUNTIME_MANIFEST, args.role)) {
    return { enforced: false as const, provider, modelName };
  }

  if (isRetiredSpeechBudgetOwner(owner)) {
    throw createSpeechError("은퇴한 음성 예산 소유자는 새 지출을 만들 수 없습니다.", "SPEECH_BUDGET_EXCEEDED", 429, {
      provider,
      modelName,
      owner,
      blockedReason: "budget_owner_disabled",
    });
  }

  if (provider === "elevenlabs") {
    const audienceBlock = resolveElevenLabsAudienceBlock({
      owner,
      adultEligibility: resolveAdultEligibility(args.user),
    });
    if (audienceBlock) {
      throw createSpeechError("이 음성 기능은 성인 이용자에게만 제공됩니다.", "SPEECH_AUDIENCE_RESTRICTED", 403, {
        provider,
        owner: owner || null,
        blockedReason: audienceBlock,
      });
    }
  }

  const estimatedUsd = estimateSpeechListPriceUsd({ provider, modelName, unit: args.unit, quantity: args.quantity });
  if (estimatedUsd === null) {
    throw createSpeechError("이 모델의 정가가 확인되지 않아 지출 상한을 판정할 수 없습니다.", "SPEECH_PRICING_UNVERIFIED", 503, {
      provider,
      modelName,
      unit: args.unit,
    });
  }

  const controls = SPEECH_RUNTIME_MANIFEST.budgetRoleScope[provider]
    ? await getStoredSpeechRuntimeControls()
    : await getSpeechRuntimeControls();
  return { enforced: true as const, provider, modelName, owner, role: args.role, estimatedUsd, controls };
}

function usageExpiry(at: Date) {
  return new Date(at.getTime() + RESERVATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function toDecision(record: {
  reservationKey: string;
  owner: SpeechBudgetOwnerType;
  provider: string;
  modelName: string;
  unit: SpeechBillingUnitType;
  reservedUsd: number;
}): SpeechBudgetReservation {
  return {
    enforced: true,
    reservationKey: record.reservationKey,
    owner: record.owner,
    provider: record.provider,
    modelName: record.modelName,
    unit: record.unit,
    reservedUsd: Number(record.reservedUsd),
  };
}

/** provider dispatch 전에 예산을 원자 예약한다. 저장소 오류는 반드시 503으로 차단한다. */
export async function reserveSpeechBudgetOrThrow(args: SpeechBudgetRequest & {
  /** 호출부는 provider dispatch 시도마다 고유한 키를 넘긴다. 없으면 서버가 `speech-budget:${randomUUID()}`를 만든다. */
  reservationKey?: string;
  /** 없으면 provider|modelName|unit|quantity 조합으로 서버가 만든다. */
  requestHash?: string;
}): Promise<SpeechBudgetReservation> {
  const preflight = await resolveRequest(args);
  if (!preflight.enforced) return { enforced: false };
  const owner = preflight.owner;
  assertKnownBudgetOwner(owner, preflight.provider, preflight.modelName, preflight.estimatedUsd);

  const environment = getPlatformCredentialEnvironment();
  const now = new Date();
  const { day, month } = resolveSpeechBudgetPeriodKeys(now);
  const reservationKey = String(args.reservationKey || `speech-budget:${randomUUID()}`);
  const requestHash = String(
    args.requestHash || `${preflight.provider}|${preflight.modelName}|${args.unit}|${args.quantity}`,
  );

  // 만료 예약은 보수적으로 assumed_charged로 바꾼다. sweep 장애는 열린 예약을 계속 상한에 포함하므로 fail-open이 아니다.
  try {
    await sweepExpiredSpeechBudgetReservations({ provider: preflight.provider, limit: 20, now });
  } catch (error) {
    logStorageFailure("expired reservation sweep", error);
  }

  try {
    return await runSpeechBudgetTransaction(async (session) => {
      const existing = await findSpeechBudgetReservation({ environment, reservationKey, session });
      if (existing) {
        throw createSpeechError("같은 음성 예산 예약 키가 이미 사용되었습니다.", "SPEECH_BUDGET_RESERVATION_CONFLICT", 409, {
          provider: preflight.provider,
          reservationKey,
        });
      }

      await incrementSpeechBudgetGuard({ environment, provider: preflight.provider, session });
      const usage = await readCommittedSpeechBudgetUsage({
        environment,
        owner,
        provider: preflight.provider,
        at: now,
        session,
      });
      throwBudgetExceeded({ ...preflight, owner, usage });

      const record = {
        environment,
        reservationKey,
        requestHash,
        owner,
        provider: preflight.provider,
        modelName: preflight.modelName,
        unit: args.unit,
        estimatedQuantity: Number(args.quantity),
        reservedUsd: preflight.estimatedUsd,
        actualUsd: null,
        dayKey: day,
        monthKey: month,
        state: "reserved" as const,
        budgetAccounting: "held" as const,
        reason: null,
        expiresAt: new Date(now.getTime() + SPEECH_BUDGET_RESERVATION_TTL_MS),
        resolvedAt: null,
        retainUntil: usageExpiry(now),
      };
      await createSpeechBudgetReservationRecord({ record, session });
      await adjustSpeechBudgetUsageForReservation({
        environment,
        owner,
        provider: preflight.provider,
        dayKey: day,
        monthKey: month,
        reservedUsdDelta: preflight.estimatedUsd,
        spentUsdDelta: 0,
        requestCountDelta: 0,
        expiresAt: usageExpiry(now),
        session,
      });
      return toDecision(record);
    });
  } catch (error) {
    const code = readErrorCode(error);
    if (code === "SPEECH_BUDGET_EXCEEDED" || code === "SPEECH_BUDGET_RESERVATION_CONFLICT") throw error;
    throwStoreUnavailable(error);
  }
}

/** 사전 안내용 판정이다. 이 결과만으로 provider dispatch를 허용하지 않는다. */
export async function checkSpeechBudgetOrThrow(args: SpeechBudgetRequest): Promise<{
  enforced: boolean;
  owner?: SpeechBudgetOwnerType;
  estimatedUsd?: number;
}> {
  const preflight = await resolveRequest(args);
  if (!preflight.enforced) return { enforced: false };
  const owner = preflight.owner;
  assertKnownBudgetOwner(owner, preflight.provider, preflight.modelName, preflight.estimatedUsd);

  let usage: Awaited<ReturnType<typeof readCommittedSpeechBudgetUsage>>;
  try {
    usage = await readCommittedSpeechBudgetUsage({
      owner,
      provider: preflight.provider,
    });
  } catch (error) {
    throwStoreUnavailable(error);
  }
  throwBudgetExceeded({ ...preflight, usage });
  return { enforced: true, owner, estimatedUsd: preflight.estimatedUsd };
}
