import { NextRequest, NextResponse } from "next/server";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { getUniverseDetail, upsertUniverseDetail } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { resolveUniverseWalletPolicyState } from "utils/payment";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / storefront-status) 기능 요청 처리
 * @process 공개 상태 조회  인증/권한 검증  스마트스토어 공개 설정 저장  JSON 응답 반환
 * @domain commerce.storefront
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toBool(raw: unknown, fallback = false) {
  if (typeof raw === "boolean") return raw;
  const value = toSafeString(raw).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "y", "on", "open"].includes(value);
}

async function resolveStorefrontStatus(universeId: string) {
  const safeUniverseId = toSafeString(universeId);
  if (!safeUniverseId) {
    return {
      universeId: "",
      isCommerceUniverse: false,
      credentialReady: false,
      storeId: "",
      storefrontOpen: false,
      isOpen: false,
    };
  }

  const [universeDocument, detail, credentialStatus] = await Promise.all([
    ensureUniverseWalletLifecycle(safeUniverseId),
    getUniverseDetail(safeUniverseId).catch(() => null),
    getCredentialStatus(safeUniverseId),
  ]);
  const universe = universeDocument?.toObject();
  const walletAccess = resolveUniverseWalletPolicyState(universe?.wallet);

  const storeId = toSafeString(credentialStatus.naver?.extras?.storeId);
  const credentialReady = Boolean(credentialStatus.naver?.exists && storeId);
  const storefrontOpen = Boolean(detail?.metadata?.smartStore?.storefrontOpen);
  const isCommerceUniverse = universe?.type === "commerce";

  return {
    universeId: safeUniverseId,
    isCommerceUniverse,
    credentialReady,
    storeId,
    storefrontOpen,
    isOpen: Boolean(isCommerceUniverse && credentialReady && storefrontOpen && walletAccess.publicAllowed),
    walletAccess: {
      accessState: walletAccess.accessState,
      publicAllowed: walletAccess.publicAllowed,
      closeReason: walletAccess.closeReason,
      message: walletAccess.message,
    },
    updatedAt: detail?.metadata?.smartStore?.updatedAt || "",
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ universeId: string }> }) {
  return withApiTimeout(async () => {
    try {
      const { universeId } = await params;
      const status = await resolveStorefrontStatus(universeId);
      return NextResponse.json({ success: true, data: status });
    } catch (error) {
      logger.error("스마트스토어 공개 상태 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "스마트스토어 공개 상태를 가져오는 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  }, 15000);
}

export const PATCH = withAuth(
  async (data, user, _request, context) => {
    return withApiTimeout(async () => {
      try {
        const { universeId } = context.params as { universeId: string };
        const safeUniverseId = toSafeString(universeId);
        if (!safeUniverseId) {
          return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
        }

        const currentStatus = await resolveStorefrontStatus(safeUniverseId);
        if (!currentStatus.isCommerceUniverse) {
          return NextResponse.json({ success: false, message: "commerce 유니버스만 스토어 공개 설정을 사용할 수 있습니다." }, { status: 400 });
        }

        const storefrontOpen = toBool(data?.storefrontOpen, false);
        if (storefrontOpen && !currentStatus.credentialReady) {
          return NextResponse.json(
            { success: false, message: "네이버 스마트스토어 자격증명과 storeId를 먼저 저장해야 공개할 수 있습니다." },
            { status: 400 },
          );
        }

        const detail = await getUniverseDetail(safeUniverseId);
        const metadata = {
          ...(detail?.metadata || {}),
          smartStore: {
            ...(detail?.metadata?.smartStore || {}),
            storefrontOpen,
            updatedAt: new Date().toISOString(),
          },
        };

        await upsertUniverseDetail(safeUniverseId, {
          settings: detail?.settings || {},
          metadata,
          products: detail?.products || [],
        });

        try {
          await redisCache.invalidateByTag(CacheKeyManager.universe.tag(safeUniverseId));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(safeUniverseId));
          invalidateUniverseDetailPromptCache(safeUniverseId);
        } catch (error) {
          logger.warn("스마트스토어 공개 상태 캐시 무효화 경고:", error);
        }

        const nextStatus = await resolveStorefrontStatus(safeUniverseId);
        logger.info("스마트스토어 공개 상태 업데이트 성공", {
          userId: user.ID,
          universeId: safeUniverseId,
          storefrontOpen,
          isOpen: nextStatus.isOpen,
        });

        return NextResponse.json({ success: true, data: nextStatus });
      } catch (error) {
        logger.error("스마트스토어 공개 상태 업데이트 실패:", error);
        return NextResponse.json(
          { success: false, message: toErrorMessage(error, "스마트스토어 공개 상태 저장 중 오류가 발생했습니다.") },
          { status: 500 },
        );
      }
    }, 15000);
  },
  (data) => {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "유효하지 않은 요청 데이터입니다." };
    }
    return { valid: true };
  },
  "universe_commerce_storefront_status_update",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
