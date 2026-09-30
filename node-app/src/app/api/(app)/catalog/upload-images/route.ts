import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getModel } from "libs/database/modelCache";
import { UserCategorySchema } from "models/catalog";
import type { IUserCategoryData } from "models/catalog";
import { MONGODB_CATALOG_URL } from "consts/env/server";
import { logger } from "utils/log";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  CatalogImageStorageError,
  deleteCatalogImageObject,
  storeCatalogImage,
} from "libs/server-utils/catalog/catalogImageStorage";
import { safeSeg } from "libs/server-utils/file/fileUploadHandler";

/**
 * @docHint
 * @purpose 카탈로그 주석 작업용 이미지를 R2에 최적화 저장하고 DB 목록에 연결
 * @process 본인 권한 확인 → 이미지 변환 → R2 PUT/HEAD 검증 → DB 반영 → 실패 시 객체 롤백
 * @domain catalog
 * @scope api
 */

export const runtime = "nodejs";

function getSingleField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function handlePOST(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uploaded: Array<Awaited<ReturnType<typeof storeCatalogImage>>> = [];
  try {
    const formData = await request.formData();
    const userId = getSingleField(formData, "userId");
    const categoryName = getSingleField(formData, "categoryName");
    const subCategoryName = getSingleField(formData, "subCategoryName");
    if (!userId || !categoryName || !subCategoryName) {
      return NextResponse.json({ error: "userId, categoryName, subCategoryName은 필수 입력 항목입니다." }, { status: 400 });
    }

    const authUserId = String(user?.uid || user?.ID || "").trim();
    if (!authUserId || userId !== authUserId) {
      return NextResponse.json({ error: "본인 카탈로그에만 이미지를 업로드할 수 있습니다." }, { status: 403 });
    }
    const categorySeg = safeSeg(categoryName);
    const subCategorySeg = safeSeg(subCategoryName);
    if (!categorySeg || !subCategorySeg) {
      return NextResponse.json({ error: "카탈로그 경로 필드 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const files = formData.getAll("images").filter((file): file is File => file instanceof File);
    if (!files.length) return NextResponse.json({ error: "업로드할 이미지가 없습니다." }, { status: 400 });

    for (const file of files) {
      try {
        uploaded.push(await storeCatalogImage({ file, userId, category: categoryName, subCategory: subCategoryName }));
      } catch (error) {
        if (error instanceof CatalogImageStorageError && error.status < 500) continue;
        throw error;
      }
    }
    if (!uploaded.length) return NextResponse.json({ error: "유효한 이미지를 업로드하지 않았습니다." }, { status: 400 });

    const UserModel = await getModel<IUserCategoryData>(MONGODB_CATALOG_URL, "Product", UserCategorySchema, "products");
    const subCategoryId = `catalog_${subCategorySeg}_id_${crypto.randomUUID()}`;
    const newImages = uploaded.map((image) => ({
      id: image.assetId,
      src: image.url,
      storage: image.storage,
      status: "pending",
      annotations: [],
      maskings: [],
    }));
    await UserModel.updateOne(
      { userId, category: categoryName },
      {
        $setOnInsert: { userId, category: categoryName },
        $set: {
          [`data.${subCategorySeg}.id`]: subCategoryId,
          [`data.${subCategorySeg}.name`]: subCategoryName,
        },
        $push: { [`data.${subCategorySeg}.list`]: { $each: newImages } },
      },
      { upsert: true },
    );

    return NextResponse.json({ message: "이미지 업로드 및 데이터 저장에 성공했습니다.", images: uploaded.map((item) => item.url) });
  } catch (error) {
    await Promise.all(uploaded.map((item) => deleteCatalogImageObject(item.storage).catch(() => false)));
    logger.error("카탈로그 이미지 업로드 오류:", error);
    const status = error instanceof CatalogImageStorageError ? error.status : 500;
    const code = error instanceof CatalogImageStorageError ? error.message : "이미지 업로드 중 오류가 발생했습니다.";
    return NextResponse.json({ error: code }, { status });
  }
}

export const POST = withAuth(handlePOST, undefined, "catalog/upload-images", { bodyParser: "none" });
