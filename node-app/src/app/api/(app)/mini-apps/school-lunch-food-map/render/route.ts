import { NextResponse } from "next/server";
import type { ImagePromptBodyType, SchoolLunchRenderRequestType, SchoolLunchRenderResponseType } from "types/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { handleUserImagePrompt } from "libs/server-utils/api/imagePromptHandler";
import {
  SCHOOL_LUNCH_IMAGE_RATIO,
  buildSchoolLunchHotspots,
  buildSchoolLunchRenderExtraPrompt,
  buildSchoolLunchTemplateVariables,
  resolveSchoolLunchTemplateKey,
} from "src/libs/apps/schoolLunchFoodMap";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose API 라우트((app) / mini-apps / school-lunch-food-map / render) 기능 요청 처리
 * @process POST 요청 파싱  인증 검증  템플릿 변수 조합  Gen Studio 템플릿 이미지 생성  JSON 응답 반환
 * @domain mini-app.school-lunch
 * @scope server_route
 */

export const runtime = "nodejs";

function safeText(value: unknown, limit = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function validateRenderBody(data: SchoolLunchRenderRequestType) {
  const schoolName = safeText(data?.schoolName, 120);
  const mealDate = safeText(data?.mealDate, 20);
  const dishes = Array.isArray(data?.dishes) ? data.dishes.filter((dish) => safeText(dish?.name, 120)) : [];

  if (!schoolName) return { valid: false, error: "schoolName_required" };
  if (!mealDate) return { valid: false, error: "mealDate_required" };
  if (!dishes.length) return { valid: false, error: "dishes_required" };
  return { valid: true };
}

async function handlePOST(data: SchoolLunchRenderRequestType, user: unknown) {
  const templateKey = resolveSchoolLunchTemplateKey(data?.templateKey);
  const dishes = Array.isArray(data?.dishes)
    ? data.dishes
        .map((dish) => ({
          id: safeText(dish?.id, 40),
          name: safeText(dish?.name, 120),
          role: dish?.role,
        }))
        .filter((dish) => dish.id && dish.name && dish.role)
    : [];

  const payload: ImagePromptBodyType = {
    templateKey,
    generationMode: "template",
    variables: buildSchoolLunchTemplateVariables({
      schoolName: safeText(data?.schoolName, 120),
      mealDate: safeText(data?.mealDate, 20),
      dishes,
    }),
    extraPrompt: buildSchoolLunchRenderExtraPrompt({
      schoolName: safeText(data?.schoolName, 120),
      mealDate: safeText(data?.mealDate, 20),
      dishes,
      style: safeText(data?.style, 80),
    }),
    aspectRatio: SCHOOL_LUNCH_IMAGE_RATIO,
    n: 1,
  };

  const result = await handleUserImagePrompt(payload, user);
  const resultRecord = toUnknownRecord(result);
  const resultData = toUnknownRecord(resultRecord.data);
  const images = Array.isArray(resultData.images) ? resultData.images : [];
  const imageUrl = String(images[0] || "").trim();

  if (!resultRecord.ok || !imageUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: String(resultRecord.error || "school_lunch_tray_render_failed"),
        errorCode: String(resultRecord.errorCode || ""),
      },
      { status: 500 },
    );
  }

  const response: SchoolLunchRenderResponseType = {
    imageUrl,
    templateKey,
    layout: {
      templateKey,
      imageRatio: SCHOOL_LUNCH_IMAGE_RATIO,
      hotspots: buildSchoolLunchHotspots(dishes),
    },
    billing: {
      coinsUsed: Number(resultData.coins || 0),
    },
  };

  return {
    ok: true,
    data: response,
  };
}

export const POST = withAuth(handlePOST, validateRenderBody, "mini-apps/school-lunch-food-map/render", {
  bodyParser: "json",
});
