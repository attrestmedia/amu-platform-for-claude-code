import type { ClientSession, Model } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { calcCoins } from "utils/payment";
import type { ITokenUsageBreakdown, IFixedUsage } from "types/payment";
import type { IUserDocument } from "models/user";
import { UserSchema } from "models/user";
import type { IUniverseDocument } from "models/universe";
import { UniverseSchema } from "models/universe";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { resolveMembershipCoins, syncAccountTypeByWallet } from "libs/server-utils/payment/paymentUtils";
import type { AiModalityType, BillableProviderType } from "types/ai";
import { MONGODB_AMU_URL, MONGODB_USERS_URL } from "consts/env/server";
import { toUnknownRecord } from "utils/common/typeUtils";
import {
  getAppliedCoinUsageLotDebits,
  getAppliedCoinUsageWalletDebit,
  markCoinUsageLedgerApplied,
  markCoinUsageLedgerFailed,
  markCoinUsageLedgerReconciliationRequired,
  prepareCoinUsageLedger,
} from "libs/server-utils/payment/coinUsageLedgerWriter";
import {
  applyCoinLotCompensationOnce,
  applyCoinLotDebitOnce,
  previewCoinLotDebit,
} from "libs/server-utils/payment/paymentCoinLotUsageService";
import { buildCoinCompensationPlan } from "libs/server-utils/payment/coinCompensationPolicy";
import { walletDebitFromLots } from "libs/server-utils/payment/coinLotPolicy";
import {
  applyWalletUsageOnce,
  assertWalletUsageReceiptCapacity,
} from "libs/server-utils/payment/paymentCoinWalletUsageService";
import {
  allocateUserBonusChargedDebit,
  allocateUserWalletRefund,
} from "libs/server-utils/payment/userWalletBonusPolicy";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain billing_coin
 * @scope server_global
 */

// 새 지갑 차감 정책 타입
type WalletDeductPolicy = "membership" | "charged" | "bonus_charged" | "mixed";
type WalletQuery = Record<string, unknown>;
type WalletUpdate = { $inc: Record<string, number>; $set?: Record<string, unknown> };
type CoinCalculation = ReturnType<typeof calcCoins>;
type WalletMembership = { coins?: number; expiresAt?: Date | string };
type WalletCoverage = {
  ok: boolean;
  needCoins: number;
  useBonusCoins: number;
  useMembershipCoins: number;
  useChargedCoins: number;
  bonusCoins: number;
  membershipCoins: number;
  chargedCoins: number;
  membershipExpired: boolean;
};

export type AIUsageChargePreviewResult =
  | {
      ok: true;
      coins: number;
      billingKey: string;
      breakdown: CoinCalculation["breakdown"];
      walletPolicy?: WalletDeductPolicy;
      walletCoverage?: WalletCoverage;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
      coins: number;
      billingKey: string;
      breakdown: CoinCalculation["breakdown"];
      walletPolicy?: WalletDeductPolicy;
      walletCoverage?: WalletCoverage;
    };

/**
 * 유저 지갑 차감 정책
 * - 개인 AI 서비스: 무상 bonus를 먼저 사용하고 부족분을 charged에서 사용
 * - 구독 코인은 커머스 유니버스 전용으로 여기서는 사용하지 않음
 * - 향후 별도 서비스에서 membership 코인을 쓰고 싶을 경우 앱 전용 식별자를 따로 분기해서 추가
 */
function resolveUserWalletPolicy(app?: string): WalletDeductPolicy {
  void app;
  return "bonus_charged";
}

/**
 * 유니버스 안의 모든 과금 대상 서비스는 Membership을 먼저 사용하고
 * 부족분을 Charged에서 차감한다.
 */
function resolveUniverseWalletPolicy(_app?: string): WalletDeductPolicy {
  return "mixed";
}

// 사용자 지갑에서 차감
export interface ChargeAIUsageParams {
  uid: string;
  app: string; // 'npc_chat' 등
  provider: BillableProviderType;
  modelName: string; // API에 실제로 사용한 모델명
  usage?: ITokenUsageBreakdown; // 텍스트/오디오/이미지 토큰 (입/출력)
  fixed?: IFixedUsage; // 초/분/이미지 건당 과금
  modality?: AiModalityType; // 텍스트, 이미지 등
  variant?: string; // Gemini/영상/이미지 size 등
  meta?: Record<string, unknown>; // personaId, route, sessionId 등
}

// 환불(보상 트랜잭션) 파라미터
export type RefundAIUsageParams = ChargeAIUsageParams & {
  coins: number; // 환불할 코인(차감 당시 산정된 코인 수를 그대로 넘김)
};

// 트랜잭션 미지원 감지 유틸 (드라이버/버전별 대표 문구)
function isTxnUnsupportedError(err: unknown) {
  const error = toUnknownRecord(err);
  const m = String(error.message || err || "");
  return (
    m.includes("Transaction numbers are only allowed") ||
    m.includes("not a replica set member") ||
    m.includes("Topology is not a replica set") ||
    m.includes("ReplicaSetNoPrimary")
  );
}

