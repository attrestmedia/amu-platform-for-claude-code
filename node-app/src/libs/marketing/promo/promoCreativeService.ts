import "server-only";

import {
  createMarketingPromoCreative,
  createMarketingPromoCreativeId,
  deleteMarketingPromoCreative,
  getMarketingPromoCreative,
  listMarketingPromoCreatives,
  updateMarketingPromoCreative,
} from "libs/database/marketing";
import { getImageAssetByStorageUrl } from "libs/database/lab";
import { getUploadedMediaAsset } from "libs/server-utils/file/uploadedMediaStorage";
import {
  MARKETING_PROMO_AXES,
  MARKETING_PROMO_SLOTS,
  type IMarketingPromoCreative,
  type MarketingPromoAxis,
  type MarketingPromoSlot,
  type MarketingPromoStatus,
} from "models/marketing";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import {
  comparePromoTargetingSpecificity,
  getPromoUrlHostname,
  hasPromoSlotOrientationConflict,
  normalizePromoImageUrl,
  pickPromoServingSet,
} from "./promoCreativePolicy";

export const PROMO_REQUIRED_EXCLUDE_CATEGORIES = [
  "finance",
  "investment",
  "investing",
  "tax",
  "medical",
  "legal",
  "금융",
  "투자",
  "세무",
  "의료",
  "법률",
] as const;

const L3_PATTERN = /(무료|코인|가격|할인|환불|보상|저작권|상업적 사용|무제한|마음껏|출시 예정|개발 중)/;
const APP_HOST = "app.allmyuniverse.com";

function list(value: unknown, max = 30) {
  const values = Array.isArray(value) ? value : toSafeString(value).split(/[\n,]/);
  return Array.from(new Set(values.map((item) => toSafeString(item).toLowerCase()).filter(Boolean))).slice(0, max);
}

function optionalDate(value: unknown) {
  const text = toSafeString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function boundedNumber(value: unknown, min: number, max: number) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < min || number > max) return undefined;
  return Math.floor(number);
}

function resolveAllowedAppHosts() {
  const configured = toSafeString(process.env.SITE_DOMAIN).replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return new Set([APP_HOST, configured].filter(Boolean));
}

function normalizeLandingUrl(value: unknown) {
  const raw = toSafeString(value);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return "";
    if (!resolveAllowedAppHosts().has(url.hostname) && url.hostname !== "localhost") return "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) =>
      url.searchParams.delete(key),
    );
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * 소재 이미지 호스트 allowlist.
 *
 * landingUrl은 이미 앱 호스트로 제한하는데 imageUrl만 임의 https를 허용하고 있었다.
 * 이 이미지는 매거진 지면에 그대로 삽입되므로, 외부 호스트를 허용하면 독자 트래픽이
 * 그 호스트로 새고 사후에 이미지가 교체될 수 있다. 저장 계약(R2 단일 저장소)과도 어긋난다.
 */
function resolveAllowedImageHosts() {
  const configuredR2Host = getPromoUrlHostname(process.env.R2_PUBLIC_BASE_URL);
  const allowLocalhost = process.env.NODE_ENV !== "production";
  return new Set(["assets.allmyuniverse.com", configuredR2Host, allowLocalhost ? "localhost" : ""].filter(Boolean));
}

function normalizeImageUrl(value: unknown) {
  return normalizePromoImageUrl(value, {
    allowedHosts: resolveAllowedImageHosts(),
    allowHttpLocalhost: process.env.NODE_ENV !== "production",
  });
}

