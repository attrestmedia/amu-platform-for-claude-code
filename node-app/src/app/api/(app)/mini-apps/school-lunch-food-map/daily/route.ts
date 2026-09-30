import { NextRequest, NextResponse } from "next/server";
import type { SchoolLunchDailyDataType, SchoolLunchNeisSchoolItemType } from "types/app";
import {
  SCHOOL_LUNCH_IMAGE_RATIO,
  buildSchoolLunchAllergyGuide,
  buildSchoolLunchDishes,
  buildSchoolLunchHotspots,
  parseSchoolLunchMenu,
  resolveSchoolLunchTemplateKey,
} from "src/libs/apps/schoolLunchFoodMap";
import { getNeisMeal } from "libs/server-utils/thirdparty/neis";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트((app) / mini-apps / school-lunch-food-map / daily) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  NEIS 급식 조회  식판용 dish/hotspot 조합  JSON 응답 반환
 * @domain mini-app.school-lunch
 * @scope public_api
 */

export const revalidate = 0;

function safeText(value: unknown, limit = 160) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const officeCode = safeText(searchParams.get("officeCode"), 20);
    const schoolCode = safeText(searchParams.get("schoolCode"), 20);
    const date = safeText(searchParams.get("date"), 20);

    if (!officeCode || !schoolCode || !date) {
      return NextResponse.json({ ok: false, error: "officeCode_schoolCode_date_required" }, { status: 400 });
    }

    const school: SchoolLunchNeisSchoolItemType = {
      officeCode,
      schoolCode,
      schoolName: safeText(searchParams.get("schoolName"), 120),
      schoolType: safeText(searchParams.get("schoolType"), 40),
      region: safeText(searchParams.get("region"), 40),
      address: safeText(searchParams.get("address"), 160),
    };

    const meal = await getNeisMeal({ officeCode, schoolCode, date });
    const parsedMenu = parseSchoolLunchMenu(meal.mealMenuText);
    const rawMenu = parsedMenu.map((item) => item.name);
    const dishes = buildSchoolLunchDishes(rawMenu);
    const allergyCodes = Array.from(new Set(dishes.flatMap((dish) => dish.allergyCodes))).sort((a, b) => a - b);
    const templateKey = resolveSchoolLunchTemplateKey(searchParams.get("templateKey"));

    const data: SchoolLunchDailyDataType = {
      school: {
        ...school,
        schoolName: school.schoolName || meal.schoolName,
      },
      mealDate: meal.mealDate,
      rawMenu,
      allergyCodes,
      dishes,
      layout: {
        templateKey,
        imageRatio: SCHOOL_LUNCH_IMAGE_RATIO,
        hotspots: buildSchoolLunchHotspots(dishes),
      },
      trayImage: {
        status: "not_generated",
        previewUrl: null,
        templateKey,
      },
      allergyGuide: buildSchoolLunchAllergyGuide(allergyCodes),
    };

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: toErrorMessage(error, "school_lunch_daily_fetch_failed"),
      },
      { status: 500 },
    );
  }
}
