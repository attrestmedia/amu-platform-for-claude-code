import { NextRequest, NextResponse } from "next/server";
import fetchClient from "libs/api/fetchClient";
import { wpApiUri } from "consts/env/runtime";
import { logger } from "utils/log";
import { extractApiErrorMessage, getResponseStatus } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / wp / tags) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain content.wp
 * @scope public_api
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // id 또는 include 파라미터 둘 중 하나라도 있어야 함
    const idParam = searchParams.get("id");
    const includeParam = searchParams.get("include");

    if (!idParam && !includeParam) {
      return NextResponse.json({ message: "태그 ID 또는 include 파라미터를 제공해 주세요." }, { status: 400 });
    }

    // include 파라미터가 있다면 이를 사용하여 한 번에 여러 태그 정보를 요청
    let apiUrl = "";
    if (includeParam) {
      apiUrl = `${wpApiUri()}/tags?include=${includeParam}`;
    } else {
      // 단일 태그 요청일 경우
      apiUrl = `${wpApiUri()}/tags/${idParam}`;
    }

    const response = await fetchClient.get(apiUrl, {
      timeout: 10000,
      credentials: "omit",
    });

    return NextResponse.json(response.data, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate",
      },
    });
  } catch (error) {
    const message = extractApiErrorMessage(error, "태그를 가져오는 데 실패했습니다.");
    logger.error("태그 가져오기 오류:", message);
    return NextResponse.json(
      { message },
      { status: getResponseStatus(error) || 500 },
    );
  }
}
