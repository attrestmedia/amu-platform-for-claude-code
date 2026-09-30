import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getModel } from "libs/database/modelCache";
import { safeSeg } from "libs/server-utils/file/fileUploadHandler";
import { UserCategorySchema } from "models/catalog";
import type { IUserCategoryData } from "models/catalog";
import { MONGODB_CATALOG_URL } from "consts/env/server";
import { isUnknownRecord, type UnknownRecord } from "utils/common";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import {
  normalizeCatalogCategoryForTransport,
  normalizeCatalogImageForTransport,
} from "libs/server-utils/catalog/catalogStorageMigration";

/**
 * @docHint
 * @purpose API 라우트((app) / catalog / [userId] / products) 기능 요청 처리
 * @process GET / POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain catalog
 * @scope api
 */

function resolveCatalogUserId(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function sanitizeCategoryPayload(rawData: unknown, subCategoryId: string) {
  if (!isUnknownRecord(rawData)) return null;

  const candidate = rawData[subCategoryId] ?? Object.values(rawData)[0];
  if (!isUnknownRecord(candidate)) return null;

  const list = Array.isArray(candidate.list) ? candidate.list.map(normalizeCatalogImageForTransport) : [];
  return {
    id: subCategoryId,
    name: String(candidate.name || subCategoryId).trim().slice(0, 120),
    list,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  // params를 await 해서 실제 userId를 얻음
  const { userId = "guest" } = await params;
  const categoryName = request.nextUrl.searchParams.get("categoryName");
  if (!categoryName) {
    return NextResponse.json({ error: "categoryName 파라미터가 필요합니다." }, { status: 400 });
  }

  // 모델 가져오기
  const UserModel = await getModel<IUserCategoryData>(MONGODB_CATALOG_URL, "Product", UserCategorySchema, "products");

  const categoryDoc = await UserModel.findOne({ userId, category: categoryName }).lean();

  if (!categoryDoc) {
    return NextResponse.json({ error: "카테고리 데이터를 찾을 수 없습니다." }, { status: 404 });
  }

  const data = Object.values(categoryDoc.data).map(normalizeCatalogCategoryForTransport);
  return NextResponse.json(data);
}

async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType, request: NextRequest, context: NextRouteContext) {
  const userId = String(context?.params?.userId || "guest");
  const categoryName = request.nextUrl.searchParams.get("categoryName");
  if (!categoryName) {
    return NextResponse.json({ error: "categoryName 파라미터가 필요합니다." }, { status: 400 });
  }

  const authUserId = resolveCatalogUserId(user);
  if (!authUserId || userId !== authUserId) {
    return NextResponse.json({ error: "본인 카탈로그 데이터만 저장할 수 있습니다." }, { status: 403 });
  }

  const categoryKey = safeSeg(categoryName);
  const subCategoryKey = safeSeg(request.nextUrl.searchParams.get("subCategoryId") || "");
  if (!categoryKey || !subCategoryKey) {
    return NextResponse.json({ error: "카탈로그 경로 필드 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const subCategoryData = sanitizeCategoryPayload(body?.data, subCategoryKey);
  if (!subCategoryData) {
    return NextResponse.json({ error: "저장할 상품 데이터 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 모델 가져오기
  const UserModel = await getModel<IUserCategoryData>(MONGODB_CATALOG_URL, "Data", UserCategorySchema, "products");

  await UserModel.updateOne(
    { userId, category: categoryName },
    {
      $setOnInsert: { userId, category: categoryName },
      $set: {
        [`data.${subCategoryKey}`]: subCategoryData,
      },
    },
    { upsert: true },
  );

  return NextResponse.json({ message: "데이터 저장 성공" });
}

export const POST = withAuth(handlePOST, undefined, "catalog/products:write", { bodyParser: "json" });
