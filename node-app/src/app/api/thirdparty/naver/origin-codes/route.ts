import { NextResponse } from "next/server";
import { NaverCommerceApiClient } from "libs/api/thirdparty/naver/naverClient";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / naver / origin-codes) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  네이버 원산지 코드 조회  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe_api
 */

function pickQuery(searchParams: URLSearchParams) {
  return Array.from(searchParams.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
    if (key === "universeId" || key === "mode") return acc;
    const trimmed = String(value || "").trim();
    if (!trimmed) return acc;
    acc[key] = trimmed;
    return acc;
  }, {});
}

export const GET = withAuth(
  async (_data, user, request) => {
    if (!request) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    try {
      const { searchParams } = new URL(request.url);
      const universeId = searchParams.get("universeId") || request.headers.get("x-universe-id") || undefined;
      const mode = (searchParams.get("mode") || "all").trim().toLowerCase();

      if (!universeId) {
        return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
      }

      const cred = await getDecryptedCredential(universeId, "naver");
      if (!cred || !cred.clientId || !cred.clientSecret) {
        return NextResponse.json(
          { success: false, message: "네이버 커머스 자격증명이 설정되어 있지 않습니다." },
          { status: 500 },
        );
      }

      const naverClient = new NaverCommerceApiClient({
        applicationId: cred.clientId,
        applicationSecret: cred.clientSecret,
        cacheScope: universeId,
      });

      const query = pickQuery(searchParams);
      const response =
        mode === "query"
          ? await naverClient.queryOriginAreas(query)
          : mode === "sub"
            ? await naverClient.getSubOriginAreas(query)
            : await naverClient.getAllOriginAreas();

      logger.info("네이버 원산지 코드 조회 성공", {
        userId: user.ID,
        universeId,
        mode,
      });

      return NextResponse.json({
        success: true,
        data: {
          mode,
          items: response?.items || response?.contents || response?.content || response?.data || [],
          raw: response,
          source: "naver",
        },
      });
    } catch (error) {
      logger.error("네이버 원산지 코드 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "원산지 코드 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "naver_commerce_origin_codes",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
