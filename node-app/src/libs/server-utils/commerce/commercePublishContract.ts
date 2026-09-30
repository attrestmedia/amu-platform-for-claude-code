import type { UnknownRecord } from "utils/common/typeUtils";

export type CommercePublishMode = "create" | "update";

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toFiniteNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function pickProductPart(product: UnknownRecord, key: "channelProduct" | "originProduct") {
  const nestedProduct = toRecord(product.product);
  return toRecord(product[key] || nestedProduct[key]);
}

function pickImages(product: UnknownRecord) {
  const images = product.images;
  if (Array.isArray(images)) {
    return images
      .map((item) => {
        const image = toRecord(item);
        return toSafeString(firstValue(image.url, image.imageUrl, typeof item === "string" ? item : undefined));
      })
      .filter(Boolean);
  }

  const imageObject = toRecord(images);
  return [imageObject.representativeImage, ...(Array.isArray(imageObject.optionalImages) ? imageObject.optionalImages : [])]
    .map((item) => {
      const image = toRecord(item);
      return toSafeString(firstValue(image.url, image.imageUrl, typeof item === "string" ? item : undefined));
    })
    .filter(Boolean);
}

function normaliseComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normaliseComparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as UnknownRecord)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normaliseComparable(item)]),
    );
  }
  return value;
}

function comparableEqual(left: unknown, right: unknown) {
  return JSON.stringify(normaliseComparable(left)) === JSON.stringify(normaliseComparable(right));
}

function canonicalisePublishSnapshot(snapshot: UnknownRecord, mode: CommercePublishMode) {
  const channelProduct = pickProductPart(snapshot, "channelProduct");
  const originProduct = pickProductPart(snapshot, "originProduct");
  const channelSale = toRecord(channelProduct.sale);
  const channelDetail = toRecord(channelProduct.detailAttribute);
  const originDetail = toRecord(originProduct.detailAttribute);
  const channelNotice = toRecord(channelProduct.productInfoProvidedNotice || channelProduct.notice);
  const originNotice = toRecord(
    originDetail.productInfoProvidedNotice || originProduct.productInfoProvidedNotice || originProduct.notice,
  );

  const canonical = {
    channelProductNo: toFiniteNumber(firstValue(channelProduct.channelProductNo, snapshot.channelProductNo)),
    originProductNo: toFiniteNumber(firstValue(channelProduct.originProductNo, originProduct.originProductNo, snapshot.originProductNo)),
    channelProductName: toSafeString(
      firstValue(channelProduct.channelProductName, channelProduct.productName, channelProduct.name),
    ),
    salePrice: toFiniteNumber(firstValue(channelProduct.salePrice, channelSale.salePrice, originProduct.salePrice)),
    stockQuantity: toFiniteNumber(firstValue(channelProduct.stockQuantity, originProduct.stockQuantity)),
    statusType: toSafeString(firstValue(channelProduct.statusType, originProduct.statusType, snapshot.statusType)),
    detailContent: toSafeString(
      firstValue(
        channelProduct.detailContent,
        originProduct.detailContent,
        channelDetail.description,
        originDetail.description,
      ),
    ),
    images: pickImages(channelProduct).length > 0 ? pickImages(channelProduct) : pickImages(originProduct),
    productName: toSafeString(firstValue(originProduct.productName, originProduct.name)),
    categoryId: toSafeString(firstValue(originProduct.leafCategoryId, originProduct.categoryId, channelProduct.categoryId)),
    notice: normaliseComparable(channelNotice.payload || channelNotice.content || channelNotice || originNotice),
    originAreaInfo: normaliseComparable(
      firstValue(originProduct.originAreaInfo, originProduct.origin, channelProduct.originAreaInfo, channelProduct.origin),
    ),
    deliveryInfo: normaliseComparable(firstValue(originProduct.deliveryInfo, channelProduct.deliveryInfo)),
    sellerManagementCode: toSafeString(
      firstValue(channelProduct.sellerManagementCode, originProduct.sellerManagementCode, snapshot.sellerManagementCode),
    ),
  };

  if (mode === "create") return canonical;
  return canonical;
}

export function buildCommercePublishIdempotencyKey(args: {
  universeId: string;
  draftId: string;
  draftRevision: number;
  mode: CommercePublishMode;
}) {
  const revision = Math.max(0, Math.trunc(Number(args.draftRevision) || 0));
  return `smartstore:publish:v2:${toSafeString(args.universeId)}:${toSafeString(args.draftId)}:${revision}:${args.mode}`;
}

export function buildCommercePublishDiff(args: {
  before?: UnknownRecord | null;
  after?: UnknownRecord | null;
}) {
  const before = canonicalisePublishSnapshot(toRecord(args.before), "update");
  const after = canonicalisePublishSnapshot(toRecord(args.after), "update");
  const changedPaths = Object.keys(before).filter((key) => !comparableEqual(before[key as keyof typeof before], after[key as keyof typeof after]));
  return {
    changedPaths,
    before,
    after,
  };
}

export function compareCommercePublishReadback(args: {
  mode: CommercePublishMode;
  requestSnapshot: UnknownRecord;
  readback: UnknownRecord;
  targetRef?: UnknownRecord;
}) {
  const expected = canonicalisePublishSnapshot(args.requestSnapshot, args.mode);
  const actual = canonicalisePublishSnapshot(args.readback, args.mode);
  const mismatches: Array<{ field: string; expected: unknown; actual: unknown }> = [];

  const requiredFields = [
    "channelProductName",
    "salePrice",
    "stockQuantity",
    "statusType",
    "detailContent",
    "images",
    "productName",
    "categoryId",
    "notice",
    "originAreaInfo",
    "deliveryInfo",
  ] as const;

  for (const field of requiredFields) {
    const expectedValue = expected[field];
    if (expectedValue === undefined || expectedValue === "" || (Array.isArray(expectedValue) && expectedValue.length === 0)) continue;
    if (!comparableEqual(expectedValue, actual[field])) {
      mismatches.push({ field, expected: expectedValue, actual: actual[field] });
    }
  }

  const targetRef = toRecord(args.targetRef);
  for (const field of ["channelProductNo", "originProductNo"] as const) {
    const expectedValue = toFiniteNumber(firstValue(targetRef[field], expected[field]));
    if (expectedValue === undefined) continue;
    if (expectedValue !== actual[field]) mismatches.push({ field, expected: expectedValue, actual: actual[field] });
  }

  return {
    matched: mismatches.length === 0,
    mismatches,
    normalizedReadback: actual,
  };
}