async function normalizePromoInput(inputRaw: unknown, actor: string, existing?: IMarketingPromoCreative | null) {
  const input = toUnknownRecord(inputRaw);
  const creativeRaw = toUnknownRecord(input.creative);
  const targetingRaw = toUnknownRecord(input.targeting);
  const periodRaw = toUnknownRecord(input.period);
  const campaignId = toSafeString(input.campaignId || existing?.campaignId || "evergreen").slice(0, 80);
  const axis = toSafeString(input.axis || existing?.axis || "genstudio") as MarketingPromoAxis;
  const variant = toSafeString(input.variant || existing?.variant || "A").toUpperCase() === "B" ? "B" : "A";
  const slotIds = list(input.slotIds || existing?.slotIds, 20).filter((slot): slot is MarketingPromoSlot =>
    (MARKETING_PROMO_SLOTS as readonly string[]).includes(slot),
  );
  const headline = toSafeString(creativeRaw.headline ?? existing?.creative.headline).slice(0, 24);
  const body = toSafeString(creativeRaw.body ?? existing?.creative.body).slice(0, 60);
  const ctaLabel = toSafeString(creativeRaw.ctaLabel ?? existing?.creative.ctaLabel).slice(0, 12);
  const landingUrl = normalizeLandingUrl(creativeRaw.landingUrl ?? existing?.creative.landingUrl);
  const imageUrl = toSafeString(creativeRaw.imageUrl ?? existing?.creative.imageUrl);
  const requestedImageAssetId = toSafeString(creativeRaw.imageAssetId).slice(0, 160);
  const requestedTemplateKey = toSafeString(creativeRaw.templateKey).slice(0, 160);
  const startsAt = optionalDate(periodRaw.startsAt ?? existing?.period.startsAt);
  const endsAt = optionalDate(periodRaw.endsAt ?? existing?.period.endsAt);
  const normalizedImageUrl = normalizeImageUrl(imageUrl);
  const storedImageAsset = normalizedImageUrl
    ? await getImageAssetByStorageUrl(normalizedImageUrl).catch(() => null)
    : null;
  const uploadedImageAsset = requestedImageAssetId
    ? await getUploadedMediaAsset({ assetId: requestedImageAssetId, scope: "universe", ownerId: toSafeString(input.universeId || existing?.universeId) }).catch(() => null)
    : null;
  const uploadedStorage = toUnknownRecord(uploadedImageAsset?.storage);
  const imageUrlUnchanged = normalizedImageUrl === toSafeString(existing?.creative.imageUrl);
  const imageAssetId = toSafeString(
    uploadedImageAsset?.assetId || storedImageAsset?.assetId || (imageUrlUnchanged ? existing?.creative.imageAssetId : ""),
  ).slice(0, 160);
  const imageWidth = boundedNumber(
    uploadedStorage.width ?? storedImageAsset?.storage?.width ?? creativeRaw.imageWidth ?? (imageUrlUnchanged ? existing?.creative.imageWidth : undefined),
    1,
    5000,
  );
  const imageHeight = boundedNumber(
    uploadedStorage.height ?? storedImageAsset?.storage?.height ?? creativeRaw.imageHeight ?? (imageUrlUnchanged ? existing?.creative.imageHeight : undefined),
    1,
    5000,
  );
  const resolvedTemplateKey = toSafeString(
    requestedTemplateKey || storedImageAsset?.templateKey || (imageUrlUnchanged ? existing?.creative.templateKey : ""),
  ).slice(0, 160);
  const label = toSafeString(creativeRaw.label ?? existing?.creative.label).slice(0, 30);
  const reviewLevel = L3_PATTERN.test(`${headline} ${body} ${ctaLabel}`) ? "L3" : "L2";
  const issues = [
    ...(!campaignId ? ["campaign_id_required"] : []),
    ...(!(MARKETING_PROMO_AXES as readonly string[]).includes(axis) ? ["axis_invalid"] : []),
    ...(!slotIds.length ? ["slot_required"] : []),
    ...(!headline ? ["headline_required"] : []),
    ...(!label ? ["label_required"] : []),
    ...(!ctaLabel ? ["cta_label_required"] : []),
    ...(!landingUrl ? ["app_landing_url_required"] : []),
    ...(startsAt && endsAt && startsAt.getTime() >= endsAt.getTime() ? ["period_invalid"] : []),
    ...(toSafeString(imageUrl) && !normalizedImageUrl ? ["image_host_not_allowed"] : []),
    ...(requestedImageAssetId && !uploadedImageAsset ? ["image_asset_not_found"] : []),
    ...(uploadedImageAsset && toSafeString(uploadedStorage.url) !== normalizedImageUrl ? ["image_asset_url_mismatch"] : []),
    ...(storedImageAsset && (storedImageAsset.state !== "active" || storedImageAsset.visibility !== "public")
      ? ["image_asset_not_public"]
      : []),
    ...(hasPromoSlotOrientationConflict(slotIds, Boolean(normalizedImageUrl)) ? ["image_orientation_conflict"] : []),
  ];
  const excludeCategories = Array.from(
    new Set([...PROMO_REQUIRED_EXCLUDE_CATEGORIES, ...list(targetingRaw.excludeCategories || existing?.targeting.excludeCategories)]),
  );

  return {
    creativeId: existing?.creativeId || createMarketingPromoCreativeId(),
    universeId: toSafeString(input.universeId || existing?.universeId),
    campaignId,
    status: existing?.status || "draft",
    axis: (MARKETING_PROMO_AXES as readonly string[]).includes(axis) ? axis : "genstudio",
    variant,
    slotIds,
    targeting: {
      includeCategories: list(targetingRaw.includeCategories || existing?.targeting.includeCategories),
      excludeCategories,
      tags: list(targetingRaw.tags || existing?.targeting.tags),
      templateKeys: list(targetingRaw.templateKeys || existing?.targeting.templateKeys),
    },
    creative: {
      headline,
      body,
      ctaLabel,
      landingUrl,
      imageAssetId,
      imageUrl: normalizedImageUrl,
      imageWidth,
      imageHeight,
      templateKey: resolvedTemplateKey,
      label,
    },
    period: {
      startsAt,
      endsAt,
    },
    review: {
      level: reviewLevel,
      issues,
      ...(existing?.review.requestedAt ? { requestedAt: existing.review.requestedAt } : {}),
      ...(existing?.review.approvedAt ? { approvedAt: existing.review.approvedAt } : {}),
      ...(existing?.review.approvedBy ? { approvedBy: existing.review.approvedBy } : {}),
    },
    createdBy: existing?.createdBy || actor,
    updatedBy: actor,
  } satisfies IMarketingPromoCreative;
}

