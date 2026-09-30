import { NextRequest, NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { UserCategorySchema } from "models/catalog";
import type { IUserCategoryData } from "models/catalog";
import { MONGODB_CATALOG_URL } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트((app) / catalog / [userId] / categories) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain catalog
 * @scope api
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;

    // 모델 가져오기
    const UserModel = await getModel<IUserCategoryData>(MONGODB_CATALOG_URL, "Product", UserCategorySchema, "products");

    // 해당 사용자의 모든 카테고리 이름 가져오기
    const categories = await UserModel.find({ userId }, { category: 1, _id: 0 }).lean();
    const categoryNames = categories.map((doc) => doc.category);

    return NextResponse.json(categoryNames);
  } catch (error) {
    logger.error(error);
    return NextResponse.json({ error: "데이터를 가져오는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
