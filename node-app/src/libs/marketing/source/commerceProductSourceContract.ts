import crypto from "crypto";
import { buildCommerceProductSourcePacket } from "libs/server-utils/commerce/commerceProductContentContract";
import { withMarketingSourceEvidence } from "libs/marketing/source/sourceEvidence";
import type { UnknownRecord } from "utils/common/typeUtils";

export const COMMERCE_PRODUCT_SOURCE_KIND = "commerce_product" as const;
export const COMMERCE_PRODUCT_SOURCE_VERSION = 2 as const;
export const COMMERCE_PRODUCT_SOURCE_SNAPSHOT_MAX_BYTES = 64 * 1024;

export type CommerceProductSourceImageLineage = {
  assetId?: string;
  url?: string;
  role: string;
  sortOrder: number;
  origin: string;
  accessibility: "asset_ref" | "url_syntax_checked";
};

export type CommerceProductSourcePromotionAsset = {
  assetId: string;
  assetType: "content" | "image";
  origin: "gen_studio";
  role: "social_copy" | "social_image";
  templateKey?: string;
};

export type CommerceProductSourcePromotion = {
  pipelineVersion: 1;
  entryPoint: "store_product_promote";
  assets: CommerceProductSourcePromotionAsset[];
  contentAssetIds: string[];
  imageAssetIds: string[];
};

export type CommerceProductSourceInput = {
  universeId: string;
  draftId: string;
  draftRevision: number;
  channelProductNo: number;
  canonicalUrl: string;
  title: string;
  summary: string;
  contentText: string;
  imageAssetIds: string[];
  imageUrls: string[];
  allowedClaims: string[];
  productFacts: UnknownRecord;
  campaignId: string;
  sourceId?: string;
  storeManagerUrl?: string;
  publishedAt?: string;
  imageLineage?: CommerceProductSourceImageLineage[];
  promotionAssets?: CommerceProductSourcePromotionAsset[];
};

export type CommerceProductSourceSnapshot = CommerceProductSourceInput & {
  sourceKind: typeof COMMERCE_PRODUCT_SOURCE_KIND;
  sourceVersion: typeof COMMERCE_PRODUCT_SOURCE_VERSION;
  slug: string;
  url: string;
  imageUrl: string;
  excerptText: string;
  categories: string[];
  tags: string[];
  snapshotHash: string;
  sourceFingerprint: string;
  contentAssetIds: string[];
  promotion: CommerceProductSourcePromotion;
};

export class CommerceProductSourceContractError extends Error {
  readonly errorCode = "commerce_product_source_invalid";
  readonly status = 422;
  readonly details: { fields: string[] };

  constructor(fields: string[]) {
    super("Commerce 상품 source snapshot 필수 계약을 만족하지 않습니다.");
    this.name = "CommerceProductSourceContractError";
    this.details = { fields };
  }
}

const SENSITIVE_KEY = /access[_ -]?token|token|secret|password|authorization|cookie|order|customer|email|phone|address|전화|주소|이메일|고객|주문|연락/i;
const EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;
const PHONE = /(?<!\d)(?:(?:\+?82|0)[ -.]?1[016789][ -.]?\d{3,4}[ -.]?\d{4})(?!\d)/g;
const URL_SECRET_QUERY = /^(?:access[_-]?token|api[_-]?key|key|secret|signature|sig|token)$/i;

function sanitizeText(value: unknown, max = 50000) {
  return String(value || "")
    .replace(EMAIL, "[redacted]")
    .replace(PHONE, "[redacted]")
    .trim()
    .slice(0, max);
}

function uniqueStrings(values: unknown, max = 24, maxLength = 500) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => sanitizeText(value, maxLength)).filter(Boolean)),
  ).slice(0, max);
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/i.test(url.protocol) || url.username || url.password) return false;
    for (const key of url.searchParams.keys()) {
      if (URL_SECRET_QUERY.test(key)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sanitizeFacts(value: unknown, depth = 0): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 5) return {};
  const output: UnknownRecord = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof raw === "string") {
      output[key] = sanitizeText(raw, 2000);
    } else if (Array.isArray(raw)) {
      output[key] = raw
        .slice(0, 24)
        .map((item) => (typeof item === "object" ? sanitizeFacts(item, depth + 1) : sanitizeText(item, 500)));
    } else if (raw && typeof raw === "object") {
      output[key] = sanitizeFacts(raw, depth + 1);
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      output[key] = raw;
    }
  }
  return output;
}

