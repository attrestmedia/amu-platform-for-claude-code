import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftSyncFromNaver } from "libs/server-utils/api/routeValidators";
import { syncNaverStorefrontProducts } from "libs/server-utils/commerce/naverStorefrontSyncService";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / sync-from-naver) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  네이버 상품 목록 조회  draft/storefront projection 동기화  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toBool(raw: unknown, fallback = false) {
  if (typeof raw === "boolean") return raw;
  const value = toSafeString(raw).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(value);
}

function toStringArray(raw: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(raw) ? raw : String(raw || "").split(","))
        .map((item) => toSafeString(item).toUpperCase())
        .filter(Boolean),
    ),
  );
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const summary = await syncNaverStorefrontProducts({
        universeId,
        actor: String(user.ID || ""),
        pageSize: Number(data?.pageSize || 50),
        maxPages: Number(data?.maxPages || 3),
        pruneMissing: toBool(data?.pruneMissing, false),
        visibleStatusTypes: toStringArray(data?.visibleStatusTypes),
        visibleDisplayStatusTypes: toStringArray(data?.visibleDisplayStatusTypes),
        searchPayload:
          data?.searchPayload && typeof data.searchPayload === "object" && !Array.isArray(data.searchPayload)
            ? (data.searchPayload as Record<string, unknown>)
            : undefined,
      });

      logger.info("스마트스토어 원본 상품 storefront 동기화 완료", {
        userId: user.ID,
        universeId,
        synced: summary.synced,
        hidden: summary.hidden,
        failed: summary.failed,
      });

      return NextResponse.json({
        success: true,
        data: {
          summary,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 원본 상품 storefront 동기화 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "스마트스토어 상품 동기화 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCommerceDraftSyncFromNaver,
  "universe_commerce_drafts_sync_from_naver",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
