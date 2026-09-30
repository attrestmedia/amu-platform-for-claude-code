export const REFERENCE_STRENGTH_OPTIONS = [
  {
    value: "light",
    label: { ko: "약하게 참조", en: "Light reference" },
    description: {
      ko: "분위기, 색감, 구도 아이디어만 가볍게 반영합니다.",
      en: "Lightly borrows mood, palette, and composition ideas.",
    },
    prompt: {
      reference: {
        default:
          "참고 이미지는 전체 분위기, 색감, 구도 아이디어만 약하게 참고하고 원본의 인물/제품/오브젝트 형태를 그대로 복제하지 않음",
        ecommerce:
          "참고 이미지는 제품 촬영 분위기, 배경 방향, 색감 아이디어만 약하게 참고하고 제품 형태/디자인을 그대로 복제하지 않음",
      },
      model:
        "모델 이미지는 인물의 전반적인 분위기, 스타일 방향, 인상만 약하게 참고하고 동일 인물로 고정하지 않음",
    },
  },
  {
    value: "medium",
    label: { ko: "중간 강도로 참고", en: "Balanced reference" },
    description: {
      ko: "구도, 질감, 주요 디테일을 반영하되 장면에 맞게 변형합니다.",
      en: "Uses composition, texture, and key details while adapting to the scene.",
    },
    prompt: {
      reference: {
        default:
          "참고 이미지는 구도, 색감, 질감, 주요 디테일을 균형 있게 참고하되 템플릿과 사용자 설명에 맞게 자연스럽게 변형",
        ecommerce:
          "참고 이미지는 제품의 주요 실루엣, 소재감, 라벨/로고 위치, 색상 방향을 중간 강도로 참고하되 장면과 배경은 템플릿에 맞게 조정",
      },
      model:
        "모델 이미지는 얼굴형, 체형, 헤어, 피부톤, 분위기를 중간 강도로 참고해 같은 계열의 인물 일관성을 유지",
    },
  },
  {
    value: "preserve",
    label: { ko: "원본 형태 보존", en: "Preserve original" },
    description: {
      ko: "인물 또는 제품의 형태, 실루엣, 핵심 디테일을 최대한 유지합니다.",
      en: "Preserves the person or product shape, silhouette, and key details.",
    },
    prompt: {
      reference: {
        default:
          "참고 이미지 속 원본의 인물 또는 제품/오브젝트 형태, 실루엣, 비율, 구조, 핵심 디테일을 최대한 동일하게 보존",
        ecommerce:
          "제품의 형태, 실루엣, 비율, 구조, 로고/라벨 위치, 소재 질감, 표면 마감, 색상, 패턴, 주요 디테일은 원본과 동일하게 유지",
      },
      model:
        "모델 이미지 속 인물의 얼굴, 체형, 헤어, 피부톤, 분위기, 정체성을 동일하고 일관된 인물로 최대한 보존",
    },
  },
] as const;

export type ReferenceStrengthType = (typeof REFERENCE_STRENGTH_OPTIONS)[number]["value"];
export type ReferenceHintVariantType = "default" | "ecommerce";
export type ReferencePromptKindType = "reference" | "model";

export const DEFAULT_REFERENCE_STRENGTH: ReferenceStrengthType = "medium";
export const DEFAULT_MODEL_REFERENCE_STRENGTH: ReferenceStrengthType = "preserve";

export function normalizeReferenceStrength(value: unknown): ReferenceStrengthType {
  return REFERENCE_STRENGTH_OPTIONS.some((item) => item.value === value)
    ? (value as ReferenceStrengthType)
    : DEFAULT_REFERENCE_STRENGTH;
}

export function getReferenceStrengthOption(value: unknown) {
  const normalized = normalizeReferenceStrength(value);
  return REFERENCE_STRENGTH_OPTIONS.find((item) => item.value === normalized) || REFERENCE_STRENGTH_OPTIONS[1];
}

export function getReferenceStrengthPrompt(
  value: unknown,
  kind: ReferencePromptKindType,
  variant: ReferenceHintVariantType = "default",
) {
  const option = getReferenceStrengthOption(value);
  if (kind === "model") return option.prompt.model;
  return option.prompt.reference[variant] || option.prompt.reference.default;
}