function isKnownNoWalletMutationError(err: unknown) {
  const code = String(toUnknownRecord(err).errorCode || "");
  return [
    "COIN_INSUFFICIENT",
    "USER_NOT_FOUND",
    "UNIVERSE_NOT_FOUND",
    "NOT_COMMERCE_UNIVERSE",
  ].includes(code);
}

async function runWithTransactionFallback<T>(
  session: ClientSession,
  transactionTask: () => Promise<T>,
  fallbackTask: () => Promise<T>,
) {
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await transactionTask();
    });
    return result as T;
  } catch (error) {
    if (!isTxnUnsupportedError(error)) throw error;
    return fallbackTask();
  }
}

/**
 * 과금 대상 사용량이 있는데 코인이 0으로 계산되면 UNKNOWN_BILLING_RATE로 막는 최후 가드의 판정부다.
 * **여기에 빠진 단위는 "0코인 무과금 통과"가 된다.** IFixedUsage에 단위를 추가하면 반드시 함께 추가한다.
 */
function hasBillableUsage(usage?: ITokenUsageBreakdown, fixed?: IFixedUsage) {
  return (
    !!fixed?.seconds ||
    !!fixed?.minutes ||
    !!fixed?.images ||
    !!fixed?.videos ||
    !!fixed?.characters ||
    !!fixed?.credits ||
    !!(
      usage &&
      ((usage.text?.input ?? 0) > 0 ||
        (usage.text?.output ?? 0) > 0 ||
        (usage.audio?.input ?? 0) > 0 ||
        (usage.audio?.output ?? 0) > 0 ||
        (usage.image?.input ?? 0) > 0 ||
        (usage.image?.output ?? 0) > 0 ||
        (usage.video?.input ?? 0) > 0 ||
        (usage.video?.output ?? 0) > 0)
    )
  );
}

function calculateWalletCoverage(
  membership: WalletMembership | undefined,
  bonusCoinsRaw: number | undefined,
  chargedCoinsRaw: number | undefined,
  policy: WalletDeductPolicy,
  needCoinsRaw: number,
): WalletCoverage {
  const needCoins = Math.max(0, Number(needCoinsRaw || 0));
  const { m, expired } = resolveMembershipCoins(membership);
  const bonusCoins = Math.max(0, Number(bonusCoinsRaw || 0));
  const membershipCoins = Math.max(0, Number(m || 0));
  const chargedCoins = Math.max(0, Number(chargedCoinsRaw || 0));

  let need = needCoins;
  let useBonusCoins = 0;
  let useMembershipCoins = 0;
  let useChargedCoins = 0;

  if (policy === "membership") {
    useMembershipCoins = needCoins;
    need = Math.max(0, needCoins - membershipCoins);
  } else if (policy === "charged") {
    useChargedCoins = needCoins;
    need = Math.max(0, needCoins - chargedCoins);
  } else if (policy === "bonus_charged") {
    const allocation = allocateUserBonusChargedDebit(bonusCoins, chargedCoins, needCoins);
    useBonusCoins = allocation.useBonusCoins;
    useChargedCoins = allocation.useChargedCoins;
    need = allocation.ok ? 0 : needCoins - useBonusCoins - useChargedCoins;
  } else {
    useMembershipCoins = Math.min(need, membershipCoins);
    need -= useMembershipCoins;
    useChargedCoins = Math.min(need, chargedCoins);
    need -= useChargedCoins;
  }

  return {
    ok: need <= 0,
    needCoins,
    useBonusCoins,
    useMembershipCoins,
    useChargedCoins,
    bonusCoins,
    membershipCoins,
    chargedCoins,
    membershipExpired: expired,
  };
}

// 차감 직후 accountType 동기화 유틸 (세션/비세션 모두 지원)
async function ensureAccountTypeSyncAfterDeduct(
  UserModel: Model<IUserDocument>,
  uid: string,
  session: ClientSession | null = null,
) {
  // 차감 결과가 반영된 최신 도큐먼트를 읽어온 후 등급 동기화
  const doc = await UserModel.findOne({ uid }, { accountType: 1, "wallet.charged.coins": 1 }).session(session);

  if (!doc) return; // 유저 삭제 등 극히 드문 상황 보호

  const prev = doc.accountType;
  const next = syncAccountTypeByWallet(doc as unknown as IUserDocument); // charged > 0 ? PRO : FREE (PREMIUM/ENTERPRISE 보호)

  if (next !== prev) {
    // 변경이 있을 때만 저장 (세션이 있다면 같은 트랜잭션으로)
    await doc.save({ session: session ?? undefined });
  }
}

