import { NextRequest, NextResponse } from "next/server";
import { listCommerceStorefrontProducts } from "libs/database/commerce";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { logger } from "utils/log";
import { toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { resolveUniverseWalletPolicyState } from "utils/payment";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / storefront-products) 기능 요청 처리
 * @process GET 요청 파싱  storefront projection 조회  공개 상품 목록 JSON 응답 반환
 * @domain commerce.storefront
 * @scope public-api
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function serializeProduct(row: UnknownRecord) {
  const productId = toSafeString(row.productId || row.id);
  const toIsoDate = (value: unknown) => {
    if (value == null) return undefined;
    const date = new Date(value as string | number | Date);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  };
  return {
    id: productId,
    productId,
    universeId: toSafeString(row.universeId),
    provider: row.provider || "naver",
    draftId: toSafeString(row.draftId),
    title: toSafeString(row.title),
    image: toSafeString(row.image),
    imageFit: row.imageFit === "cover" ? "cover" : "contain",
    itemType: row.itemType === "service" ? "service" : "product",
    priceType: row.priceType === "range" || row.priceType === "text" ? row.priceType : "fixed",
    price: row.price,
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    priceText: toSafeString(row.priceText),
    summary: toSafeString(row.summary),
    detail: toSafeString(row.detail),
    specs: toUnknownRecord(row.specs),
    url: toSafeString(row.url),
    category: toSafeString(row.category),
    inStock: row.inStock !== false,
    order: Number(row.order || row.displayOrder || 9999),
    displayOrder: Number(row.displayOrder || row.order || 9999),
    featured: Boolean(row.featured),
    images: Array.isArray(row.images) ? row.images : [],
    smartstore: toUnknownRecord(row.smartstore),
    source: toUnknownRecord(row.source),
    publishedAt: toIsoDate(row.publishedAt),
    syncedAt: toIsoDate(row.syncedAt),
    updatedAt: toIsoDate(row.updatedAt),
    createdAt: toIsoDate(row.createdAt),
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ universeId: string }> }) {
  return withApiTimeout(async () => {
    try {
      const { universeId } = await params;
      const safeUniverseId = toSafeString(universeId);
      if (!safeUniverseId) {
        return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
      }

      const universe = await ensureUniverseWalletLifecycle(safeUniverseId);
      if (!universe || universe.type !== "commerce") {
        return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
      }
      const policy = resolveUniverseWalletPolicyState(universe.wallet);
      if (!policy.publicAllowed) {
        return NextResponse.json(
          { success: false, message: policy.message, errorCode: "UNIVERSE_WALLET_SUSPENDED" },
          { status: 423 },
        );
      }

      const rows = await listCommerceStorefrontProducts(safeUniverseId);
      const products = (rows || []).map((row) => serializeProduct(toUnknownRecord(row)));

      return NextResponse.json({
        success: true,
        data: {
          products,
          totalCount: products.length,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("스토어 공개 상품 projection 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "스토어 상품 목록을 가져오는 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  }, 15000);
}
