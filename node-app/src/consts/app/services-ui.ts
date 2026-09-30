import type { PromptSearchFieldType, StudioImageSearchFieldType } from "types/app";

// ----- 생성형 서비스 UI -----
export const SEARCH_FIELD_OPTIONS: { value: PromptSearchFieldType; label: { ko: string; en: string } }[] = [
  { value: "all", label: { ko: "전체", en: "All" } },
  { value: "key", label: { ko: "key", en: "Key" } },
  { value: "title", label: { ko: "title", en: "Title" } },
  { value: "categories", label: { ko: "categories", en: "Categories" } },
  { value: "tags", label: { ko: "tags", en: "Tags" } },
];

export const STUDIO_IMAGE_SEARCH_FIELD_OPTIONS: {
  value: StudioImageSearchFieldType;
  label: { ko: string; en: string };
}[] = [
  { value: "all", label: { ko: "전체", en: "All" } },
  { value: "assetId", label: { ko: "assetId", en: "Asset ID" } },
  { value: "templateKey", label: { ko: "templateKey", en: "Template Key" } },
  { value: "prompt", label: { ko: "prompt", en: "Prompt" } },
];

// 홈 화면 최근 이미지 표시 제한
export const HOME_TEMPLATE_PREVIEW_IMG_LIMIT = 4;