// “유저 지갑” 차감 헬퍼
async function deductFromUserWallet(
  UserModel: Model<IUserDocument>,
  uid: string,
  needCoins: number,
  policy: WalletDeductPolicy,
  session: ClientSession | null = null,
) {
  const user = await UserModel.findOne(
    { uid },
    { "wallet.bonus.coins": 1, "wallet.membership": 1, "wallet.charged.coins": 1 },
  ).session(session);

  const friendly = (code?: string, fallback = "코인 차감 중 오류") =>
    code === "USER_NOT_FOUND"
      ? "사용자를 찾을 수 없습니다."
      : code === "COIN_INSUFFICIENT"
        ? "코인이 부족합니다."
        : fallback;

  if (!user) throw Object.assign(new Error(friendly("USER_NOT_FOUND")), { errorCode: "USER_NOT_FOUND" });

  const { m, /* mRaw: 안씀 */ expired } = resolveMembershipCoins(user.wallet?.membership);
  const b = Math.max(0, user.wallet?.bonus?.coins || 0);
  const c = Math.max(0, user.wallet?.charged?.coins || 0);

  let useB = 0;
  let useM = 0;
  let useC = 0;

  if (policy === "membership") {
    // 구독 코인 전용
    useM = needCoins;
    if (m < useM) {
      throw Object.assign(new Error(friendly("COIN_INSUFFICIENT")), { errorCode: "COIN_INSUFFICIENT" });
    }
  } else if (policy === "charged") {
    // 일반 AI 전용
    useC = needCoins;
    if (c < useC) {
      throw Object.assign(new Error(friendly("COIN_INSUFFICIENT")), { errorCode: "COIN_INSUFFICIENT" });
    }
  } else if (policy === "bonus_charged") {
    const allocation = allocateUserBonusChargedDebit(b, c, needCoins);
    useB = allocation.useBonusCoins;
    useC = allocation.useChargedCoins;
    if (!allocation.ok) {
      throw Object.assign(new Error(friendly("COIN_INSUFFICIENT")), { errorCode: "COIN_INSUFFICIENT" });
    }
  } else {
    // 과거/기타 앱: membership → charged 순
    let need = needCoins;
    useM = Math.min(need, m);
    need -= useM;
    useC = Math.min(need, c);
    need -= useC;

    if (need > 0) {
      throw Object.assign(new Error(friendly("COIN_INSUFFICIENT")), { errorCode: "COIN_INSUFFICIENT" });
    }
  }

  const query: WalletQuery = { uid };
  if (useB > 0) query["wallet.bonus.coins"] = { $gte: useB };
  if (useM > 0) query["wallet.membership.coins"] = { $gte: useM };
  if (useC > 0) query["wallet.charged.coins"] = { $gte: useC };

  const update: WalletUpdate = { $inc: {} };
  if (useB > 0) update.$inc["wallet.bonus.coins"] = -useB;
  if (useM > 0) update.$inc["wallet.membership.coins"] = -useM;
  if (useC > 0) update.$inc["wallet.charged.coins"] = -useC;

  // membership 만료 상태면 membership 코인 강제로 0으로 정리
  if (expired && policy !== "charged") {
    update.$set = { "wallet.membership.coins": 0 };
  }
  update.$set = { ...(update.$set || {}), "wallet.lastQualifyingActivityAt": new Date() };

  const updated = await UserModel.findOneAndUpdate(query, update, {
    new: true,
    session: session ?? undefined,
  });

  if (!updated) throw Object.assign(new Error("COIN_INSUFFICIENT"), { errorCode: "COIN_INSUFFICIENT" });
  return {
    user: updated,
    walletDebit: { bonusCoins: useB, membershipCoins: useM, chargedCoins: useC },
  };
}

