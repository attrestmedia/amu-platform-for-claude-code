import "server-only";
import { estimateSpeechListPriceUsd } from "consts/ai/speechListPrice";
import type { SpeechBillingUnitType } from "consts/ai/speechModel";
import { resolveSpeechBudgetBlock, type SpeechBudgetOwnerType } from "consts/system/speechRuntimeControls";
import { readSpeechBudgetUsage, recordSpeechBudgetUsage } from "libs/database/system";
import { getSpeechRuntimeControls } from "libs/server-utils/system/speechRuntimeControls";
import { logger } from "utils/log";
import { resolveElevenLabsAudienceBlock } from "./elevenlabsAudiencePolicy";
import { createSpeechError } from "./guards";
import { isBudgetEnforcedProvider, resolveSpeechBudgetOwner } from "./speechBudgetPolicy";
import type { ISpeechBillingContext } from "./types";
import { resolveAdultEligibility } from "./voiceDataConsent";

/**
 * @docHint
 * @purpose EL-204 speech 지출 상한 서버 강제
 * @process owner 판정  정가 환산  누적 조회  차단 판정  호출 후 실지출 기록
 * @domain speech
 * @scope server
 *
 * **적용 범위를 좁게 잡았다.** SPEECH_BUDGET_REQUIRED_PROVIDERS(현재 elevenlabs)에만 강제한다.
 * 운영 중인 OpenAI speech 경로는 상한이 전부 미확정이라, 지금 강제를 켜면 즉시 끊긴다.
 * 확대는 상한 수치가 들어온 뒤 별도 판단이며 그 배열이 단일 지점이다.
 *
 * 판정에 필요한 것을 하나라도 확인하지 못하면 통과시키지 않는다 — 단가를 모르거나(SPEECH_PRICING_UNVERIFIED),
 * 얼마 썼는지 모르거나(budget_usage_unavailable), owner를 모르면(budget_owner_unknown) 차단이다.
 */

export type SpeechBudgetDecision = {
  enforced: boolean;
  owner?: SpeechBudgetOwnerType;
  estimatedUsd?: number;
};

/**
 * provider 호출 **직전**에 부른다. 차단이면 SPEECH_BUDGET_EXCEEDED로 던진다.
 *
 * 강제 대상이 아니면 아무것도 하지 않고 통과시킨다(기존 경로 무변경).
 */
export async function assertSpeechBudgetOrThrow(args: {
  provider: string;
  modelName: string;
  unit: SpeechBillingUnitType;
  quantity: number;
  billing?: ISpeechBillingContext;
  /** 대상 제한 판정용. 없으면 eligibility가 unknown이 되어 이용자 대면 owner에서는 차단된다. */
  user?: unknown;
}): Promise<SpeechBudgetDecision> {
  if (!isBudgetEnforcedProvider(args.provider)) return { enforced: false };

  const owner = resolveSpeechBudgetOwner(args.billing);

  // EL-002 — 이용자 대면 owner(tutors·play)는 성인 전용이다. 예산보다 먼저 판정한다.
  // 대상이 아닌 요청은 얼마를 쓰든 허용될 수 없으므로 금액 계산 자체가 불필요하다.
  const audienceBlock = resolveElevenLabsAudienceBlock({
    owner,
    adultEligibility: resolveAdultEligibility(args.user),
  });
  if (audienceBlock) {
    throw createSpeechError(
      "이 음성 기능은 성인 이용자에게만 제공됩니다.",
      "SPEECH_AUDIENCE_RESTRICTED",
      403,
      { provider: args.provider, owner: owner || null, blockedReason: audienceBlock },
    );
  }

  const estimatedUsd = estimateSpeechListPriceUsd({
    provider: args.provider,
    modelName: args.modelName,
    unit: args.unit,
    quantity: args.quantity,
  });
  if (estimatedUsd === null) {
    // 단가를 모르는 요청은 무료가 아니라 판정 불가다.
    throw createSpeechError("이 모델의 정가가 확인되지 않아 지출 상한을 판정할 수 없습니다.", "SPEECH_PRICING_UNVERIFIED", 503, {
      provider: args.provider,
      modelName: args.modelName,
      unit: args.unit,
    });
  }

  const controls = await getSpeechRuntimeControls();

  let usage: Awaited<ReturnType<typeof readSpeechBudgetUsage>> | null = null;
  if (owner) {
    try {
      usage = await readSpeechBudgetUsage({ owner, provider: args.provider });
    } catch (error) {
      // 조회 실패를 0으로 폴백하면 상한이 통째로 풀린다. null로 넘겨 fail-closed로 떨어뜨린다.
      logger.error("[speech-budget] 누적 집계 조회 실패 — fail-closed로 차단합니다.", error);
      usage = null;
    }
  }

  const blockedReason = resolveSpeechBudgetBlock({
    controls,
    provider: args.provider,
    owner: owner || "",
    estimatedUsd,
    ownerUsage: usage?.owner,
    globalUsage: usage?.global,
  });

  if (blockedReason) {
    throw createSpeechError("승인된 음성 지출 상한을 넘어 요청을 처리할 수 없습니다.", "SPEECH_BUDGET_EXCEEDED", 429, {
      provider: args.provider,
      modelName: args.modelName,
      owner: owner || null,
      estimatedUsd,
      blockedReason,
    });
  }

  return { enforced: true, owner, estimatedUsd };
}

/**
 * provider 호출이 **끝난 뒤** 실제 사용량으로 누적한다.
 *
 * 이미 쓴 돈을 기록하는 단계이므로 실패해도 응답을 막지 않는다. 대신 반드시 로그를 남긴다 —
 * 기록 누락은 다음 판정을 과소 집계로 만들고, 그것을 조용히 넘기면 상한이 서서히 새어 나간다.
 */
export async function recordSpeechSpend(args: {
  decision: SpeechBudgetDecision;
  provider: string;
  modelName: string;
  unit: SpeechBillingUnitType;
  quantity: number;
}) {
  if (!args.decision.enforced || !args.decision.owner) return;
  const actualUsd =
    estimateSpeechListPriceUsd({
      provider: args.provider,
      modelName: args.modelName,
      unit: args.unit,
      quantity: args.quantity,
    }) ?? args.decision.estimatedUsd;
  if (actualUsd === undefined) return;

  try {
    await recordSpeechBudgetUsage({ owner: args.decision.owner, provider: args.provider, spentUsd: actualUsd });
  } catch (error) {
    logger.error("[speech-budget] 실지출 기록 실패 — 다음 상한 판정이 과소 집계됩니다.", error);
  }
}
