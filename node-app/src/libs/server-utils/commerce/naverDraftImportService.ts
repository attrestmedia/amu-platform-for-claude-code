import "server-only";

import type { NaverCommerceApiClient } from "libs/api/thirdparty/naver/naverClient";
import { findEarliestSuccessfulCreatePublishJob } from "libs/database/commerce";
import { mapNaverProductDetailToDraft } from "libs/server-utils/commerce/naverDraftImportMapper";
import type { UnknownRecord } from "utils/common/typeUtils";
import { isUnknownRecord, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

type MappedNaverDraft = ReturnType<typeof mapNaverProductDetailToDraft>;

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function isRecord(value: unknown): value is UnknownRecord {
  return isUnknownRecord(value);
}

/**
 * 상품의 실제 등록 시각을 복원한다. 우선순위:
 * 1. draft에 이미 저장된 smartstore.registeredAt (불변 값)
 * 2. publish job 이력에서 최초 성공한 create job (AMU로 실제 등록된 시점 백필)
 * 3. fallback — 최초 연동 시점
 * 반환된 값은 이후 갱신하지 않는다.
 */
export async function resolveSmartstoreRegisteredAt(args: {
  existingDraft?: UnknownRecord | null;
  fallback?: Date | string;
}): Promise<string> {
  const draft = isRecord(args.existingDraft) ? args.existingDraft : null;
  const existing = toSafeString(toUnknownRecord(draft?.smartstore).registeredAt);
  if (existing) return existing;

  const draftId = toSafeString(draft?.draftId);
  if (draftId) {
    try {
      const firstCreate = await findEarliestSuccessfulCreatePublishJob(draftId);
      const registeredAt = toSafeString(toUnknownRecord(firstCreate).completedAt || toUnknownRecord(firstCreate).createdAt);
      if (registeredAt) return registeredAt;
    } catch (error: unknown) {
      logger.warn("최초 등록 job 조회 실패, 연동 시각으로 등록일 설정", {
        draftId,
        message: error instanceof Error ? error.message : error,
      });
    }
  }

  const fallback = args.fallback ? new Date(args.fallback) : new Date();
  return (Number.isNaN(fallback.getTime()) ? new Date() : fallback).toISOString();
}

export async function resolveNaverCategoryName(args: {
  client: NaverCommerceApiClient;
  categoryId: unknown;
  categoryName?: unknown;
}) {
  const categoryId = toSafeString(args.categoryId);
  const categoryName = toSafeString(args.categoryName);
  if (!categoryId || categoryName) return categoryName;

  try {
    const category = await args.client.getCategory(categoryId);
    return toSafeString(category.name || category.wholeCategoryName);
  } catch (error: unknown) {
    logger.warn("스마트스토어 카테고리명 조회 실패, categoryId로 작업 계속", {
      categoryId,
      message: error instanceof Error ? error.message : error,
    });
    return "";
  }
}

export async function mapNaverProductDetailToDraftWithCategory(args: {
  client: NaverCommerceApiClient;
  product: UnknownRecord;
}): Promise<MappedNaverDraft> {
  const mapped = mapNaverProductDetailToDraft(args.product);
  const categoryId = toSafeString(mapped.smartstore.categoryId);
  const resolvedCategoryName = await resolveNaverCategoryName({
    client: args.client,
    categoryId,
    categoryName: mapped.smartstore.categoryName,
  });
  if (!resolvedCategoryName || resolvedCategoryName === mapped.smartstore.categoryName) return mapped;

  return {
    ...mapped,
    smartstore: {
      ...mapped.smartstore,
      categoryName: resolvedCategoryName,
      importedSnapshot: {
        ...mapped.smartstore.importedSnapshot,
        categoryName: resolvedCategoryName,
      },
    },
  };
}
