import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { CommerceStorefrontProductSchema, type ICommerceStorefrontProductDocument } from "models/commerce";

const STOREFRONT_COLLECTION = "commerce_storefront_products";

type StorefrontImage = {
  url: string;
  type: string;
  imageType: string;
  role: string;
  sortOrder: number;
  origin: string;
};

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toFiniteNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function toSafeDate(value?: Date | string | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function getCommerceStorefrontProductModel() {
  return await getModel<ICommerceStorefrontProductDocument>(
    MONGODB_AMU_URL,
    "CommerceStorefrontProduct",
    CommerceStorefrontProductSchema,
    STOREFRONT_COLLECTION,
  );
}

function normalizeImageList(rawImages: unknown): StorefrontImage[] {
  if (!Array.isArray(rawImages)) return [];
  return rawImages
    .map((image, index) => {
      if (!isRecord(image)) return null;
      const url = toSafeString(image.url || image.imageUrl);
      if (!url) return null;
      return {
        url,
        type: toSafeString(image.type || image.imageType || (index === 0 ? "REPRESENTATIVE" : "OPTIONAL")),
        imageType: toSafeString(image.imageType || image.type || (index === 0 ? "REPRESENTATIVE" : "OPTIONAL")),
        role: toSafeString(image.role || (index === 0 ? "representative" : "detail")),
        sortOrder: toFiniteNumber(image.sortOrder ?? image.order) ?? index + 1,
        origin: toSafeString(image.origin),
      };
    })
    .filter((image): image is StorefrontImage => Boolean(image))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function pickRepresentativeImage(images: StorefrontImage[]) {
  const representative =
    images.find((image) => toSafeString(image.role).toLowerCase() === "representative") || images[0];
  return toSafeString(representative?.url);
}

function buildSmartstoreProductUrl(args: { storeId?: string; channelProductNo?: number }) {
  const storeId = toSafeString(args.storeId);
  const channelProductNo = Number(args.channelProductNo);
  if (!storeId || !Number.isFinite(channelProductNo) || channelProductNo <= 0) return "";
  return `https://smartstore.naver.com/${encodeURIComponent(storeId)}/products/${channelProductNo}`;
}

function resolveProductId(draft: Record<string, unknown>) {
  const smartstore = (draft?.smartstore || {}) as Record<string, unknown>;
  const channelProductNo = toFiniteNumber(smartstore.channelProductNo);
  if (channelProductNo) return `naver_${channelProductNo}`;
  return `draft_${toSafeString(draft?.draftId)}`;
}

export function buildCommerceStorefrontProductFromDraft(args: {
  draft: Record<string, unknown>;
  operation?: "create" | "update" | "sync";
  jobId?: string;
  payloadHash?: string;
  publishedAt?: Date | string | null;
  storeId?: string;
}) {
  const draft = isRecord(args.draft) ? args.draft : {};
  const display = isRecord(draft.display) ? draft.display : {};
  const smartstore = isRecord(draft.smartstore) ? draft.smartstore : {};
  const importedSnapshot = isRecord(smartstore.importedSnapshot) ? smartstore.importedSnapshot : {};
  const images = normalizeImageList(smartstore.images);
  const channelProductNo = toFiniteNumber(smartstore.channelProductNo);
  const originProductNo = toFiniteNumber(smartstore.originProductNo);
  const salePrice = toFiniteNumber(smartstore.salePrice ?? display.price);
  const stockQuantity = toFiniteNumber(smartstore.stockQuantity) ?? 0;
  const statusType = toSafeString(smartstore.statusType);
  const channelProductDisplayStatusType = toSafeString(smartstore.channelProductDisplayStatusType);
  const displayOrder =
    toFiniteNumber(display.displayOrder ?? display.order ?? smartstore.displayOrder ?? smartstore.sortOrder) ?? 9999;

  return {
    productId: resolveProductId(draft),
    universeId: toSafeString(draft.universeId),
    provider: "naver" as const,
    draftId: toSafeString(draft.draftId),
    title: toSafeString(display.title || smartstore.channelProductName || smartstore.productName),
    image: toSafeString(display.image) || pickRepresentativeImage(images),
    imageFit: display.imageFit === "cover" ? "cover" : "contain",
    itemType: display.itemType === "service" ? "service" : "product",
    priceType: display.priceType === "range" || display.priceType === "text" ? display.priceType : "fixed",
    price: salePrice,
    priceMin: toFiniteNumber(display.priceMin),
    priceMax: toFiniteNumber(display.priceMax),
    priceText: toSafeString(display.priceText),
    summary: toSafeString(display.summary || smartstore.summary),
    detail: toSafeString(display.detail || display.detailHtml || smartstore.detailContent),
    specs: isRecord(display.specs) ? display.specs : {},
    url:
      toSafeString(display.url || smartstore.url) ||
      buildSmartstoreProductUrl({ storeId: args.storeId, channelProductNo }),
    category: toSafeString(
      display.category ||
        smartstore.categoryName ||
        importedSnapshot.categoryName ||
        smartstore.categoryId ||
        smartstore.categoryPolicyGroup,
    ),
    inStock: stockQuantity > 0 && (!statusType || statusType === "SALE"),
    order: displayOrder,
    displayOrder,
    featured: Boolean(display.featured || smartstore.featured),
    images,
    smartstore: {
      channelProductNo,
      originProductNo,
      sellerManagementCode: toSafeString(smartstore.sellerManagementCode),
      categoryId: toSafeString(smartstore.categoryId),
      categoryName: toSafeString(smartstore.categoryName || importedSnapshot.categoryName),
      statusType,
      channelProductDisplayStatusType,
    },
    source: {
      type: args.operation === "sync" ? "smartstore_sync" : "smartstore_publish",
      operation: args.operation || "",
      draftId: toSafeString(draft.draftId),
      jobId: toSafeString(args.jobId),
      payloadHash: toSafeString(args.payloadHash),
    },
    publishedAt: toSafeDate(args.publishedAt),
    syncedAt: args.operation === "sync" ? toSafeDate(args.publishedAt) : null,
  };
}

export async function upsertCommerceStorefrontProductFromDraft(args: {
  draft: Record<string, unknown>;
  operation?: "create" | "update" | "sync";
  jobId?: string;
  payloadHash?: string;
  publishedAt?: Date | string | null;
  storeId?: string;
}) {
  const model = await getCommerceStorefrontProductModel();
  const projection = buildCommerceStorefrontProductFromDraft(args);
  if (!projection.universeId || !projection.productId || !projection.draftId) return null;

  return await model
    .findOneAndUpdate(
      { universeId: projection.universeId, productId: projection.productId },
      { $set: projection },
      { upsert: true, new: true },
    )
    .lean();
}

export async function listCommerceStorefrontProducts(universeId: string) {
  const model = await getCommerceStorefrontProductModel();
  return await model
    .find({ universeId: toSafeString(universeId) })
    .sort({ displayOrder: 1, order: 1, updatedAt: -1 })
    .lean();
}

export async function removeCommerceStorefrontProductForDraft(draftId: string) {
  const model = await getCommerceStorefrontProductModel();
  return await model.deleteMany({ draftId: toSafeString(draftId) });
}

export async function removeCommerceStorefrontProductBySmartstoreRef(args: {
  universeId: string;
  channelProductNo?: number | string;
  originProductNo?: number | string;
}) {
  const model = await getCommerceStorefrontProductModel();
  const refs: Record<string, unknown>[] = [];
  const channelProductNo = toFiniteNumber(args.channelProductNo);
  const originProductNo = toFiniteNumber(args.originProductNo);

  if (channelProductNo) refs.push({ "smartstore.channelProductNo": channelProductNo });
  if (originProductNo) refs.push({ "smartstore.originProductNo": originProductNo });
  if (refs.length === 0) return { deletedCount: 0 };

  return await model.deleteMany({
    universeId: toSafeString(args.universeId),
    $or: refs,
  });
}

export async function removeCommerceStorefrontProductsMissingSmartstoreRefs(args: {
  universeId: string;
  channelProductNos: Array<number | string>;
}) {
  const model = await getCommerceStorefrontProductModel();
  const channelProductNos = Array.from(
    new Set(
      (args.channelProductNos || [])
        .map((item) => toFiniteNumber(item))
        .filter((item): item is number => Boolean(item)),
    ),
  );

  if (channelProductNos.length === 0) return { deletedCount: 0 };

  return await model.deleteMany({
    universeId: toSafeString(args.universeId),
    provider: "naver",
    "smartstore.channelProductNo": { $nin: channelProductNos },
  });
}