function requiredString(input: Record<string, unknown>, key: string, fields: string[]) {
  const value = sanitizeText(input[key], 50000);
  if (!value) fields.push(key);
  return value;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function buildImageLineage(input: Record<string, unknown>, imageAssetIds: string[], imageUrls: string[]) {
  const supplied = Array.isArray(input.imageLineage) ? input.imageLineage : [];
  const suppliedAssets = new Set<string>();
  const suppliedUrls = new Set<string>();
  const lineage: CommerceProductSourceImageLineage[] = [];
  supplied.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const record = item as Record<string, unknown>;
    const assetId = sanitizeText(record.assetId, 160);
    const url = sanitizeText(record.url, 2000);
    if (!assetId && !isSafeHttpUrl(url)) return;
    if (assetId) suppliedAssets.add(assetId);
    if (isSafeHttpUrl(url)) suppliedUrls.add(url);
    lineage.push({
      ...(assetId ? { assetId } : {}),
      ...(isSafeHttpUrl(url) ? { url } : {}),
      role: sanitizeText(record.role, 80) || (index === 0 ? "representative" : "detail"),
      sortOrder: Number(record.sortOrder) > 0 ? Number(record.sortOrder) : index + 1,
      origin: sanitizeText(record.origin, 80) || "store_product",
      accessibility: isSafeHttpUrl(url) ? "url_syntax_checked" : "asset_ref",
    });
  });
  imageAssetIds.forEach((assetId, index) => {
    if (suppliedAssets.has(assetId)) return;
    lineage.push({
      assetId,
      role: index === 0 ? "representative" : "detail",
      sortOrder: lineage.length + 1,
      origin: "store_product",
      accessibility: "asset_ref",
    });
  });
  imageUrls.forEach((url, index) => {
    if (suppliedUrls.has(url)) return;
    lineage.push({
      url,
      role: index === 0 ? "representative" : "detail",
      sortOrder: lineage.length + 1,
      origin: "store_product",
      accessibility: "url_syntax_checked",
    });
  });
  return lineage.slice(0, 32);
}

function buildPromotionAssets(value: unknown): CommerceProductSourcePromotionAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const record = item as Record<string, unknown>;
      const assetId = sanitizeText(record.assetId, 160);
      const assetType = record.assetType === "image" ? "image" : record.assetType === "content" ? "content" : "";
      const role = record.role === "social_image" ? "social_image" : record.role === "social_copy" ? "social_copy" : "";
      if (!assetId || !assetType || !role) return null;
      return {
        assetId,
        assetType,
        origin: "gen_studio" as const,
        role,
        ...(sanitizeText(record.templateKey, 200) ? { templateKey: sanitizeText(record.templateKey, 200) } : {}),
      };
    })
    .filter((item): item is CommerceProductSourcePromotionAsset => Boolean(item))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.assetId === item.assetId) === index)
    .slice(0, 16);
}

function stripHtml(value: unknown) {
  return sanitizeText(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), 50000);
}

