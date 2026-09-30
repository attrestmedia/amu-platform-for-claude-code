import { NextResponse } from "next/server";
import { NaverCommerceApiClient } from "libs/api/thirdparty/naver/naverClient";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / naver / notices) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  네이버 상품정보제공고시 조회  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe_api
 */

export const GET = withAuth(
  async (_data, user, request) => {
    if (!request) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    try {
      const { searchParams } = new URL(request.url);
      const universeId = searchParams.get("universeId") || request.headers.get("x-universe-id") || undefined;
      const categoryId = searchParams.get("categoryId") || undefined;
      const noticeType = searchParams.get("noticeType") || undefined;

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

      if (noticeType) {
        const response = await naverClient.getProductNoticeGroup(noticeType);
        logger.info("네이버 상품정보제공고시 단건 조회 성공", {
          userId: user.ID,
          universeId,
          noticeType,
        });
        return NextResponse.json({
          success: true,
          data: {
            noticeType,
            notice: response?.notice || response?.content || response?.data || response,
            raw: response,
            source: "naver",
          },
        });
      }

      const response = await naverClient.getProductNoticeGroups(categoryId);
      logger.info("네이버 상품정보제공고시 목록 조회 성공", {
        userId: user.ID,
        universeId,
        categoryId: categoryId || "",
      });

      return NextResponse.json({
        success: true,
        data: {
          categoryId,
          notices: response?.notices || response?.contents || response?.content || response?.data || [],
          raw: response,
          source: "naver",
        },
      });
    } catch (error) {
      logger.error("네이버 상품정보제공고시 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "상품정보제공고시 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "naver_commerce_notices",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
