export const PROMO_SLOT_DEFINITIONS = [
  {
    id: "home_hero",
    label: { ko: "홈 히어로", en: "Home hero" },
    placement: { ko: "WordPress 고정 서비스 히어로 캐러셀", en: "WordPress service hero carousel" },
    ratio: "3:2",
    layout: "hero",
  },
  {
    id: "home_after_featured",
    label: { ko: "홈 주요 글 다음", en: "After featured posts" },
    placement: { ko: "단독 와이드 또는 다중 카드", en: "Single wide band or multiple cards" },
    ratio: "3:1",
    layout: "wide",
  },
  {
    id: "home_footer_cta",
    label: { ko: "홈 하단 CTA", en: "Home footer CTA" },
    placement: { ko: "홈 콘텐츠를 마무리하는 와이드 밴드", en: "Wide closing band on the home page" },
    ratio: "3:1",
    layout: "wide",
  },
  {
    id: "article_inline",
    label: { ko: "기사 본문 중간", en: "Article inline" },
    placement: { ko: "두 번째 H2 앞의 문맥형 밴드", en: "Contextual band before the second H2" },
    ratio: "3:1",
    layout: "wide",
  },
  {
    id: "article_end",
    label: { ko: "기사 본문 끝", en: "Article end" },
    placement: { ko: "완독 직후 전환 밴드", en: "Conversion band after article completion" },
    ratio: "3:1",
    layout: "wide",
  },
  {
    id: "list_inline_3",
    label: { ko: "목록 인라인", en: "List inline" },
    placement: { ko: "세 번째 기사 카드 위치", en: "Third article-card position" },
    ratio: "4:3",
    layout: "card",
  },
  {
    id: "list_sidebar_sticky",
    label: { ko: "목록 사이드바", en: "List sidebar" },
    placement: { ko: "데스크톱 고정 세로 카드", en: "Desktop sticky portrait card" },
    ratio: "4:5",
    layout: "portrait",
  },
] as const;

export type PromoSlotId = (typeof PROMO_SLOT_DEFINITIONS)[number]["id"];
export type PromoStatus = "draft" | "review" | "active" | "paused" | "closed";
export type PromoAxis = "genstudio" | "tutors" | "play" | "branding";

export type PromoItem = {
  creativeId: string;
  campaignId: string;
  status: PromoStatus;
  axis: PromoAxis;
  variant: "A" | "B";
  slotIds: PromoSlotId[];
  targeting?: { includeCategories?: string[]; excludeCategories?: string[]; tags?: string[] };
  creative: {
    label?: string;
    headline: string;
    body: string;
    ctaLabel: string;
    landingUrl: string;
    imageUrl?: string;
    imageAssetId?: string;
    imageWidth?: number;
    imageHeight?: number;
    templateKey?: string;
  };
  period?: { startsAt?: string; endsAt?: string };
  review?: { level?: string; issues?: string[] };
};

export type PromoForm = {
  campaignId: string;
  axis: PromoAxis;
  variant: "A" | "B";
  slotIds: PromoSlotId[];
  label: string;
  headline: string;
  body: string;
  ctaLabel: string;
  landingUrl: string;
  imageUrl: string;
  imageAssetId: string;
  imageWidth: number;
  imageHeight: number;
  templateKey: string;
  includeCategories: string;
  excludeCategories: string;
  tags: string;
  startsAt: string;
  endsAt: string;
};

export function createEmptyPromoForm(slotId?: PromoSlotId): PromoForm {
  return {
    campaignId: "evergreen",
    axis: "genstudio",
    variant: "A",
    slotIds: slotId ? [slotId] : [],
    label: "",
    headline: "",
    body: "",
    ctaLabel: "",
    landingUrl: "",
    imageUrl: "",
    imageAssetId: "",
    imageWidth: 0,
    imageHeight: 0,
    templateKey: "",
    includeCategories: "",
    excludeCategories: "",
    tags: "",
    startsAt: "",
    endsAt: "",
  };
}