export function buildCommerceProductSourceSnapshot(input: Record<string, unknown>): CommerceProductSourceSnapshot {
  const fields: string[] = [];
  const universeId = requiredString(input, "universeId", fields);
  const draftId = requiredString(input, "draftId", fields);
  const canonicalUrl = requiredString(input, "canonicalUrl", fields);
  const title = requiredString(input, "title", fields);
  const summary = requiredString(input, "summary", fields);
  const contentText = requiredString(input, "contentText", fields);
  const campaignId = requiredString(input, "campaignId", fields);
  const draftRevision = Number(input.draftRevision);
  const channelProductNo = Number(input.channelProductNo);
  const imageAssetIds = uniqueStrings(input.imageAssetIds, 24, 160);
  const promotionRecord = input.promotion && typeof input.promotion === "object" ? (input.promotion as Record<string, unknown>) : null;
  const promotionAssets = buildPromotionAssets(input.promotionAssets ?? promotionRecord?.assets);
  const promotionImageAssetIds = promotionAssets.filter((asset) => asset.assetType === "image").map((asset) => asset.assetId);
  const promotionContentAssetIds = promotionAssets.filter((asset) => asset.assetType === "content").map((asset) => asset.assetId);
  // Social promotion asset은 publish resolver가 우선 사용할 수 있도록 상품 이미지보다 먼저 보존한다.
  const allImageAssetIds = Array.from(new Set([...promotionImageAssetIds, ...imageAssetIds])).slice(0, 24);
  const imageUrls = uniqueStrings(input.imageUrls, 8, 2000).filter(isSafeHttpUrl);
  const allowedClaims = uniqueStrings(input.allowedClaims, 8, 240);
  const imageLineage = buildImageLineage(input, imageAssetIds, imageUrls);
  promotionAssets
    .filter((asset) => asset.assetType === "image" && !imageLineage.some((lineage) => lineage.assetId === asset.assetId))
    .forEach((asset) => {
      imageLineage.push({
        assetId: asset.assetId,
        role: asset.role,
        sortOrder: imageLineage.length + 1,
        origin: "gen_studio",
        accessibility: "asset_ref",
      });
    });

  if (!Number.isSafeInteger(draftRevision) || draftRevision < 1) fields.push("draftRevision");
  if (!Number.isSafeInteger(channelProductNo) || channelProductNo < 1) fields.push("channelProductNo");
  if (!isSafeHttpUrl(canonicalUrl)) fields.push("canonicalUrl");
  if (!Array.isArray(input.imageAssetIds)) fields.push("imageAssetIds");
  if (!Array.isArray(input.imageUrls)) fields.push("imageUrls");
  if (!allImageAssetIds.length && !imageUrls.length) fields.push("imageAssetIds_or_imageUrls");
  if (!Array.isArray(input.allowedClaims) || !allowedClaims.length) fields.push("allowedClaims");
  if (!input.productFacts || typeof input.productFacts !== "object" || Array.isArray(input.productFacts)) {
    fields.push("productFacts");
  }
  if (!imageLineage.length) fields.push("imageLineage");
  if (fields.length) throw new CommerceProductSourceContractError(Array.from(new Set(fields)));

  const snapshotWithoutHash = {
    sourceKind: COMMERCE_PRODUCT_SOURCE_KIND,
    sourceVersion: COMMERCE_PRODUCT_SOURCE_VERSION,
    sourceId: sanitizeText(input.sourceId || `${universeId}:${draftId}:${draftRevision}`, 240),
    universeId,
    draftId,
    draftRevision,
    channelProductNo,
    canonicalUrl,
    url: canonicalUrl,
    slug: `commerce-${draftId}-${draftRevision}`.slice(0, 160),
    title,
    summary,
    excerptText: summary.slice(0, 1200),
    contentText,
    imageAssetIds: allImageAssetIds,
    imageUrls,
    imageUrl: imageUrls[0] || "",
    allowedClaims,
    productFacts: sanitizeFacts(input.productFacts),
    campaignId,
    categories: [COMMERCE_PRODUCT_SOURCE_KIND],
    tags: [COMMERCE_PRODUCT_SOURCE_KIND],
    ...(sanitizeText(input.storeManagerUrl, 500) ? { storeManagerUrl: sanitizeText(input.storeManagerUrl, 500) } : {}),
    ...(sanitizeText(input.publishedAt, 80) ? { publishedAt: sanitizeText(input.publishedAt, 80) } : {}),
    imageLineage,
    contentAssetIds: promotionContentAssetIds,
    promotion: {
      pipelineVersion: 1 as const,
      entryPoint: "store_product_promote" as const,
      assets: promotionAssets,
      contentAssetIds: promotionContentAssetIds,
      imageAssetIds: promotionImageAssetIds,
    },
  };
  const snapshotWithEvidence = withMarketingSourceEvidence(snapshotWithoutHash, {
    title,
    contentText,
    excerptText: summary,
    categories: [COMMERCE_PRODUCT_SOURCE_KIND],
    tags: [COMMERCE_PRODUCT_SOURCE_KIND],
  });
  const snapshotHash = sha256(snapshotWithEvidence);
  const sourceFingerprint = sha256({
    sourceKind: COMMERCE_PRODUCT_SOURCE_KIND,
    universeId,
    draftId,
    draftRevision,
    channelProductNo,
  });
  const snapshot = { ...snapshotWithEvidence, snapshotHash, sourceFingerprint } as CommerceProductSourceSnapshot;
  if (Buffer.byteLength(stableStringify(snapshot), "utf8") > COMMERCE_PRODUCT_SOURCE_SNAPSHOT_MAX_BYTES) {
    throw new CommerceProductSourceContractError(["snapshot_size_exceeded"]);
  }
  return snapshot;
}

