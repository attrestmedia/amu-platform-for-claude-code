import "server-only";
import { getNpcUsageModel } from "models/game";
import { logger } from "utils/log";
import { getUserAccountType } from "../auth/userRoleUtils";
import { toErrorLike } from "utils/common/typeUtils";
import type { IUpdateUserData } from "types/user";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process validateNpcUsage 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain game
 * @scope server
 */

// 현재 시간 포맷팅 함수 (YYYY-MM-DD-HH-mm 형식) - 기존과 동일
function getCurrentTimeKey() {
  const now = new Date();
  const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}-${String(now.getUTCMinutes()).padStart(2, "0")}`;

  logger.debug(`현재 시간 키: ${key}`);
  return key;
}

// 일일/시간별 카운터용 포맷 함수들
function formatHour(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}-${String(date.getUTCHours()).padStart(2, "0")}`;
}

function formatDay(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

// NPC 사용량 검증
export async function validateNpcUsage(userId: string, npcId: string, userData: IUpdateUserData) {
  // 유저의 계정 타입 가져오기
  const userAccountType = getUserAccountType(userData);

  // enterprise 제한 없음
  if (userAccountType === "enterprise") {
    return { allowed: true };
  }

  try {
    const NpcUsageModel = await getNpcUsageModel();
    const now = new Date();
    const currentTimeKey = getCurrentTimeKey();
    const currentHour = formatHour(now);
    const currentDay = formatDay(now);

    // 3. 사용량 증가 - 기존 로직 + 성능 카운터 추가
    try {
      // 하이브리드 업데이트: 기존 필드 + 새로운 최적화 필드
      const updateResult = await NpcUsageModel.findOneAndUpdate(
        { userId, npcId },
        [
          {
            $set: {
              // 기존 필드들 (호환성 유지)
              interactionCount: { $add: [{ $ifNull: ["$interactionCount", 0] }, 1] },
              [`dailyInteractions.${currentTimeKey}`]: {
                $add: [{ $ifNull: [`$dailyInteractions.${currentTimeKey}`, 0] }, 1],
              },
              lastInteracted: now,

              // 새로운 최적화 필드들
              hourlyCount: {
                $cond: [
                  { $eq: [{ $ifNull: ["$currentHour", ""] }, currentHour] },
                  { $add: [{ $ifNull: ["$hourlyCount", 0] }, 1] },
                  1,
                ],
              },
              dailyCount: {
                $cond: [
                  { $eq: [{ $ifNull: ["$currentDay", ""] }, currentDay] },
                  { $add: [{ $ifNull: ["$dailyCount", 0] }, 1] },
                  1,
                ],
              },
              currentHour,
              currentDay,
            },
          },
        ],
        { upsert: true, new: true },
      );

      logger.debug(`업데이트 완료: dailyCount=${updateResult?.dailyCount}, hourlyCount=${updateResult?.hourlyCount}`);
    } catch (updateError: unknown) {
      // 중복 키 오류 처리 - 기존과 동일
      const updateMeta = toErrorLike(updateError);
      if (updateMeta.errorCode === 11000 || updateMeta.code === 11000 || String(updateMeta.code) === "11000") {
        logger.warn(`중복 키 오류 감지, 업데이트만 재시도: ${userId}, ${npcId}`);

        await NpcUsageModel.updateOne(
          { userId, npcId },
          {
            $inc: {
              interactionCount: 1,
              [`dailyInteractions.${currentTimeKey}`]: 1,
              dailyCount: 1,
              hourlyCount: 1,
            },
            $set: {
              lastInteracted: now,
              currentHour,
              currentDay,
            },
          },
        );
      } else {
        throw updateError;
      }
    }

    return { allowed: true };
  } catch (error: unknown) {
    logger.error(`NPC 사용량 검증 오류:`, error);

    // 기존 에러 처리 로직 유지
    if (error instanceof Error) {
      if (
        error.name === "MongoNetworkError" ||
        error.name === "MongoTimeoutError" ||
        error.message.includes("timeout") ||
        error.message.includes("network")
      ) {
        logger.warn(`일시적 데이터베이스 오류, 제한적 요청 허용: ${error.message}`);
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      error: "시스템 오류로 인해 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.",
    };
  }
}