// 코인 환불(보상 트랜잭션)
// - 외부 유료 API 선차감 패턴에서 호출 실패 시 환불 / meta.requestId가 있으면 동일 requestId로 중복 환불 방지
export async function refundAIUsage(params: RefundAIUsageParams) {
  const { uid, app, provider, modelName, usage, fixed, modality, variant, meta, coins } = params;

  const refundCoins = Math.max(0, Number(coins || 0));
  if (!refundCoins) return { ok: true, coins: 0 };

  const sourceOperationId =
    typeof meta?.sourceOperationId === "string" && meta.sourceOperationId.trim()
      ? meta.sourceOperationId.trim()
      : typeof meta?.operationId === "string" && meta.operationId.trim()
        ? meta.operationId.trim()
        : typeof meta?.requestId === "string"
          ? meta.requestId.trim()
          : "";
  if (!sourceOperationId) {
    return { ok: false, errorCode: "COMPENSATION_SOURCE_OPERATION_REQUIRED", message: "원 차감 작업 식별자가 없어 자동 보상할 수 없습니다." };
  }
  const compensationOperationId = `compensation:${sourceOperationId}:${refundCoins}`.slice(0, 240);

  const userModelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, userModelName, UserSchema, userModelName);

  const { billingKey } = await quoteAIUsage({ provider, modelName, variant, modality, usage, fixed });
  if (process.env.PAYMENT_COIN_LOT_CUTOVER_VERIFIED !== "true") {
    const originalWalletDebit = await getAppliedCoinUsageWalletDebit(uid, sourceOperationId);
    if (!originalWalletDebit) {
      return { ok: false, errorCode: "COMPENSATION_ORIGINAL_DEBIT_REQUIRED", message: "원 차감 귀속이 없어 자동 보상할 수 없습니다." };
    }
    const legacyRefundCredit = allocateUserWalletRefund(refundCoins, originalWalletDebit);
    if (legacyRefundCredit.bonusCoins + legacyRefundCredit.membershipCoins + legacyRefundCredit.chargedCoins !== refundCoins) {
      return { ok: false, errorCode: "REFUND_EXCEEDS_ORIGINAL_DEBIT", message: "원래 차감된 코인을 초과해 환불할 수 없습니다." };
    }
    const legacyPrepared = await prepareCoinUsageLedger({
      uid,
      app,
      provider,
      modelName,
      billingKey,
      coins: -refundCoins,
      breakdown: { refund: true, refundedCoins: refundCoins, walletCredit: legacyRefundCredit },
      usage,
      fixed,
      meta: { ...(meta || {}), operationId: compensationOperationId, kind: "refund", sourceOperationId },
      entryType: "refund",
    });
    if (legacyPrepared.alreadyApplied) return { ok: true, coins: 0, alreadyRefunded: true };
    try {
      await applyWalletUsageOnce({
        model: UserModel,
        ownerFilter: { uid },
        debit: legacyRefundCredit,
        receipt: {
          operationId: compensationOperationId,
          sourceOperationId,
          kind: "compensation",
          coins: refundCoins,
          walletDebit: legacyRefundCredit,
          appliedAt: new Date(),
        },
      });
      await markCoinUsageLedgerApplied(legacyPrepared.id, legacyRefundCredit);
      const updated = await UserModel.findOne({ uid }, { wallet: 1 });
      return { ok: true, coins: refundCoins, wallet: updated?.wallet };
    } catch (error) {
      await markCoinUsageLedgerReconciliationRequired(legacyPrepared.id, error).catch(() => undefined);
      return { ok: false, errorCode: "REFUND_RECONCILIATION_REQUIRED", message: "환불 재조정이 필요합니다.", operationId: legacyPrepared.operationId };
    }
  }
  const originalLotDebits = await getAppliedCoinUsageLotDebits(uid, sourceOperationId);
  if (!originalLotDebits?.length) {
    return {
      ok: false,
      errorCode: "COMPENSATION_ORIGINAL_LOT_DEBITS_REQUIRED",
      message: "원 차감 lot 귀속이 없어 자동 보상할 수 없습니다.",
    };
  }
  const restorePlan = buildCoinCompensationPlan({
    operationId: compensationOperationId,
    sourceOperationId,
    reason: String(meta?.reason || "provider_failed"),
    coins: refundCoins,
    originalDebit: originalLotDebits,
  });
  if ("ok" in restorePlan) return restorePlan;
  const refundCredit = walletDebitFromLots("user", restorePlan.restore);
  const prepared = await prepareCoinUsageLedger({
    uid,
    app,
    provider,
    modelName,
    billingKey,
    coins: -refundCoins,
    breakdown: { refund: true, refundedCoins: refundCoins, walletCredit: refundCredit },
    usage,
    fixed,
    meta: {
      ...(meta || {}),
      operationId: compensationOperationId,
      kind: "refund",
      sourceOperationId,
    },
    entryType: "refund",
  });
  if (prepared.alreadyApplied) return { ok: true, coins: 0, alreadyRefunded: true };

  let walletApplied = false;
  let walletMutationAttempted = false;
  try {
    await assertWalletUsageReceiptCapacity({
      model: UserModel,
      ownerFilter: { uid },
      operationId: compensationOperationId,
    });
    await applyCoinLotCompensationOnce({
      ownerScope: "user",
      ownerId: uid,
      operationId: compensationOperationId,
      sourceOperationId,
      coins: refundCoins,
      originalDebits: originalLotDebits,
      reason: String(meta?.reason || "provider_failed"),
    });
    walletMutationAttempted = true;
    await applyWalletUsageOnce({
      model: UserModel,
      ownerFilter: { uid },
      debit: refundCredit,
      receipt: {
        operationId: compensationOperationId,
        sourceOperationId,
        kind: "compensation",
        coins: refundCoins,
        walletDebit: refundCredit,
        appliedAt: new Date(),
      },
    });
    walletApplied = true;
    await ensureAccountTypeSyncAfterDeduct(UserModel, uid, null);
    await markCoinUsageLedgerApplied(prepared.id, refundCredit, restorePlan.restore);
    const updated = await UserModel.findOne({ uid }, { wallet: 1 });
    return { ok: true, coins: refundCoins, wallet: updated?.wallet };
  } catch (e: unknown) {
    const needsReconciliation =
      walletApplied || (walletMutationAttempted && !isKnownNoWalletMutationError(e));
    await (needsReconciliation
      ? markCoinUsageLedgerReconciliationRequired(prepared.id, e)
      : markCoinUsageLedgerFailed(prepared.id, e)
    ).catch(() => undefined);
    const error = toUnknownRecord(e);
    return {
      ok: false,
      errorCode: String(error.errorCode || (needsReconciliation ? "REFUND_RECONCILIATION_REQUIRED" : "REFUND_FAILED")),
      message: String(error.message || "환불 실패"),
      operationId: prepared.operationId,
    };
  }
}

