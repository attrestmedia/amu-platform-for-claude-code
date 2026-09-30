import "server-only";

import {
  createCommerceDraft,
  findCommerceDraftBySmartstoreRef,
  removeCommerceStorefrontProductBySmartstoreRef,
  removeCommerceStorefrontProductsMissingSmartstoreRefs,
  snapshotCommerceDraftRevision,
  updateCommerceDraft,
  upsertCommerceStorefrontProductFromDraft,
} from "libs/database/commerce";
import type { NaverCommerceApiClient } from "libs/api/thirdparty/naver/naverClient";
import { getNaverDraftConnector } from "libs/server-utils/commerce/naverDraftConnector";
import { mapNaverProductDetailToDraftWithCategory, resolveSmartstoreRegisteredAt } from "libs/server-utils/commerce/naverDraftImportService";
import { pickChannelProduct } from "libs/server-utils/commerce/naverUtils";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import { isUnknownRecord, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

type SyncProductResult = {
  draft: unknown | null;
  storefrontProduct: unknown | null;
  reusedDraft: boolean;
  channelProductNo?: number;
  originProductNo?: number;
  statusType: string;
  displayStatusType: string;
  action: "synced" | "hidden" | "skipped";
  message?: string;
};

type SyncStorefrontSummary = {
  requested: number;
  imported: number;
  synced: number;
  hidden: number;
  skipped: number;
  failed: number;
  pruned: number;
  reachedEnd: boolean;
  remoteChannelProductNos: number[];
  errors: Array<{ channelProductNo?: number; message: string }>;
};

const DEFAULT_VISIBLE_STATUS_TYPES = ["SALE"];
const DEFAULT_VISIBLE_DISPLAY_STATUS_TYPES = ["ON"];

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toFiniteNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : undefined;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = toSafeString(value).toLowerCase();
  if (!text) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(text);
}

function resolveNextSource(currentSource?: string) {
  const source = toSafeString(currentSource);
  if (!source || source === "manual") return "imported_from_naver";
  if (source === "generated_by_ai") return "mixed";
  return source;
}

function isRecord(value: unknown): value is UnknownRecord {
  return isUnknownRecord(value);
}

function pickArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];

  const directCandidates = [value.products, value.contents, value.items, value.elements, value.content];
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  const nestedCandidates = [value.data, value.result, value.body];
  for (const candidate of nestedCandidates) {
    const nested = pickArray(candidate);
    if (nested.length > 0) return nested;
  }

  return [];
}

function resolveChannelProductNo(product: UnknownRecord) {
  const channelProduct = pickChannelProduct(product) || product;
  const productChannelProductSummary = toUnknownRecord(product.channelProductSummary);
  const productChannelProduct = toUnknownRecord(product.channelProduct);
  return (
    toFiniteNumber(channelProduct.channelProductNo) ||
    toFiniteNumber(product.channelProductNo) ||
    toFiniteNumber(productChannelProductSummary.channelProductNo) ||
    toFiniteNumber(productChannelProduct.channelProductNo)
  );
}

function resolveOriginProductNo(product: UnknownRecord) {
  const channelProduct = pickChannelProduct(product) || product;
  const originProduct = toUnknownRecord(product.originProduct);
  return (
    toFiniteNumber(channelProduct.originProductNo) ||
    toFiniteNumber(product.originProductNo) ||
    toFiniteNumber(originProduct.originProductNo)
  );
}

function normalizeVisibleStatusTypes(raw: unknown) {
  const values = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const normalized = values.map((item) => toSafeString(item).toUpperCase()).filter(Boolean);
  return normalized.length > 0 ? normalized : DEFAULT_VISIBLE_STATUS_TYPES;
}

function normalizeVisibleDisplayStatusTypes(raw: unknown) {
  const values = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const normalized = values.map((item) => toSafeString(item).toUpperCase()).filter(Boolean);
  return normalized.length > 0 ? normalized : DEFAULT_VISIBLE_DISPLAY_STATUS_TYPES;
}

function isVisibleSmartstoreStatus(args: {
  statusType: string;
  displayStatusType: string;
  visibleStatusTypes: string[];
  visibleDisplayStatusTypes: string[];
}) {
  const displayStatus = toSafeString(args.displayStatusType).toUpperCase();
  const status = toSafeString(args.statusType).toUpperCase();
  if (displayStatus && !args.visibleDisplayStatusTypes.includes(displayStatus)) return false;
  if (status && !args.visibleStatusTypes.includes(status)) return false;
  return true;
}

