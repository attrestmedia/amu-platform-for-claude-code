import { NextRequest, NextResponse } from "next/server";
import { searchNeisSchools } from "libs/server-utils/thirdparty/neis";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / neis / schools) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  NEIS 학교검색 호출  JSON 응답 반환
 * @domain education.neis
 * @scope public_api
 */

export const revalidate = 0;

function safeText(value: unknown, limit = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = safeText(searchParams.get("search"), 80);
    const schoolType = safeText(searchParams.get("schoolType"), 40);
    const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit") || "10")));

    if (!search) {
      return NextResponse.json({ ok: false, error: "search_required" }, { status: 400 });
    }

    const items = await searchNeisSchools({ search, schoolType, limit });
    return NextResponse.json({ ok: true, data: { items } }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: toErrorMessage(error, "neis_school_search_failed"),
      },
      { status: 500 },
    );
  }
}
