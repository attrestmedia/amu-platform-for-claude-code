import type { PromptItemType, PromptSearchFieldType } from "types/app";
import { getPromptFieldText } from "utils/app";
import { normalizeStudioTemplateSearchValue } from "utils/app/genStudioTemplateCatalog";

export const GEN_STUDIO_THEME_KEYS = ["commerce", "brand", "social", "lifestyle"] as const;

export type GenStudioThemeKey = (typeof GEN_STUDIO_THEME_KEYS)[number];

type GenStudioThemeSearchPreset = {
  query: string;
  terms: readonly string[];
};

export const GEN_STUDIO_THEME_SEARCH_PRESETS: Record<GenStudioThemeKey, GenStudioThemeSearchPreset> = {
  commerce: {
    query: "이커머스",
    terms: [
      "commerce",
      "ecommerce",
      "e-commerce",
      "커머스",
      "이커머스",
      "shopping",
      "shopping mall",
      "쇼핑",
      "쇼핑몰",
      "스토어",
      "smartstore",
      "스마트스토어",
      "product",
      "products",
      "제품",
      "상품",
      "상품컷",
      "제품컷",
      "제품 이미지",
      "상세컷",
      "상세페이지",
      "판매",
      "카탈로그",
      "catalog",
      "packshot",
      "pack shot",
      "product shot",
      "flatlay",
      "flat lay",
      "플랫레이",
      "누끼",
      "배경 합성",
      "고스트 마네킹",
      "ghost mannequin",
      "뷰티 제품",
      "화장품",
      "cosmetic",
      "food product",
    ],
  },
  brand: {
    query: "브랜드",
    terms: [
      "brand",
      "branding",
      "브랜드",
      "브랜딩",
      "identity",
      "아이덴티티",
      "visual identity",
      "키비주얼",
      "키 비주얼",
      "key visual",
      "campaign",
      "캠페인",
      "seasonal campaign",
      "시즌 캠페인",
      "launch",
      "론칭",
      "런칭",
      "heritage",
      "헤리티지",
      "editorial brand",
      "브랜드 화보",
      "브랜드 컷",
      "brand mood",
      "무드보드",
      "moodboard",
      "logo",
      "로고",
    ],
  },
  social: {
    query: "SNS",
    terms: [
      "sns",
      "social",
      "social media",
      "소셜",
      "소셜미디어",
      "instagram",
      "insta",
      "인스타",
      "인스타그램",
      "threads",
      "thread",
      "스레드",
      "youtube",
      "유튜브",
      "shorts",
      "쇼츠",
      "reels",
      "릴스",
      "tiktok",
      "틱톡",
      "carousel",
      "캐러셀",
      "카드뉴스",
      "뉴스룸",
      "ads",
      "광고",
      "광고 콘텐츠",
      "advertising",
      "promotion",
      "promo",
      "프로모션",
      "viral",
      "바이럴",
      "marketing",
      "마케팅",
    ],
  },
  lifestyle: {
    query: "라이프스타일",
    terms: [
      "lifestyle",
      "라이프스타일",
      "life style",
      "mood",
      "무드",
      "감성",
      "daily",
      "일상",
      "natural",
      "자연광",
      "editorial",
      "에디토리얼",
      "magazine",
      "매거진",
      "lookbook",
      "룩북",
      "portrait",
      "profile",
      "프로필",
      "인물",
      "인물 사진",
      "street",
      "스트릿",
      "outdoor",
      "아웃도어",
      "travel",
      "여행",
      "nature",
      "자연",
      "interior",
      "인테리어",
      "공간",
      "cinematic",
      "시네마틱",
      "documentary",
      "다큐멘터리",
      "lowkey",
      "로우키",
      "highkey",
      "하이키",
      "analog",
      "아날로그",
      "storybook",
      "스토리북",
      "character",
      "캐릭터",
      "illustration",
      "일러스트",
    ],
  },
};

export function isGenStudioThemeKey(value: string | null | undefined): value is GenStudioThemeKey {
  return GEN_STUDIO_THEME_KEYS.includes(value as GenStudioThemeKey);
}