function buildSearchPayload(args: {
  page: number;
  pageSize: number;
  searchPayload?: UnknownRecord;
}) {
  return {
    ...(isRecord(args.searchPayload) ? args.searchPayload : {}),
    page: args.page,
    size: args.pageSize,
  };
}

async function fetchProductDetail(args: {
  client: NaverCommerceApiClient;
  rawProduct: UnknownRecord;
  channelProductNo?: number;
}) {
  if (!args.channelProductNo) return args.rawProduct;

  try {
    const detail = await args.client.getProductDetail(args.channelProductNo);
    const rawOriginProduct = toUnknownRecord(args.rawProduct.originProduct);
    return isRecord(detail)
      ? {
          ...detail,
          channelProductNo: detail.channelProductNo || args.channelProductNo,
          originProductNo: detail.originProductNo || args.rawProduct.originProductNo || rawOriginProduct.originProductNo,
        }
      : detail;
  } catch (error: unknown) {
    logger.warn("스마트스토어 상품 상세 조회 실패, 목록 응답으로 동기화 시도", {
      channelProductNo: args.channelProductNo,
      message: error instanceof Error ? error.message : error,
    });
    return args.rawProduct;
  }
}

export async function syncNaverProductToStorefront(args: {
  client: NaverCommerceApiClient;
  universeId: string;
  actor: string;
  rawProduct: UnknownRecord;
  storeId?: string;
  visibleStatusTypes?: string[];
  visibleDisplayStatusTypes?: string[];
}): Promise<SyncProductResult> {
  const mapped = await mapNaverProductDetailToDraftWithCategory({ client: args.client, product: args.rawProduct });
  const channelProductNo = toFiniteNumber(mapped.smartstore.channelProductNo);
  const originProductNo = toFiniteNumber(mapped.smartstore.originProductNo);
  const statusType = toSafeString(mapped.smartstore.statusType);
  const displayStatusType = toSafeString(mapped.smartstore.channelProductDisplayStatusType);
  const visibleStatusTypes = args.visibleStatusTypes?.length ? args.visibleStatusTypes : DEFAULT_VISIBLE_STATUS_TYPES;
  const visibleDisplayStatusTypes = args.visibleDisplayStatusTypes?.length
    ? args.visibleDisplayStatusTypes
    : DEFAULT_VISIBLE_DISPLAY_STATUS_TYPES;

  if (!channelProductNo && !originProductNo) {
    return {
      draft: null,
      storefrontProduct: null,
      reusedDraft: false,
      statusType,
      displayStatusType,
      action: "skipped",
      message: "상품 번호를 확인하지 못했습니다.",
    };
  }

  const existingDraft = await findCommerceDraftBySmartstoreRef({
    universeId: args.universeId,
    channelProductNo,
    originProductNo,
  });

  // 등록일은 최초 확정 후 불변 — 이미 있으면 유지, 없으면 AMU 최초 등록 job → 최초 연동 시각 순으로 복원한다.
  const registeredAt = await resolveSmartstoreRegisteredAt({ existingDraft });

  const draft = existingDraft
    ? await updateCommerceDraft({
        draftId: String(existingDraft.draftId || ""),
        updatedBy: args.actor,
        patch: {
          status: "published",
          source: resolveNextSource(existingDraft.source),
          display: {
            ...(existingDraft.display || {}),
            ...(mapped.display || {}),
          },
          smartstore: {
            ...(existingDraft.smartstore || {}),
            ...(mapped.smartstore || {}),
            registeredAt,
            lastStorefrontSyncedAt: new Date().toISOString(),
          },
          review: {
            ...(existingDraft.review || {}),
            ...(mapped.review || {}),
          },
          publish: {
            ...(existingDraft.publish || {}),
            lastOperation: "sync",
            lastSyncAt: new Date(),
            lastPublishedBy: args.actor,
          },
        },
      })
    : await createCommerceDraft({
        universeId: args.universeId,
        source: "imported_from_naver",
        status: "published",
        createdBy: args.actor,
        display: mapped.display,
        smartstore: {
          ...mapped.smartstore,
          registeredAt,
          lastStorefrontSyncedAt: new Date().toISOString(),
        },
        review: mapped.review,
        publish: {
          lastOperation: "sync",
          lastSyncAt: new Date(),
          publishCount: 0,
          failureCount: 0,
          lastPublishedBy: args.actor,
        },
      });

  if (!draft) {
    return {
      draft: null,
      storefrontProduct: null,
      reusedDraft: Boolean(existingDraft?.draftId),
      channelProductNo,
      originProductNo,
      statusType,
      displayStatusType,
      action: "skipped",
      message: "draft 저장에 실패했습니다.",
    };
  }

  await snapshotCommerceDraftRevision({
    draftId: String(draft.draftId || ""),
    actor: args.actor,
    source: "storefront_sync",
    summary: "스마트스토어 원본 상품 storefront 동기화",
    patchMeta: {
      channelProductNo,
      originProductNo,
      statusType,
      displayStatusType,
    },
  });

  if (
    !isVisibleSmartstoreStatus({
      statusType,
      displayStatusType,
      visibleStatusTypes,
      visibleDisplayStatusTypes,
    })
  ) {
    await removeCommerceStorefrontProductBySmartstoreRef({
      universeId: args.universeId,
      channelProductNo,
      originProductNo,
    });

    return {
      draft,
      storefrontProduct: null,
      reusedDraft: Boolean(existingDraft?.draftId),
      channelProductNo,
      originProductNo,
      statusType,
      displayStatusType,
      action: "hidden",
      message: "스마트스토어 판매/전시 상태가 공개 노출 대상이 아닙니다.",
    };
  }

  const storefrontProduct = await upsertCommerceStorefrontProductFromDraft({
    draft: toUnknownRecord(draft),
    operation: "sync",
    publishedAt: new Date(),
    storeId: args.storeId,
  });

  return {
    draft,
    storefrontProduct,
    reusedDraft: Boolean(existingDraft?.draftId),
    channelProductNo,
    originProductNo,
    statusType,
    displayStatusType,
    action: storefrontProduct ? "synced" : "skipped",
    message: storefrontProduct ? undefined : "storefront projection 생성에 실패했습니다.",
  };
}

