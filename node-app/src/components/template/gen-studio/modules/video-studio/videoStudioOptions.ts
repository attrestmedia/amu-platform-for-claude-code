import type { VideoGenerationModeType } from "types/ai";

export type LocalizedText = { ko: string; en: string };

export const VIDEO_PURPOSE_OPTIONS = [
  { value: "product", label: { ko: "상품 소개", en: "Product showcase" } },
  { value: "social", label: { ko: "SNS·광고", en: "Social & ads" } },
  { value: "story", label: { ko: "스토리·무드", en: "Story & mood" } },
  { value: "tutorial", label: { ko: "튜토리얼", en: "Tutorial" } },
] as const;

export const VIDEO_STYLE_OPTIONS = [
  { value: "cinematic", label: { ko: "시네마틱", en: "Cinematic" } },
  { value: "clean", label: { ko: "깔끔한 제품 영상", en: "Clean product" } },
  { value: "playful", label: { ko: "경쾌하고 발랄하게", en: "Playful" } },
  { value: "editorial", label: { ko: "에디토리얼", en: "Editorial" } },
] as const;

export const VIDEO_QUALITY_OPTIONS = [
  { value: "draft", label: { ko: "빠른 초안", en: "Fast draft" } },
  { value: "balanced", label: { ko: "균형 잡힌 결과", en: "Balanced" } },
  { value: "premium", label: { ko: "고품질", en: "High quality" } },
] as const;

export const VIDEO_MODE_OPTIONS: Array<{ value: VideoGenerationModeType; label: LocalizedText }> = [
  { value: "text-to-video", label: { ko: "텍스트로 영상 만들기", en: "Text to video" } },
  { value: "image-to-video", label: { ko: "이미지에 움직임 더하기", en: "Image to video" } },
  { value: "reference-to-video", label: { ko: "참고 이미지로 만들기", en: "Reference to video" } },
  { value: "edit", label: { ko: "기존 영상 편집", en: "Edit video" } },
  { value: "extend", label: { ko: "영상 이어 만들기", en: "Extend video" } },
];