export function getGenStudioThemePreset(value: string | null | undefined) {
  if (!isGenStudioThemeKey(value)) return null;
  return GEN_STUDIO_THEME_SEARCH_PRESETS[value];
}

export const normalizeStudioSearchValue = normalizeStudioTemplateSearchValue;

function compactStudioSearchValue(value: string) {
  return normalizeStudioSearchValue(value).replace(/\s+/g, "");
}

// 테마 분류용 상수
const THEME_MIN_SCORE = 4;
const THEME_SECONDARY_RATIO = 0.6;

export function getPromptItemThemeSearchText(item: PromptItemType, searchField: PromptSearchFieldType = "all") {
  if (searchField !== "all") {
    return normalizeStudioSearchValue(getPromptFieldText(item, searchField));
  }

  return normalizeStudioSearchValue(
    [
      getPromptFieldText(item, "key"),
      getPromptFieldText(item, "title"),
      getPromptFieldText(item, "categories"),
      getPromptFieldText(item, "tags"),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

// 테마 기반 분류 텍스트
function getPromptItemThemeSourceText(item: PromptItemType) {
  const categoryText = normalizeStudioSearchValue(getPromptFieldText(item, "categories"));
  const tagText = normalizeStudioSearchValue(getPromptFieldText(item, "tags"));

  // categories/tags가 비어 있는 레거시 데이터만 title로 보정
  const fallbackTitleText =
    categoryText || tagText ? "" : normalizeStudioSearchValue(getPromptFieldText(item, "title"));

  return {
    categoryText,
    tagText,
    fallbackTitleText,
  };
}

function containsNormalizedTerm(text: string, term: string) {
  const normalizedTerm = normalizeStudioSearchValue(term);
  if (!normalizedTerm) return false;

  const compactText = compactStudioSearchValue(text);
  const compactTerm = compactStudioSearchValue(normalizedTerm);

  if (compactTerm.length <= 2 && /^[a-z0-9]+$/.test(compactTerm)) {
    return text.split(" ").includes(compactTerm);
  }

  return text.includes(normalizedTerm) || compactText.includes(compactTerm);
}

export function matchesStudioSearchTerms(
  item: PromptItemType,
  terms: readonly string[],
  searchField: PromptSearchFieldType = "all",
) {
  const searchText = getPromptItemThemeSearchText(item, searchField);

  return terms.some((term) => {
    return containsNormalizedTerm(searchText, term);
  });
}

export function getStudioThemeMatchScore(item: PromptItemType, themeKey: GenStudioThemeKey) {
  const preset = GEN_STUDIO_THEME_SEARCH_PRESETS[themeKey];
  const { categoryText, tagText, fallbackTitleText } = getPromptItemThemeSourceText(item);

  return preset.terms.reduce((score, term) => {
    const inCategory = containsNormalizedTerm(categoryText, term);
    const inTag = containsNormalizedTerm(tagText, term);
    const inFallbackTitle = containsNormalizedTerm(fallbackTitleText, term);

    if (inCategory) return score + 4;
    if (inTag) return score + 2;
    if (inFallbackTitle) return score + 1;

    return score;
  }, 0);
}

// 멀티 테마 판정
export function getStudioMatchedThemes(item: PromptItemType) {
  const scoredThemes = GEN_STUDIO_THEME_KEYS.map((themeKey) => ({
    themeKey,
    score: getStudioThemeMatchScore(item, themeKey),
  }))
    .filter(({ score }) => score >= THEME_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const topScore = scoredThemes[0]?.score || 0;
  if (!topScore) return [];

  return scoredThemes.filter(({ score }, index) => {
    if (index === 0) return true;
    return score >= topScore * THEME_SECONDARY_RATIO;
  });
}

export function matchesStudioTheme(item: PromptItemType, themeKey: GenStudioThemeKey) {
  return getStudioMatchedThemes(item).some((matched) => matched.themeKey === themeKey);
}

export function matchesStudioQuery(item: PromptItemType, query: string, searchField: PromptSearchFieldType = "all") {
  const terms = normalizeStudioSearchValue(query).split(" ").filter(Boolean);
  if (!terms.length) return true;

  return terms.every((term) => matchesStudioSearchTerms(item, [term], searchField));
}