/**
 * 가격 판정 단일 소스. billingKey 해석과 코인 산정을 system pricing catalog 하나로 처리한다.
 *
 * 정적 상수를 직접 쓰지 않는 이유: 가격표 확인(assertPricingConfigured)이 같은 카탈로그를 보므로,
 * 여기서 다른 소스를 쓰면 "가격표는 통과하는데 과금은 UNKNOWN_BILLING_RATE" 불일치가 생긴다.
 * 카탈로그 조회가 실패하면 추정 단가로 청구하지 않고 그대로 실패시킨다(fail-closed).
 * 동적 import는 server-only 모듈을 모듈 로드 시점이 아니라 호출 시점에 묶기 위한 것이다.
 */
async function quoteAIUsage(args: {
  provider: BillableProviderType;
  modelName: string;
  variant?: string;
  modality?: AiModalityType;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}) {
  const { resolveSystemBillingQuote } = await import("libs/server-utils/api/systemPricingControl");
  return await resolveSystemBillingQuote(args);
}

export async function chargeAIUsage(params: ChargeAIUsageParams) {
  const { uid, app, provider, modelName, usage, fixed, modality, variant, meta } = params;
  const { billingKey, coins, breakdown } = await quoteAIUsage({ provider, modelName, variant, modality, usage, fixed });

  const hasUsage = hasBillableUsage(usage, fixed);

  if (hasUsage && coins <= 0) {
    return { ok: false, errorCode: "UNKNOWN_BILLING_RATE", message: "요금표에 없는 모델/키입니다." };
  }

  // 0코인도 동일한 원장 상태 전이를 거쳐 추적 가능하게 기록한다.
  if (coins <= 0) {
    const prepared = await prepareCoinUsageLedger({
      uid,
      app,
      provider,
      modelName,
      billingKey,
      coins: 0,
      breakdown,
      usage,
      fixed,
      meta,
      entryType: "zero",
    });
    if (!prepared.alreadyApplied) await markCoinUsageLedgerApplied(prepared.id);
    return { ok: true, coins: 0, operationId: prepared.operationId };
  }

  const userModelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, userModelName, UserSchema, userModelName);
  const prepared = await prepareCoinUsageLedger({
    uid,
    app,
    provider,
    modelName,
    billingKey,
    coins,
    breakdown,
    usage,
    fixed,
    meta,
    entryType: "deduction",
  });
  if (prepared.alreadyApplied) {
    const current = await UserModel.findOne({ uid }, { wallet: 1, accountType: 1 });
    return {
      ok: true,
      coins,
      wallet: current?.wallet,
      accountType: current?.accountType,
      operationId: prepared.operationId,
      alreadyCharged: true,
    };
  }

  let walletApplied = false;
  let walletMutationAttempted = false;

  try {
    if (process.env.PAYMENT_COIN_LOT_CUTOVER_VERIFIED !== "true") {
      const session = await UserModel.db.startSession();
      try {
        const legacyUpdated = await runWithTransactionFallback(
          session,
          async () => {
            walletMutationAttempted = true;
            const user = await deductFromUserWallet(UserModel, uid, coins, resolveUserWalletPolicy(app), session);
            await ensureAccountTypeSyncAfterDeduct(UserModel, uid, session);
            return user;
          },
          async () => {
            walletMutationAttempted = true;
            const user = await deductFromUserWallet(UserModel, uid, coins, resolveUserWalletPolicy(app), null);
            await ensureAccountTypeSyncAfterDeduct(UserModel, uid, null);
            return user;
          },
        );
        walletApplied = true;
        await markCoinUsageLedgerApplied(prepared.id, legacyUpdated.walletDebit);
        return {
          ok: true,
          coins,
          wallet: legacyUpdated.user.wallet,
          walletDebit: legacyUpdated.walletDebit,
          accountType: legacyUpdated.user.accountType,
          operationId: prepared.operationId,
        };
      } finally {
        await session.endSession();
      }
    }
    await assertWalletUsageReceiptCapacity({
      model: UserModel,
      ownerFilter: { uid },
      operationId: prepared.operationId,
    });
    const lotResult = await applyCoinLotDebitOnce({
      ownerScope: "user",
      ownerId: uid,
      operationId: prepared.operationId,
      coins,
    });
    const walletDebit = walletDebitFromLots("user", lotResult.debits);
    walletMutationAttempted = true;
    await applyWalletUsageOnce({
      model: UserModel,
      ownerFilter: { uid },
      debit: walletDebit,
      receipt: {
        operationId: prepared.operationId,
        kind: "deduction",
        coins,
        walletDebit,
        appliedAt: new Date(),
      },
    });
    walletApplied = true;
    await ensureAccountTypeSyncAfterDeduct(UserModel, uid, null);
    await markCoinUsageLedgerApplied(prepared.id, walletDebit, lotResult.debits);
    const updated = await UserModel.findOne({ uid }, { wallet: 1, accountType: 1 });

    return {
      ok: true,
      coins,
      wallet: updated?.wallet,
      walletDebit,
      lotDebits: lotResult.debits,
      accountType: updated?.accountType,
      operationId: prepared.operationId,
    };
  } catch (e: unknown) {
    const needsReconciliation =
      walletApplied || (walletMutationAttempted && !isKnownNoWalletMutationError(e));
    await (needsReconciliation
      ? markCoinUsageLedgerReconciliationRequired(prepared.id, e)
      : markCoinUsageLedgerFailed(prepared.id, e)
    ).catch(() => undefined);
    const error = toUnknownRecord(e);
    if (error.errorCode === "COIN_INSUFFICIENT") {
      return { ok: false, errorCode: "COIN_INSUFFICIENT", message: "코인이 부족합니다." };
    }
    return {
      ok: false,
      errorCode: needsReconciliation ? "COIN_RECONCILIATION_REQUIRED" : "BILLING_FAILED",
      message: String(error.message || "코인 차감 중 오류"),
      operationId: prepared.operationId,
    };
  }
}

