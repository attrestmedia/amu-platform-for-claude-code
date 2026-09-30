import { Schema, type Document, type Model, type FilterQuery } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { MONGODB_LOGS_URL } from "consts/env/server";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(uid, timestamp, ip, userAgent, device, success) 및 인덱스/기본값 선언
 * @domain auth
 * @scope db_schema
 */

export interface ILoginLog extends Document {
  uid: string; // 사용자 ID
  timestamp: Date; // 로그인 시간
  ip: string; // 접속 IP
  userAgent?: string; // 사용자 에이전트
  device?: string; // 접속 장치
  success: boolean; // 로그인 성공 여부
  expireAt: Date; // 만료 시간 (TTL)
}

// 로그인 로그 스키마 정의
const LoginLogSchema = new Schema<ILoginLog>({
  uid: {
    type: String,
    required: true,
    index: true, // uid로 빠른 조회를 위한 인덱스
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true, // 시간순 조회를 위한 인덱스
  },
  ip: {
    type: String,
    default: "unknown",
  },
  userAgent: {
    type: String,
    default: "",
  },
  device: {
    type: String,
    default: "unknown",
  },
  success: {
    type: Boolean,
    default: true,
  },
  // TTL 인덱스를 위한 만료 시간 - 90일 후 자동 삭제
  expireAt: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    index: { expires: 0 },
  },
});

// 성능 최적화를 위한 복합 인덱스
LoginLogSchema.index({ uid: 1, timestamp: -1 });

// 모델 가져오기 함수
export async function getLoginLogModel(): Promise<Model<ILoginLog>> {
  return getModel<ILoginLog>(MONGODB_LOGS_URL, "LoginLog", LoginLogSchema);
}

// 로그 추가 유틸리티 함수
export async function addLoginLog(logData: Partial<ILoginLog>): Promise<ILoginLog | null> {
  try {
    const model = await getLoginLogModel();
    return await model.create({
      timestamp: new Date(),
      success: true,
      ...logData,
    });
  } catch (error) {
    console.error("로그인 로그 추가 실패:", error);
    return null;
  }
}

// 사용자별 로그 조회 함수
export async function getUserLogs(
  uid: string,
  options: {
    limit?: number;
    skip?: number;
    startDate?: Date;
    endDate?: Date;
  } = {},
): Promise<ILoginLog[]> {
  try {
    const { limit = 10, skip = 0, startDate, endDate } = options;
    const model = await getLoginLogModel();

    const query: FilterQuery<ILoginLog> = { uid };

    // 날짜 범위 필터 추가
    if (startDate || endDate) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (startDate) range.$gte = startDate;
      if (endDate) range.$lte = endDate;
      query.timestamp = range;
    }

    return model
      .find(query)
      .sort({ timestamp: -1 }) // 최신순
      .skip(skip)
      .limit(limit);
  } catch (error) {
    console.error("사용자 로그 조회 실패:", error);
    return [];
  }
}

export { LoginLogSchema };