export async function syncNaverStorefrontProducts(args: {
  universeId: string;
  actor: string;
  pageSize?: number;
  maxPages?: number;
  pruneMissing?: boolean;
  visibleStatusTypes?: string[];
  visibleDisplayStatusTypes?: string[];
  searchPayload?: UnknownRecord;
}) {
  const pageSize = Math.max(1, Math.min(100, Number(args.pageSize || 50)));
  const maxPages = Math.max(1, Math.min(20, Number(args.maxPages || 3)));
  const pruneMissing = toBoolean(args.pruneMissing, false);
  const visibleStatusTypes = normalizeVisibleStatusTypes(args.visibleStatusTypes);
  const visibleDisplayStatusTypes = normalizeVisibleDisplayStatusTypes(args.visibleDisplayStatusTypes);
  const { client, storeId } = await getNaverDraftConnector(args.universeId);
  const summary: SyncStorefrontSummary = {
    requested: 0,
    imported: 0,
    synced: 0,
    hidden: 0,
    skipped: 0,
    failed: 0,
    pruned: 0,
    reachedEnd: false,
    remoteChannelProductNos: [],
    errors: [],
  };

  for (let page = 1; page <= maxPages; page += 1) {
    const searchResponse = await client.searchProducts(
      buildSearchPayload({
        page,
        pageSize,
        searchPayload: args.searchPayload,
      }),
    );
    const products = pickArray(searchResponse).filter(isRecord);
    summary.requested += products.length;
    if (products.length < pageSize) summary.reachedEnd = true;
    if (products.length === 0) break;

    for (const rawProduct of products) {
      const channelProductNo = resolveChannelProductNo(rawProduct);
      const originProductNo = resolveOriginProductNo(rawProduct);
      if (channelProductNo) summary.remoteChannelProductNos.push(channelProductNo);

      try {
        const detail = await fetchProductDetail({ client, rawProduct, channelProductNo });
        const result = await syncNaverProductToStorefront({
          client,
          universeId: args.universeId,
          actor: args.actor,
          rawProduct: isRecord(detail) ? detail : rawProduct,
          storeId,
          visibleStatusTypes,
          visibleDisplayStatusTypes,
        });

        if (result.draft) summary.imported += 1;
        if (result.action === "synced") summary.synced += 1;
        else if (result.action === "hidden") summary.hidden += 1;
        else summary.skipped += 1;
      } catch (error: unknown) {
        summary.failed += 1;
        summary.errors.push({
          channelProductNo: channelProductNo || originProductNo,
          message: error instanceof Error ? error.message : "상품 동기화 실패",
        });
      }
    }

    if (products.length < pageSize) break;
  }

  if (pruneMissing && summary.reachedEnd && summary.remoteChannelProductNos.length > 0 && summary.imported > 0) {
    const result = await removeCommerceStorefrontProductsMissingSmartstoreRefs({
      universeId: args.universeId,
      channelProductNos: summary.remoteChannelProductNos,
    });
    summary.pruned = Number(toUnknownRecord(result).deletedCount || 0);
  }

  invalidateUniverseDetailPromptCache(args.universeId);
  return summary;
}