export function toLocalDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function toIsoDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function getPromoSlotDefinition(slotId?: string) {
  return PROMO_SLOT_DEFINITIONS.find((slot) => slot.id === slotId);
}

export function getPromoPreviewAspectClass(slotIds: readonly PromoSlotId[]) {
  const primary = getPromoSlotDefinition(slotIds[0]);
  if (primary?.layout === "portrait") return "aspect-[4/5] max-w-xs";
  if (primary?.layout === "card") return "aspect-[4/3] max-w-lg";
  if (primary?.layout === "hero") return "aspect-[3/2] max-w-2xl";
  return "aspect-[3/1] max-w-3xl";
}

export const PROMO_REVIEW_ISSUE_LABELS: Record<string, { ko: string; en: string }> = {
  campaign_id_required: { ko: "캠페인 ID가 필요합니다.", en: "Campaign ID is required." },
  axis_invalid: { ko: "서비스 축을 확인해 주세요.", en: "Check the service axis." },
  slot_required: { ko: "노출 슬롯을 하나 이상 선택해 주세요.", en: "Select at least one placement slot." },
  headline_required: { ko: "헤드라인이 필요합니다.", en: "Headline is required." },
  label_required: { ko: "소재 라벨이 필요합니다.", en: "Creative label is required." },
  cta_label_required: { ko: "CTA 문구가 필요합니다.", en: "CTA label is required." },
  app_landing_url_required: { ko: "허용된 앱 랜딩 URL이 필요합니다.", en: "An allowed app landing URL is required." },
  period_invalid: { ko: "종료 시각은 시작 시각보다 뒤여야 합니다.", en: "End time must be after start time." },
  image_host_not_allowed: { ko: "허용된 R2 이미지 호스트를 사용해 주세요.", en: "Use an allowed R2 image host." },
  image_orientation_conflict: { ko: "가로와 세로 슬롯은 이미지 소재를 나눠 등록해 주세요.", en: "Create separate image creatives for landscape and portrait slots." },
  image_asset_not_public: { ko: "Gen Studio 자산을 공개 상태로 바꾼 뒤 검수를 요청해 주세요.", en: "Make the Gen Studio asset public before requesting review." },
  image_asset_not_found: { ko: "업로드한 이미지 자산을 찾을 수 없습니다.", en: "The uploaded image asset could not be found." },
  image_asset_url_mismatch: { ko: "이미지 URL과 업로드 자산이 일치하지 않습니다.", en: "The image URL does not match the uploaded asset." },
};

export function getPromoFormWarnings(form: PromoForm) {
  const warnings: Array<{ ko: string; en: string }> = [];
  if (!form.slotIds.length) warnings.push(PROMO_REVIEW_ISSUE_LABELS.slot_required);
  if (!form.headline.trim()) warnings.push(PROMO_REVIEW_ISSUE_LABELS.headline_required);
  if (!form.label.trim()) warnings.push(PROMO_REVIEW_ISSUE_LABELS.label_required);
  if (!form.ctaLabel.trim()) warnings.push(PROMO_REVIEW_ISSUE_LABELS.cta_label_required);
  if (!form.landingUrl.trim()) warnings.push(PROMO_REVIEW_ISSUE_LABELS.app_landing_url_required);
  if (form.startsAt && form.endsAt && new Date(form.startsAt).getTime() >= new Date(form.endsAt).getTime()) {
    warnings.push(PROMO_REVIEW_ISSUE_LABELS.period_invalid);
  }

  const selectedLayouts = new Set(
    form.slotIds.map((slotId) => getPromoSlotDefinition(slotId)?.layout).filter(Boolean),
  );
  if (form.imageUrl && selectedLayouts.has("portrait") && selectedLayouts.size > 1) {
    warnings.push(PROMO_REVIEW_ISSUE_LABELS.image_orientation_conflict);
  } else if (form.imageUrl && selectedLayouts.size > 1) {
    warnings.push({
      ko: "비율이 다른 슬롯은 크롭 품질을 위해 소재를 나눠 등록하는 편이 좋습니다.",
      en: "For better crops, create separate creatives for slots with different aspect ratios.",
    });
  }
  return warnings;
}
