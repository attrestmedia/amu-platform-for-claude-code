import "server-only";
import { addLoginLog } from "models/auth";
import type { IUserDocument } from "models/user";
import { UserSchema } from "models/user";
import { getModel } from "libs/database/modelCache";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process recordLogin 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain auth
 * @scope server
 */

// 로그인 정보 기록 및 사용자 통계 업데이트
export async function recordLogin(
  uid: string,
  logData: {
    ip?: string;
    userAgent?: string;
    device?: string;
    success?: boolean;
  },
): Promise<boolean> {
  try {
    // 1. 로그인 로그 기록
    await addLoginLog({
      uid,
      ip: logData.ip,
      userAgent: logData.userAgent,
      device: logData.device,
      success: logData.success !== false, // 기본값은 true
    });

    // 성공적인 로그인인 경우에만 통계 업데이트
    if (logData.success !== false) {
      // 2. 사용자 통계 업데이트
      const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
      const UserModel = await getModel(MONGODB_USERS_URL, modelName, UserSchema, modelName);

      const user = (await UserModel.findOne({ uid })) as IUserDocument;
      if (!user) {
        logger.warn(`사용자 통계 업데이트 실패: 사용자(${uid})를 찾을 수 없음`);
        return false;
      }

      // 현재 날짜 (시간 정보 제외)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 통계 정보 초기화 (없는 경우)
      if (!user.loginStats) {
        user.loginStats = {
          firstLogin: new Date(),
          lastLogin: new Date(),
          lastIp: logData.ip || "unknown",
          lastUserAgent: logData.userAgent || "",
          lastDevice: logData.device || "unknown",
          totalLogins: 1,
          consecutiveDays: 1,
          lastLoginDate: today,
          recentLoginDates: [today],
        };
      } else {
        // 기존 통계 업데이트
        const stats = user.loginStats;

        // 기본 정보 업데이트
        stats.lastLogin = new Date();
        stats.lastIp = logData.ip || stats.lastIp || "unknown";
        stats.lastUserAgent = logData.userAgent || stats.lastUserAgent || "";
        stats.lastDevice = logData.device || stats.lastDevice || "unknown";
        stats.totalLogins = (stats.totalLogins || 0) + 1;

        // 연속 로그인 일수 계산
        const lastLoginDate = stats.lastLoginDate ? new Date(stats.lastLoginDate) : null;
        if (lastLoginDate) {
          // 하루 차이 계산 (ms → 일)
          const dayDiff = Math.floor((today.getTime() - lastLoginDate.getTime()) / (24 * 60 * 60 * 1000));

          if (dayDiff === 1) {
            // 어제 로그인했으면 연속일 증가
            stats.consecutiveDays = (stats.consecutiveDays || 0) + 1;
          } else if (dayDiff > 1) {
            // 이틀 이상 지났으면 초기화
            stats.consecutiveDays = 1;
          }
          // 같은 날 다시 로그인한 경우 연속일 변화 없음 (dayDiff === 0)
        } else {
          // 최초 로그인
          stats.consecutiveDays = 1;
        }

        // 오늘 날짜 업데이트
        stats.lastLoginDate = today;

        // 최근 로그인 날짜 목록 업데이트 (중복 방지)
        if (!stats.recentLoginDates) {
          stats.recentLoginDates = [today];
        } else {
          // 이미 오늘 로그인했는지 확인
          const todayExists = stats.recentLoginDates.some(
            (date: Date) => new Date(date).toDateString() === today.toDateString(),
          );

          if (!todayExists) {
            stats.recentLoginDates.push(today);

            // 최대 30개 유지
            if (stats.recentLoginDates.length > 30) {
              stats.recentLoginDates = stats.recentLoginDates.slice(-30);
            }
          }
        }
      }

      // Mongoose에 변경 사항 알림
      user.markModified("loginStats");

      // 저장
      await user.save();
    }

    return true;
  } catch (error) {
    logger.error("로그인 기록 업데이트 실패:", error);
    return false;
  }
}

// 서버에서 exp 추출하는 유틸 (클라이언트는 tokenUtils에 구현) - Node 환경에서 atob를 대체
function decodeBase64Url(str: string) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

export function getJwtExpServer(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = decodeURIComponent(
      decodeBase64Url(payload)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const data = JSON.parse(json);
    return typeof data.exp === "number" ? data.exp : null;
  } catch {
    return null;
  }
}
