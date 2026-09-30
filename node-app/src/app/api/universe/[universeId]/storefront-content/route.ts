import { NextResponse } from "next/server";
import { getUniverseDetail, upsertUniverseDetail } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / storefront-content) 기능 요청 처리
 * @process 인증/권한 검증  공개 스토어 화면 카피 저장  캐시 무효화  JSON 응답 반환
 * @domain commerce.storefront
 * @scope universe
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergePlainObject(base: Record<string, unknown>, patch: Record<string, unknown>) {
  const next = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergePlainObject(next[key], value);
      return;
    }
    next[key] = value;
  });
  return next;
}

export const PATCH = withAuth(
  async (data, user, _request, context) => {
    return withApiTimeout(async () => {
      try {
        const { universeId } = context.params as { universeId: string };
        const detail = await getUniverseDetail(universeId);
        const patch = isPlainObject(data?.storefrontContent) ? data.storefrontContent : {};
        const metadata = {
          ...(detail?.metadata || {}),
          storefrontContent: mergePlainObject((detail?.metadata?.storefrontContent || {}) as Record<string, unknown>, patch),
        };

        const nextDetail = await upsertUniverseDetail(universeId, {
          settings: detail?.settings || {},
          products: detail?.products || [],
          metadata,
        });

        try {
          await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId));
          invalidateUniverseDetailPromptCache(universeId);
        } catch (error) {
          logger.warn("storefrontContent 캐시 무효화 경고:", error);
        }

        logger.info("storefrontContent 저장 성공", { userId: user.ID, universeId });

        return NextResponse.json({ success: true, data: nextDetail.metadata?.storefrontContent || {} });
      } catch (error) {
        logger.error("storefrontContent 저장 실패:", error);
        return NextResponse.json(
          { success: false, message: toErrorMessage(error, "스토어 미리보기 텍스트 저장 중 오류가 발생했습니다.") },
          { status: 500 },
        );
      }
    }, 15000);
  },
  (data) => {
    if (!isPlainObject(data) || !isPlainObject(data.storefrontContent)) {
      return { valid: false, error: "storefrontContent 객체가 필요합니다." };
    }
    return { valid: true };
  },
  "universe_storefront_content_update",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
