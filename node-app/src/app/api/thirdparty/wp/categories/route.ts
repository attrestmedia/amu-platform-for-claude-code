import { NextResponse } from "next/server";
import fetchClient from "libs/api/fetchClient";
import { wpApiUri } from "consts/env/runtime";
import { logger } from "utils/log";
import type { IWpCategory } from "types/thirdparty";
import { extractApiErrorMessage, getResponseStatus } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / wp / categories) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain content.wp
 * @scope public_api
 */

export async function GET() {
  try {
    // 한 페이지에 최대 100개 항목으로 설정
    const perPage = 100;
    let currentPage = 1;
    let totalPages = 1;
    let allCategories: IWpCategory[] = [];

    // 모든 페이지를 순회하며 카테고리 데이터를 누적
    do {
      const response = await fetchClient.get<IWpCategory[]>(`${wpApiUri()}/categories`, {
        params: {
          per_page: perPage,
          page: currentPage,
          _fields: "id,count,description,name,slug,taxonomy,parent,meta,link",
        },
        timeout: 10000,
        credentials: "omit",
      });

      // 첫 페이지 요청 시, 전체 페이지 수 추출
      if (currentPage === 1) {
        totalPages = parseInt(response.headers.get("x-wp-totalpages") || "1", 10);
      }

      allCategories = allCategories.concat(response.data);
      currentPage++;
    } while (currentPage <= totalPages);

    const totalItems = allCategories.length;

    const result = {
      totalItems,
      totalPages,
      data: allCategories,
    };

    return new NextResponse(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=60, stale-while-revalidate",
      },
    });
  } catch (error) {
    const message = extractApiErrorMessage(error, "카테고리를 가져오는 데 실패했습니다.");
    logger.error("카테고리 가져오기 오류:", message);
    return new NextResponse(
      JSON.stringify({ message }),
      { status: getResponseStatus(error) || 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