export async function previewAIUsageCharge(params: ChargeAIUsageParams): Promise<AIUsageChargePreviewResult> {
  const { uid, app, provider, modelName, usage, fixed, modality, variant, meta } = params;
  const { billingKey, coins, breakdown } = await quoteAIUsage({ provider, modelName, variant, modality, usage, fixed });
  const walletPolicy = resolveUserWalletPolicy(app);

  if (hasBillableUsage(usage, fixed) && coins <= 0) {
    return {
      ok: false,
      errorCode: "UNKNOWN_BILLING_RATE",
      message: "요금표에 없는 모델/키입니다.",
      coins,
      billingKey,
      breakdown,
      walletPolicy,
    };
  }

  if (coins <= 0) {
    return { ok: true, coins: 0, billingKey, breakdown, walletPolicy };
  }

  const userModelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, userModelName, UserSchema, userModelName);
  const user = await UserModel.findOne(
    { uid },
    { "wallet.bonus.coins": 1, "wallet.membership": 1, "wallet.charged.coins": 1 },
  );

  if (!user) {
    return {
      ok: false,
      errorCode: "USER_NOT_FOUND",
      message: "사용자를 찾을 수 없습니다.",
      coins,
      billingKey,
      breakdown,
      walletPolicy,
    };
  }

  let walletCoverage = calculateWalletCoverage(
    user.wallet?.membership,
    user.wallet?.bonus?.coins,
    user.wallet?.charged?.coins,
    walletPolicy,
    coins,
  );
  if (process.env.PAYMENT_COIN_LOT_CUTOVER_VERIFIED === "true") {
    try {
      await assertWalletUsageReceiptCapacity({
        model: UserModel,
        ownerFilter: { uid },
        operationId: String(meta?.operationId || meta?.requestId || "").trim() || undefined,
      });
    } catch (error) {
      const record = toUnknownRecord(error);
      return {
        ok: false,
        errorCode: String(record.errorCode || "COIN_WALLET_RECEIPT_CAPACITY"),
        message: String(record.message || "지갑 usage receipt 용량을 확인할 수 없습니다."),
        coins,
        billingKey,
        breakdown,
        walletPolicy,
        walletCoverage,
      };
    }
    const lotCoverage = await previewCoinLotDebit({ ownerScope: "user", ownerId: uid, coins });
    const lotDebit = walletDebitFromLots("user", lotCoverage.debits);
    walletCoverage = {
      ...walletCoverage,
      ok: lotCoverage.ok,
      useBonusCoins: lotDebit.bonusCoins,
      useMembershipCoins: lotDebit.membershipCoins,
      useChargedCoins: lotDebit.chargedCoins,
    };
  }
  if (!walletCoverage.ok) {
    return {
      ok: false,
      errorCode: "COIN_INSUFFICIENT",
      message: "코인이 부족합니다.",
      coins,
      billingKey,
      breakdown,
      walletPolicy,
      walletCoverage,
    };
  }

  return { ok: true, coins, billingKey, breakdown, walletPolicy, walletCoverage };
}

