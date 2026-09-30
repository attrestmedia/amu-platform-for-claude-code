import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getPlatformCredentialEnvironment } from "consts/secure/platformCredentials";
import { SPEECH_BUDGET_OWNERS, type SpeechBudgetOwnerType } from "consts/system/speechRuntimeControls";
import { getModel } from "libs/database/modelCache";
import { resolveSpeechBudgetPeriodKeys } from "libs/server-utils/audio/speechBudgetPolicy";
import { SpeechBudgetUsageSchema, type ISpeechBudgetUsageDocument } from "models/system";

/**
 * @docHint
 * @purpose speech 지출 누적 집계 조회·기록
 * @process 기간 키 산출  원자적 $inc  owner/조직 합계 반환
 * @domain system-control
 * @scope server
 */

const COLLECTION = "speech_budget_usage";
/** 월 상한 판정에 필요한 만큼만 보관한다. 회계 원장이 아니다 — 그쪽은 coin usage ledger가 소유한다. */
const RETENTION_DAYS = 400;

export { resolveSpeechBudgetPeriodKeys };

async function getUsageModel() {
  return await getModel<ISpeechBudgetUsageDocument>(MONGODB_AMU_URL, "SpeechBudgetUsage", SpeechBudgetUsageSchema, COLLECTION);
}

export type SpeechBudgetUsageReadResult = {
  /** null은 "집계를 확인하지 못했다"이며 0(쓴 적 없음)과 구분한다. */
  spentTodayUsd: number | null;
  spentThisMonthUsd: number | null;
};

/**
 * owner별과 조직 전체 누적을 함께 읽는다.
 *
 * 조회 실패는 예외로 올린다. **0으로 폴백하지 않는다** — 얼마 썼는지 모르는 상태를
 * "하나도 안 썼다"로 읽으면 상한이 통째로 풀린다. 호출부가 fail-closed로 처리한다.
 */
export async function readSpeechBudgetUsage(args: {
  owner: SpeechBudgetOwnerType;
  provider: string;
  at?: Date;
}): Promise<{ owner: SpeechBudgetUsageReadResult; global: SpeechBudgetUsageReadResult }> {
  const Model = await getUsageModel();
  const environment = getPlatformCredentialEnvironment();
  const { day, month } = resolveSpeechBudgetPeriodKeys(args.at);
  const provider = String(args.provider || "").trim().toLowerCase();

  const rows = await Model.find({
    environment,
    provider,
    $or: [
      { periodType: "day", periodKey: day },
      { periodType: "month", periodKey: month },
    ],
  })
    .select({ owner: 1, periodType: 1, spentUsd: 1 })
    .lean();

  const sum = (periodType: "day" | "month", owner?: SpeechBudgetOwnerType) =>
    rows
      .filter((row) => row.periodType === periodType && (!owner || row.owner === owner))
      .reduce((total, row) => total + Number(row.spentUsd || 0), 0);

  return {
    owner: { spentTodayUsd: sum("day", args.owner), spentThisMonthUsd: sum("month", args.owner) },
    // 조직 합계는 owner 문서들의 합이다. 별도 owner 문서를 두면 두 값이 어긋날 수 있다.
    global: { spentTodayUsd: sum("day"), spentThisMonthUsd: sum("month") },
  };
}

/**
 * 실제 지출을 누적한다. 원자적 `$inc`이므로 컨테이너가 여러 대여도 합계가 맞는다.
 *
 * **호출이 끝난 뒤에 부른다.** 이미 쓴 돈을 기록하는 것이므로 실패해도 응답을 막지 않고,
 * 대신 호출부가 로그를 남긴다(다음 판정이 과소 집계될 수 있다는 사실을 감춘다면 그게 더 나쁘다).
 */
export async function recordSpeechBudgetUsage(args: {
  owner: SpeechBudgetOwnerType;
  provider: string;
  spentUsd: number;
  at?: Date;
}) {
  const spentUsd = Number(args.spentUsd);
  if (!Number.isFinite(spentUsd) || spentUsd < 0) return { recorded: false as const, reason: "invalid_amount" };
  if (!(SPEECH_BUDGET_OWNERS as readonly string[]).includes(args.owner)) {
    return { recorded: false as const, reason: "unknown_owner" };
  }

  const Model = await getUsageModel();
  const environment = getPlatformCredentialEnvironment();
  const at = args.at || new Date();
  const { day, month } = resolveSpeechBudgetPeriodKeys(at);
  const provider = String(args.provider || "").trim().toLowerCase();
  const expiresAt = new Date(at.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  await Promise.all(
    ([
      ["day", day],
      ["month", month],
    ] as const).map(([periodType, periodKey]) =>
      Model.updateOne(
        { environment, owner: args.owner, provider, periodType, periodKey },
        { $inc: { spentUsd, requestCount: 1 }, $set: { expiresAt } },
        { upsert: true },
      ),
    ),
  );

  return { recorded: true as const, day, month, spentUsd };
}
