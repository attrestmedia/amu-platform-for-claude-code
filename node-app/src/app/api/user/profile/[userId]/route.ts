import { NextRequest, NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { UserProfileSchema } from "models/user";
import type { IUserProfileData } from "types/catalog";
import { MONGODB_AMU_URL } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(user / profile / [userId]) 기능 요청 처리
 * @process GET / POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain user-profile
 * @scope user
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const resolvedParams = await params;
    const userId = resolvedParams.userId || "guest";

    // 모델 가져오기
    const UserModel = await getModel<IUserProfileData>(MONGODB_AMU_URL, "Profile", UserProfileSchema, "profiles");

    // 프로필 데이터 가져오기 (userId로 필터링)
    const profileDoc = await UserModel.findOne({ userId }).lean();
    const data = profileDoc ? profileDoc.data : null;

    if (!data) {
      return NextResponse.json({ error: "프로필 데이터를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    logger.error(error);
    return NextResponse.json({ error: "데이터를 가져오는 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const resolvedParams = await params;
    const userId = resolvedParams.userId || "guest";
    const body = await request.json();
    const data = body.data; // 저장할 프로필 데이터

    // 모델 가져오기
    const UserModel = await getModel<IUserProfileData>(MONGODB_AMU_URL, "Profile", UserProfileSchema, "profiles");

    // 프로필 업데이트
    await UserModel.updateOne({ userId }, { $set: { userId, data } }, { upsert: true });

    return NextResponse.json({ message: "프로필 데이터 저장 성공" });
  } catch (error) {
    logger.error(error);
    return NextResponse.json({ error: "데이터 저장 중 오류 발생" }, { status: 500 });
  }
}