// “유니버스 지갑” 차감 헬퍼
async function deductFromUniverseWallet(
  UniverseModel: Model<IUniverseDocument>,
  universeId: string,
  needCoins: number,
  policy: WalletDeductPolicy,
  session: ClientSession | null = null,
) {
  const uni = await UniverseModel.findOne(
    { id: universeId },
    { type: 1, "wallet.membership": 1, "wallet.charged.coins": 1 },
  ).session(session);

  if (!uni) throw Object.assign(new Error("UNIVERSE_NOT_FOUND"), { errorCode: "UNIVERSE_NOT_FOUND" });
  if (uni.type !== "commerce") {
    throw Object.assign(new Error("NOT_COMMERCE_UNIVERSE"), { errorCode: "NOT_COMMERCE_UNIVERSE" });
  }

  const { m, /* mRaw */ expired } = resolveMembershipCoins(uni.wallet?.membership);
  const c = Math.max(0, uni.wallet?.charged?.coins || 0);

  let useM = 0;
  let useC = 0;

  if (policy === "membership") {
    useM = needCoins;
    if (m < useM) {
      throw Object.assign(new Error("COIN_INSUFFICIENT"), { errorCode: "COIN_INSUFFICIENT" });
    }
  } else if (policy === "charged") {
    useC = needCoins;
    if (c < useC) {
      throw Object.assign(new Error("COIN_INSUFFICIENT"), { errorCode: "COIN_INSUFFICIENT" });
    }
  } else {
    let need = needCoins;
    useM = Math.min(need, m);
    need -= useM;
    useC = Math.min(need, c);
    need -= useC;

    if (need > 0) {
      throw Object.assign(new Error("COIN_INSUFFICIENT"), { errorCode: "COIN_INSUFFICIENT" });
    }
  }

  const query: WalletQuery = { id: universeId };
  if (useM > 0) query["wallet.membership.coins"] = { $gte: useM };
  if (useC > 0) query["wallet.charged.coins"] = { $gte: useC };

  const update: WalletUpdate = { $inc: {} };
  if (useM > 0) update.$inc["wallet.membership.coins"] = -useM;
  if (useC > 0) update.$inc["wallet.charged.coins"] = -useC;

  if (expired && policy !== "charged") {
    update.$set = { "wallet.membership.coins": 0 };
  }

  const updated = await UniverseModel.findOneAndUpdate(query, update, {
    new: true,
    session: session ?? undefined,
  });

  if (!updated) throw Object.assign(new Error("COIN_INSUFFICIENT"), { errorCode: "COIN_INSUFFICIENT" });
  return updated;
}

// 커머스 유니버스 지갑에서 차감
export interface ChargeAIUsageForUniverseParams extends Omit<ChargeAIUsageParams, "uid"> {
  universeId: string; // 커머스 유니버스 ID
}

export async function chargeAIUsageForUniverse(params: ChargeAIUsageForUniverseParams) {
  const { universeId, app, provider, modelName, usage, fixed, modality, variant, meta } = params;
  const { billingKey, coins, breakdown } = await quoteAIUsage({ provider, modelName, variant, modality, usage, fixed });

  if (coins <= 0) {
    const prepared = await prepareCoinUsageLedger({
      uid: `universe:${universeId}`,
      universeId,
      app,
      provider,
      modelName,
      billingKey,
      coins: 0,
      breakdown,
      usage,
      fixed,
      meta,
      entryType: "zero",
    });
    if (!prepared.alreadyApplied) await markCoinUsageLedgerApplied(prepared.id);
    return { ok: true, coins: 0, operationId: prepared.operationId };
  }

  const UniverseModel = await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
  const prepared = await prepareCoinUsageLedger({
    uid: `universe:${universeId}`,
    universeId,
    app,
    provider,
    modelName,
    billingKey,
    coins,
    breakdown,
    usage,
    fixed,
    meta,
    entryType: "deduction",
  });
  if (prepared.alreadyApplied) {
    const current = await UniverseModel.findOne({ id: universeId }, { wallet: 1 });
    return {
      ok: true,
      coins,
      wallet: current?.wallet,
      operationId: prepared.operationId,
      alreadyCharged: true,
    };
  }

  let walletApplied = false;
  let walletMutationAttempted = false;

  try {
    if (process.env.PAYMENT_COIN_LOT_CUTOVER_VERIFIED !== "true") {
      const session = await UniverseModel.db.startSession();
      try {
        const legacyUpdated = await runWithTransactionFallback(
          session,
          () => {
            walletMutationAttempted = true;
            return deductFromUniverseWallet(UniverseModel, universeId, coins, resolveUniverseWalletPolicy(app), session);
          },
          () => {
            walletMutationAttempted = true;
            return deductFromUniverseWallet(UniverseModel, universeId, coins, resolveUniverseWalletPolicy(app), null);
          },
        );
        walletApplied = true;
        await markCoinUsageLedgerApplied(prepared.id);
        return { ok: true, coins, wallet: legacyUpdated?.wallet, operationId: prepared.operationId };
      } finally {
        await session.endSession();
      }
    }
    const universe = await UniverseModel.findOne({ id: universeId }, { type: 1 });
    if (!universe) throw Object.assign(new Error("UNIVERSE_NOT_FOUND"), { errorCode: "UNIVERSE_NOT_FOUND" });
    if (universe.type !== "commerce") {
      throw Object.assign(new Error("NOT_COMMERCE_UNIVERSE"), { errorCode: "NOT_COMMERCE_UNIVERSE" });
    }
    await assertWalletUsageReceiptCapacity({
      model: UniverseModel,
      ownerFilter: { id: universeId, type: "commerce" },
      operationId: prepared.operationId,
    });
    const lotResult = await applyCoinLotDebitOnce({
      ownerScope: "universe",
      ownerId: universeId,
      operationId: prepared.operationId,
      coins,
    });
    const walletDebit = walletDebitFromLots("universe", lotResult.debits);
    walletMutationAttempted = true;
    await applyWalletUsageOnce({
      model: UniverseModel,
      ownerFilter: { id: universeId, type: "commerce" },
      debit: walletDebit,
      receipt: {
        operationId: prepared.operationId,
        kind: "deduction",
        coins,
        walletDebit,
        appliedAt: new Date(),
      },
    });
    walletApplied = true;
    await markCoinUsageLedgerApplied(prepared.id, walletDebit, lotResult.debits);
    const updated = await UniverseModel.findOne({ id: universeId }, { wallet: 1 });
    return { ok: true, coins, wallet: updated?.wallet, walletDebit, lotDebits: lotResult.debits, operationId: prepared.operationId };
  } catch (e: unknown) {
    const needsReconciliation =
      walletApplied || (walletMutationAttempted && !isKnownNoWalletMutationError(e));
    await (needsReconciliation
      ? markCoinUsageLedgerReconciliationRequired(prepared.id, e)
      : markCoinUsageLedgerFailed(prepared.id, e)
    ).catch(() => undefined);
    const error = toUnknownRecord(e);
    if (error.errorCode === "COIN_INSUFFICIENT") {
      return { ok: false, errorCode: "COIN_INSUFFICIENT", message: "유니버스 코인이 부족합니다." };
    }
    if (error.errorCode === "NOT_COMMERCE_UNIVERSE") {
      return { ok: false, errorCode: "NOT_COMMERCE_UNIVERSE", message: "커머스 유니버스가 아닙니다." };
    }
    return {
      ok: false,
      errorCode: needsReconciliation ? "COIN_RECONCILIATION_REQUIRED" : "BILLING_FAILED",
      message: String(error.message || "유니버스 코인 차감 중 오류"),
      operationId: prepared.operationId,
    };
  }
}