export function buildCommerceProductSourceSnapshotFromDraft(input: {
  draft: unknown;
  storeId: string;
  campaignId: string;
  storeManagerUrl?: string;
  promotionAssets?: CommerceProductSourcePromotionAsset[];
}): CommerceProductSourceSnapshot {
  const draft = (input.draft && typeof input.draft === "object" ? input.draft : {}) as Record<string, unknown>;
  const smartstore = (draft.smartstore && typeof draft.smartstore === "object" ? draft.smartstore : {}) as Record<string, unknown>;
  const display = (draft.display && typeof draft.display === "object" ? draft.display : {}) as Record<string, unknown>;
  const assets = (draft.assets && typeof draft.assets === "object" ? draft.assets : {}) as Record<string, unknown>;
  const status = sanitizeText(draft.status, 40).toLowerCase();
  if (status !== "published") throw new CommerceProductSourceContractError(["draft.status_published"]);

  const draftId = requiredString(draft, "draftId", []);
  const universeId = requiredString(draft, "universeId", []);
  const draftRevision = Number(draft.revision || 1);
  const channelProductNo = Number(smartstore.channelProductNo);
  const title = sanitizeText(smartstore.channelProductName || smartstore.productName || display.title, 500);
  const summary = sanitizeText(display.summary || smartstore.summary || title, 2400);
  const contentText = stripHtml(display.detailHtml || display.detail || smartstore.detailContent || summary || title);
  const packet = buildCommerceProductSourcePacket(draft);
  const smartstoreImages = Array.isArray(smartstore.images) ? smartstore.images : [];
  const imageLineage = smartstoreImages
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const url = sanitizeText(row.url, 2000);
      const assetId = sanitizeText(row.assetId || row.imageAssetId, 160);
      return {
        ...(assetId ? { assetId } : {}),
        ...(isSafeHttpUrl(url) ? { url } : {}),
        role: sanitizeText(row.role || row.imageType, 80) || (index === 0 ? "representative" : "detail"),
        sortOrder: Number(row.sortOrder) > 0 ? Number(row.sortOrder) : index + 1,
        origin: sanitizeText(row.origin, 80) || "store_product",
        accessibility: isSafeHttpUrl(url) ? ("url_syntax_checked" as const) : ("asset_ref" as const),
      };
    })
    .filter((item) => item.assetId || item.url);
  const assetIds = uniqueStrings(
    [
      ...imageLineage.map((item) => item.assetId),
      ...(Array.isArray(assets.imageAssetIds) ? assets.imageAssetIds : []),
      assets.selectedRepresentativeImageAssetId,
    ],
    24,
    160,
  );
  const imageUrls = uniqueStrings(
    [...imageLineage.map((item) => item.url), ...packet.images.map((item) => item.url)],
    8,
    2000,
  ).filter(isSafeHttpUrl);
  const facts = {
    ...packet.productFacts,
    origin: packet.origin,
    logistics: packet.logistics,
    notice: packet.notice,
    factsHash: packet.factsHash,
    categoryName: sanitizeText(smartstore.categoryName, 240),
    brandName: sanitizeText((smartstore.facts as Record<string, unknown> | undefined)?.brandName, 240),
    manufacturerName: sanitizeText((smartstore.facts as Record<string, unknown> | undefined)?.manufacturerName, 240),
  };
  const allowedClaims = uniqueStrings(
    [
      title ? `상품명: ${title}` : "",
      packet.productFacts.salePrice ? `판매가: ${packet.productFacts.salePrice}` : "",
      packet.productFacts.stockQuantity ? `재고 수량: ${packet.productFacts.stockQuantity}` : "",
      packet.origin.originAreaName ? `원산지: ${packet.origin.originAreaName}` : "",
      packet.logistics.shippingPolicyText ? `배송 정책: ${packet.logistics.shippingPolicyText}` : "",
      packet.notice.productInfoProvidedNoticeType ? `상품 정보 고시: ${packet.notice.productInfoProvidedNoticeType}` : "",
    ],
    8,
    500,
  );
  const storeId = sanitizeText(input.storeId, 120);
  const canonicalUrl = storeId && channelProductNo > 0
    ? `https://smartstore.naver.com/${encodeURIComponent(storeId)}/products/${channelProductNo}`
    : "";

  return buildCommerceProductSourceSnapshot({
    sourceKind: COMMERCE_PRODUCT_SOURCE_KIND,
    universeId,
    draftId,
    draftRevision,
    channelProductNo,
    canonicalUrl,
    title,
    summary,
    contentText,
    imageAssetIds: assetIds,
    imageUrls,
    imageLineage,
    allowedClaims,
    productFacts: facts,
    campaignId: input.campaignId,
    storeManagerUrl: input.storeManagerUrl,
    publishedAt: sanitizeText(smartstore.registeredAt || draft.updatedAt, 80),
    promotionAssets: input.promotionAssets,
  });
}

export function buildCommerceProductSourceDedupeKey(args: {
  universeId: string;
  draftId: string;
  draftRevision: number;
  queueCategory: string;
  channelSet: string[];
}) {
  const normalizePart = (value: unknown) => sanitizeText(value, 120).toLowerCase().replace(/[^a-z0-9가-힣_-]+/gi, "_");
  const channels = Array.from(new Set(args.channelSet.map(normalizePart).filter(Boolean))).sort().join(",") || "none";
  return [
    COMMERCE_PRODUCT_SOURCE_KIND,
    normalizePart(args.universeId),
    normalizePart(args.draftId),
    Math.max(1, Math.floor(Number(args.draftRevision) || 1)),
    normalizePart(args.queueCategory),
    channels,
  ].join(":");
}
