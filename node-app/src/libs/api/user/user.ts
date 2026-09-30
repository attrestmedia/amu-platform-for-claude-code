import type { IUpdateUserData } from "types/user";
import { logger } from "utils/log";
import { DEFAULT_WORLD_UNIVERSE, DEFAULT_FANTASY_UNIVERSE } from "consts/app";
import fetchClient from "libs/api/fetchClient";
import type { IPersonaItem } from "types/ai";

export type UserApiResponse = {
  user?: IUpdateUserData;
  error?: string;
  warning?: string;
};

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/user) 호출 구성  응답/에러 정리 반환
 * @domain user
 * @scope client
 */

type AxiosLikeError = {
  response?: { status?: number };
  status?: number;
};

function normalizeMaybeJson(v: unknown): UserApiResponse {
  if (v == null) throw new Error("Empty response received from server");
  if (typeof v !== "string") return v as UserApiResponse;
  const text = v.trim();
  if (!text) throw new Error("Empty response received from server");
  try {
    return JSON.parse(text) as UserApiResponse;
  } catch (parseError) {
    logger.error("JSON Parse Error:", parseError, "Response:", text.substring(0, 200));
    throw new Error("Invalid JSON response from server");
  }
}

export async function updateUser(data: IUpdateUserData): Promise<UserApiResponse> {
  try {
    const res = await fetchClient.post<UserApiResponse | string>("/user", data, {
      timeout: 12_000,
      responseType: "auto",
    });

    return normalizeMaybeJson(res.data);
  } catch (error) {
    logger.error("Error in updateUser:", error);
    throw error;
  }
}

export async function getUser(uid: string, userEmail?: string): Promise<UserApiResponse> {
  try {
    const res = await fetchClient.get<UserApiResponse | string>("/user", {
      params: { uid },
      cache: "no-store",
      timeout: 12_000,
      responseType: "auto",
    });

    return normalizeMaybeJson(res.data);
  } catch (error) {
    const e = error as AxiosLikeError;
    const status = e?.response?.status ?? e?.status;

    if (status === 404) {
      logger.log(`사용자 ID(${uid})를 찾을 수 없음. 새 사용자 생성 시작...`);
      if (!userEmail) throw new Error("신규 사용자 생성을 위해서는 이메일이 필요합니다.");
      return await createNewUser(uid, userEmail);
    }

    logger.error("Error in getUser:", error);
    throw error;
  }
}

/**
 * 신규 사용자 생성 함수
 * @param uid
 * @returns
 */
async function createNewUser(uid: string, userEmail?: string): Promise<UserApiResponse> {
  logger.log(`createNewUser 호출: uid=${uid}`);

  if (!userEmail) {
    throw new Error("사용자 이메일은 필수 항목입니다.");
  }

  const currentTime = new Date();

  // 초기화된 오늘 날짜 (시간 정보 제외)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 기본 userPersonas 설정 (각 유니버스별로 기본 캐릭터들 추가)
  // - defaultUniverses 배열을 기반으로 동적 맵 생성
  const defaultUniverses = [DEFAULT_WORLD_UNIVERSE, DEFAULT_FANTASY_UNIVERSE];
  const defaultUserPersonas = defaultUniverses.reduce(
    (acc, universe) => {
      acc[universe] = [];
      return acc;
    },
    {} as Record<string, IPersonaItem[]>,
  );

  const newUserData = {
    uid,
    userEmail,
    userEmailLower: userEmail.toLowerCase(), // 필수 필드 채우기
    update: true,
    loginStats: {
      firstLogin: currentTime,
      lastLogin: currentTime,
      lastLoginDate: today,
      totalLogins: 1,
      consecutiveDays: 1,
      recentLoginDates: [today],
    },
    userPersonas: defaultUserPersonas,
  };

  return await updateUser(newUserData);
}