export async function previewAIUsageChargeForUniverse(
  params: ChargeAIUsageForUniverseParams,
): Promise<AIUsageChargePreviewResult> {
  const { universeId, app, provider, modelName, usage, fixed, modality, variant, meta } = params;
  const { billingKey, coins, breakdown } = await quoteAIUsage({ provider, modelName, variant, modality, usage, fixed });
  const walletPolicy = resolveUniverseWalletPolicy(app);

  if (hasBillableUsage(usage, fixed) && coins <= 0) {
    return {
      ok: false,
      errorCode: "UNKNOWN_BILLING_RATE",
      message: "요금표에 없는 모델/키입니다.",
      coins,
      billingKey,
      breakdown,
      walletPolicy,
    };
  }

  if (coins <= 0) {
    return { ok: true, coins: 0, billingKey, breakdown, walletPolicy };
  }

  const UniverseModel = await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
  const universe = await UniverseModel.findOne(
    { id: universeId },
    { type: 1, "wallet.membership": 1, "wallet.charged.coins": 1 },
  );

  if (!universe) {
    return {
      ok: false,
      errorCode: "UNIVERSE_NOT_FOUND",
      message: "유니버스를 찾을 수 없습니다.",
      coins,
      billingKey,
      breakdown,
      walletPolicy,
    };
  }

  if (universe.type !== "commerce") {
    return {
      ok: false,
      errorCode: "NOT_COMMERCE_UNIVERSE",
      message: "커머스 유니버스가 아닙니다.",
      coins,
      billingKey,
      breakdown,
      walletPolicy,
    };
  }

  let walletCoverage = calculateWalletCoverage(
    universe.wallet?.membership,
    undefined,
    universe.wallet?.charged?.coins,
    walletPolicy,
    coins,
  );
  if (process.env.PAYMENT_COIN_LOT_CUTOVER_VERIFIED === "true") {
    try {
      await assertWalletUsageReceiptCapacity({
        model: UniverseModel,
        ownerFilter: { id: universeId, type: "commerce" },
        operationId: String(meta?.operationId || meta?.requestId || "").trim() || undefined,
      });
    } catch (error) {
      const record = toUnknownRecord(error);
      return {
        ok: false,
        errorCode: String(record.errorCode || "COIN_WALLET_RECEIPT_CAPACITY"),
        message: String(record.message || "지갑 usage receipt 용량을 확인할 수 없습니다."),
        coins,
        billingKey,
        breakdown,
        walletPolicy,
        walletCoverage,
      };
    }
    const lotCoverage = await previewCoinLotDebit({ ownerScope: "universe", ownerId: universeId, coins });
    const lotDebit = walletDebitFromLots("universe", lotCoverage.debits);
    walletCoverage = {
      ...walletCoverage,
      ok: lotCoverage.ok,
      useBonusCoins: lotDebit.bonusCoins,
      useMembershipCoins: lotDebit.membershipCoins,
      useChargedCoins: lotDebit.chargedCoins,
    };
  }

  if (!walletCoverage.ok) {
    return {
      ok: false,
      errorCode: "COIN_INSUFFICIENT",
      message: "유니버스 코인이 부족합니다.",
      coins,
      billingKey,
      breakdown,
      walletPolicy,
      walletCoverage,
    };
  }

  return { ok: true, coins, billingKey, breakdown, walletPolicy, walletCoverage };
}