export async function saveMarketingPromoCreative(args: {
  universeId: string;
  creativeId?: string;
  input: unknown;
  actor: string;
}) {
  const existing = args.creativeId
    ? await getMarketingPromoCreative(args.universeId, args.creativeId)
    : null;
  if (args.creativeId && !existing) return { ok: false as const, error: "promo_creative_not_found", status: 404 };
  if (existing && !["draft", "review", "paused"].includes(existing.status)) {
    return { ok: false as const, error: "promo_creative_not_editable", status: 409 };
  }
  const normalized = await normalizePromoInput(
    { ...toUnknownRecord(args.input), universeId: args.universeId },
    args.actor,
    existing as IMarketingPromoCreative | null,
  );
  const saved = existing
    ? await updateMarketingPromoCreative({
        universeId: args.universeId,
        creativeId: existing.creativeId,
        set: {
          ...normalized,
          status: "draft",
          review: { ...normalized.review, requestedAt: undefined, approvedAt: undefined, approvedBy: "" },
        },
        allowedStatuses: ["draft", "review", "paused"],
      })
    : await createMarketingPromoCreative(normalized);
  return { ok: true as const, data: saved, valid: normalized.review.issues.length === 0, issues: normalized.review.issues };
}

/**
 * 운영에서 쓰지 않는 소재를 원장에서 제거한다.
 *
 * active는 매거진에 노출 중이므로 삭제 대상이 아니다. 먼저 일시중지/종료로 내려
 * 노출을 끊고(그 전이가 WordPress 캐시를 퍼지한다) 삭제한다.
 * 이미지 자산은 여러 소재가 같은 assetId를 공유할 수 있으므로 함께 삭제하지 않는다.
 */
export const PROMO_DELETABLE_STATUSES: MarketingPromoStatus[] = ["draft", "review", "paused", "closed"];

export async function removeMarketingPromoCreative(args: {
  universeId: string;
  creativeId: string;
}) {
  const existing = await getMarketingPromoCreative(args.universeId, args.creativeId);
  if (!existing) return { ok: false as const, error: "promo_creative_not_found", status: 404 };
  if (!PROMO_DELETABLE_STATUSES.includes(existing.status)) {
    return { ok: false as const, error: "promo_creative_active_not_deletable", status: 409 };
  }
  const deleted = await deleteMarketingPromoCreative({
    universeId: args.universeId,
    creativeId: args.creativeId,
    allowedStatuses: PROMO_DELETABLE_STATUSES,
  });
  if (!deleted) return { ok: false as const, error: "promo_creative_active_not_deletable", status: 409 };
  return { ok: true as const, data: { creativeId: args.creativeId } };
}

export async function transitionMarketingPromoCreative(args: {
  universeId: string;
  creativeId: string;
  nextStatus: MarketingPromoStatus;
  actor: string;
  allowActivation: boolean;
}) {
  const existing = await getMarketingPromoCreative(args.universeId, args.creativeId);
  if (!existing) return { ok: false as const, error: "promo_creative_not_found", status: 404 };
  const allowed: Record<MarketingPromoStatus, MarketingPromoStatus[]> = {
    draft: ["review", "paused", "closed"],
    review: ["draft", "active", "paused", "closed"],
    active: ["paused", "closed"],
    paused: ["draft", "review", "active", "closed"],
    closed: [],
  };
  if (!allowed[existing.status].includes(args.nextStatus)) {
    return { ok: false as const, error: "promo_status_transition_invalid", status: 409 };
  }
  if (args.nextStatus === "active" && !args.allowActivation) {
    return { ok: false as const, error: "human_activation_required", status: 403 };
  }
  if ((args.nextStatus === "review" || args.nextStatus === "active") && existing.review.issues.length) {
    return { ok: false as const, error: "promo_validation_failed", status: 409, issues: existing.review.issues };
  }
  const now = new Date();
  const review = {
    ...existing.review,
    ...(args.nextStatus === "review" ? { requestedAt: now } : {}),
    ...(args.nextStatus === "active" ? { approvedAt: now, approvedBy: args.actor } : {}),
  };
  const data = await updateMarketingPromoCreative({
    universeId: args.universeId,
    creativeId: args.creativeId,
    set: { status: args.nextStatus, review, updatedBy: args.actor },
    allowedStatuses: [existing.status],
  });
  return { ok: true as const, data };
}

