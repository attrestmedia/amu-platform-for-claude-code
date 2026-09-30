import { NextRequest, NextResponse } from "next/server";
import { parseSchoolLunchMenu } from "src/libs/apps/schoolLunchFoodMap";
import { getNeisMeal } from "libs/server-utils/thirdparty/neis";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / neis / meals) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  NEIS 급식 조회  메뉴 파싱  JSON 응답 반환
 * @domain education.neis
 * @scope public_api
 */

export const revalidate = 0;

function safeText(value: unknown, limit = 40) {
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

    const meal = await getNeisMeal({ officeCode, schoolCode, date });
    const parsedMenu = parseSchoolLunchMenu(meal.mealMenuText);
    const allergyCodes = Array.from(new Set(parsedMenu.flatMap((item) => item.allergyCodes))).sort((a, b) => a - b);
    const rawMenu = parsedMenu.map((item) => item.name);

    return NextResponse.json(
      {
        ok: true,
        data: {
          school: {
            officeCode: meal.officeCode,
            schoolCode: meal.schoolCode,
            schoolName: meal.schoolName,
          },
          mealDate: meal.mealDate,
          rawMenu,
          allergyCodes,
          mealSource: "neis",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: toErrorMessage(error, "neis_meal_fetch_failed"),
      },
      { status: 500 },
    );
  }
}
