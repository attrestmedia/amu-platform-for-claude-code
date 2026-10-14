import "server-only";
import type { ClientSession } from "mongoose";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getPlatformCredentialEnvironment } from "consts/secure/platformCredentials";
import type { SpeechBudgetOwnerType } from "consts/system/speechRuntimeControls";
import { getModel } from "libs/database/modelCache";
import { resolveSpeechBudgetPeriodKeys } from "libs/server-utils/audio/speechBudgetPolicy";
import { SpeechBudgetUsageSchema, type ISpeechBudgetUsageDocument } from "models/system";

/**
 * @docHint
 * @purpose speech 지출·예약 누적 집계 조회·기록
 * @process 기간 키 산출  예약·정산 $inc  owner/조직 committed 합계 반환
 * @domain system-control
 * @scope server
 */

const COLLECTION = "speech_budget_usage";

export { resolveSpeechBudgetPeriodKeys };

async function getUsageModel() {
  return await getModel<ISpeechBudgetUsageDocument>(MONGODB_AMU_URL, "SpeechBudgetUsage", SpeechBudgetUsageSchema, COLLECTION);
}
export type SpeechBudgetCommittedUsageReadResult = {
  spentTodayUsd: number;
  spentThisMonthUsd: number;
};

/**
 * 예약 판정용으로 지출과 아직 열린 예약을 함께 읽는다.
 * 트랜잭션 안에서 호출하면 reserve 직전의 owner·조직 합계가 같은 snapshot에서 읽힌다.
 */
export async function readCommittedSpeechBudgetUsage(args: {
  owner: SpeechBudgetOwnerType;
  provider: string;
  environment?: string;
  at?: Date;
  session?: ClientSession;
}): Promise<{ owner: SpeechBudgetCommittedUsageReadResult; global: SpeechBudgetCommittedUsageReadResult }> {
  const Model = await getUsageModel();
  const environment = args.environment ?? getPlatformCredentialEnvironment();
  const { day, month } = resolveSpeechBudgetPeriodKeys(args.at);
  const provider = String(args.provider || "").trim().toLowerCase();

  const query = Model.find({
    environment,
    provider,
    $or: [
      { periodType: "day", periodKey: day },
      { periodType: "month", periodKey: month },
    ],
  })
    .select({ owner: 1, periodType: 1, spentUsd: 1, reservedUsd: 1 });
  if (args.session) query.session(args.session);
  const rows = await query.lean();

  const sum = (periodType: "day" | "month", owner?: SpeechBudgetOwnerType) =>
    rows
      .filter((row) => row.periodType === periodType && (!owner || row.owner === owner))
      .reduce((total, row) => {
        const spentUsd = Number(row.spentUsd ?? 0);
        const reservedUsd = Number(row.reservedUsd ?? 0);
        if (!Number.isFinite(spentUsd) || spentUsd < 0 || !Number.isFinite(reservedUsd) || reservedUsd < 0) {
          throw new Error("speech_budget_usage_invalid");
        }
        return total + spentUsd + reservedUsd;
      }, 0);

  return {
    owner: { spentTodayUsd: sum("day", args.owner), spentThisMonthUsd: sum("month", args.owner) },
    // 조직 합계는 기존처럼 owner 문서의 합이다. 예약도 같은 행에 두어 별도 global 원장을 만들지 않는다.
    global: { spentTodayUsd: sum("day"), spentThisMonthUsd: sum("month") },
  };
}

/** 예약·정산·해제는 reserve transaction의 동일 session 안에서만 호출한다. */
export async function adjustSpeechBudgetUsageForReservation(args: {
  environment: string;
  owner: SpeechBudgetOwnerType;
  provider: string;
  dayKey: string;
  monthKey: string;
  reservedUsdDelta: number;
  spentUsdDelta: number;
  requestCountDelta: number;
  expiresAt: Date;
  session: ClientSession;
}) {
  const deltas = [args.reservedUsdDelta, args.spentUsdDelta, args.requestCountDelta];
  if (deltas.some((value) => !Number.isFinite(value))) throw new Error("speech_budget_usage_delta_invalid");

  const Model = await getUsageModel();
  const provider = String(args.provider || "").trim().toLowerCase();
  for (const [periodType, periodKey] of [["day", args.dayKey], ["month", args.monthKey]] as const) {
    const filter = { environment: args.environment, owner: args.owner, provider, periodType, periodKey };
    const increment: Record<string, number> = {};
    if (args.reservedUsdDelta !== 0) increment.reservedUsd = args.reservedUsdDelta;
    if (args.spentUsdDelta !== 0) increment.spentUsd = args.spentUsdDelta;
    if (args.requestCountDelta !== 0) increment.requestCount = args.requestCountDelta;

    if (args.reservedUsdDelta < 0) {
      const current = await Model.findOne(filter).select({ reservedUsd: 1 }).session(args.session).lean();
      const reservedUsd = Number(current?.reservedUsd ?? 0);
      if (!current || !Number.isFinite(reservedUsd) || reservedUsd + 1e-12 < Math.abs(args.reservedUsdDelta)) {
        throw new Error("speech_budget_reserved_usage_missing");
      }
    }

    const result = await Model.updateOne(
      filter,
      {
        $inc: increment,
        $set: { expiresAt: args.expiresAt },
        ...(args.reservedUsdDelta > 0 ? { $setOnInsert: { spentUsd: 0, requestCount: 0 } } : {}),
      },
      {
        session: args.session,
        upsert: args.reservedUsdDelta > 0,
        setDefaultsOnInsert: false,
      },
    );
    if (Number(result.matchedCount || 0) + Number(result.upsertedCount || 0) !== 1) {
      throw new Error("speech_budget_usage_update_missing");
    }
  }
}