function intersects(target: string[], values: string[]) {
  const valueSet = new Set(values.map((value) => value.toLowerCase()));
  return target.some((value) => valueSet.has(value.toLowerCase()));
}

function categoryMatches(target: string[], values: string[]) {
  return target.some((rawTarget) => {
    const expected = rawTarget.toLowerCase();
    return values.some((rawValue) => {
      const value = rawValue.toLowerCase();
      if (value === expected || value.startsWith(`${expected}-`) || value.endsWith(`-${expected}`)) return true;
      return /[가-힣]/u.test(expected) && value.includes(expected);
    });
  });
}

function isPromoEligible(item: IMarketingPromoCreative, context: PromoServingContext, now: Date) {
  if (item.status !== "active" || !item.slotIds.includes(context.slotId)) return false;
  if (item.period.startsAt && new Date(item.period.startsAt).getTime() > now.getTime()) return false;
  if (item.period.endsAt && new Date(item.period.endsAt).getTime() < now.getTime()) return false;
  if (categoryMatches(item.targeting.excludeCategories, context.categories)) return false;
  if (item.targeting.includeCategories.length && !intersects(item.targeting.includeCategories, context.categories)) return false;
  if (item.targeting.tags.length && !intersects(item.targeting.tags, context.tags)) return false;
  if (item.targeting.templateKeys.length && !item.targeting.templateKeys.includes(context.templateKey.toLowerCase())) return false;
  return true;
}

export type PromoServingContext = {
  slotId: MarketingPromoSlot;
  postId: string;
  postSlug: string;
  categories: string[];
  tags: string[];
  templateKey: string;
};

function buildTrackedPromoUrl(item: IMarketingPromoCreative, context: PromoServingContext) {
  const url = new URL(item.creative.landingUrl);
  url.searchParams.set("utm_source", "magazine");
  url.searchParams.set("utm_medium", "promo_slot");
  url.searchParams.set("utm_campaign", item.campaignId || "evergreen");
  url.searchParams.set("utm_content", `${context.slotId}__${item.creativeId}`);
  url.searchParams.set("amu_cta_location", context.slotId);
  if (context.postId) url.searchParams.set("amu_post_id", context.postId);
  if (context.postSlug) url.searchParams.set("amu_post_slug", context.postSlug);
  if (item.creative.templateKey || context.templateKey) {
    url.searchParams.set("amu_template_key", item.creative.templateKey || context.templateKey);
  }
  return url.toString();
}

export async function getMarketingPromoSlots(args: {
  universeId: string;
  context: PromoServingContext;
  limit?: number;
}) {
  const candidates = await listMarketingPromoCreatives({
    universeId: args.universeId,
    statuses: ["active"],
    slotId: args.context.slotId,
    limit: 200,
  });
  const now = new Date();
  const limit = Math.max(1, Math.min(5, args.limit || 2));
  // repo가 updatedAt desc로 넘겨준 순서를 유지한 채 특이도만 앞으로 당긴다(안정 정렬).
  const ranked = (candidates as IMarketingPromoCreative[])
    .filter((item) => isPromoEligible(item, args.context, now))
    .sort(comparePromoTargetingSpecificity);

  return pickPromoServingSet(ranked, args.context.slotId, limit)
    .map((item) => ({
      slotId: args.context.slotId,
      creativeId: item.creativeId,
      campaignId: item.campaignId,
      variant: item.variant,
      axis: item.axis,
      headline: item.creative.headline,
      body: item.creative.body,
      ctaLabel: item.creative.ctaLabel,
      ctaUrl: buildTrackedPromoUrl(item as IMarketingPromoCreative, args.context),
      // 저장 전 검수 이전에 활성화된 레거시 데이터도 외부 이미지 요청을 만들지 않도록 응답 직전에 재검증한다.
      imageUrl: normalizeImageUrl(item.creative.imageUrl),
      imageWidth: item.creative.imageWidth || 0,
      imageHeight: item.creative.imageHeight || 0,
      templateKey: item.creative.templateKey || "",
      label: item.creative.label || "",
      reviewLevel: item.review.level,
    }));
}
