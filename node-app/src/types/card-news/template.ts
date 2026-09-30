/**
 * @docHint
 * @purpose CardNews semantic content와 versioned preset의 공유 계약
 * @process layout intent → Template Resolver → validated CardDeck
 * @domain card-news
 * @scope shared
 */

import type {
  CardNewsAspectRatio,
  CardNewsBox,
  CardNewsFontFamily,
  CardNewsImageFit,
  CardNewsTextAlign,
  CardNewsTextOverflow,
  CardNewsTextVerticalAlign,
  CardNewsTextWordBreak,
  CardNewsTemplateReference,
} from "./cardDeck";

export const CARD_NEWS_TEMPLATE_CONTRACT_VERSION = 1 as const;
export const CARD_NEWS_BUILT_IN_TEMPLATE_ID = "amu-editorial" as const;
export const CARD_NEWS_BUILT_IN_TEMPLATE_LEGACY_VERSION = 1 as const;
export const CARD_NEWS_BUILT_IN_TEMPLATE_VERSION = 2 as const;

export type CardNewsTemplateCardRole = "cover" | "body" | "closing";
export type CardNewsTemplateTextSlotName = "eyebrow" | "headline" | "body" | "cta";

export type CardNewsTemplateTextStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  color: string;
  align: CardNewsTextAlign;
  verticalAlign: CardNewsTextVerticalAlign;
  maxLines: number;
  overflow: CardNewsTextOverflow;
  wordBreak: CardNewsTextWordBreak;
};

export type CardNewsTemplateTextSlot = {
  kind: "text";
  name: CardNewsTemplateTextSlotName;
  box: CardNewsBox;
  style: CardNewsTemplateTextStyle;
  required: boolean;
  maxCharacters: number;
};

export type CardNewsTemplateEvidenceSlot = {
  kind: "evidence";
  name: "evidence";
  box: CardNewsBox;
  fit: CardNewsImageFit;
  radius: number;
  required: boolean;
};

export type CardNewsTemplateSlot = CardNewsTemplateTextSlot | CardNewsTemplateEvidenceSlot;

export type CardNewsTemplateLayout = {
  backgroundColor: string;
  accentColor: string;
  accentBox?: CardNewsBox;
  slots: readonly CardNewsTemplateSlot[];
};

export type CardNewsTemplatePreset = {
  contractVersion: typeof CARD_NEWS_TEMPLATE_CONTRACT_VERSION;
  id: string;
  version: number;
  name: { ko: string; en: string };
  description: { ko: string; en: string };
  fontFamily: CardNewsFontFamily;
  supportedAspectRatios: readonly CardNewsAspectRatio[];
  layouts: Readonly<Record<CardNewsTemplateCardRole, CardNewsTemplateLayout>>;
  constraints: {
    minimumCards: number;
    maximumCards: number;
    minimumEvidenceCards: number;
  };
  defaultWatermark: {
    enabled: boolean;
    text: string;
    size: number;
    opacity: number;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
};

export type CardNewsSemanticEvidence = {
  assetId?: string;
  proxyUrl?: string;
  altText?: string;
  fit?: CardNewsImageFit;
  focalPoint?: { x: number; y: number };
};

export type CardNewsSemanticCard = {
  role: CardNewsTemplateCardRole;
  eyebrow?: string;
  headline: string;
  body?: string;
  cta?: string;
  evidence?: CardNewsSemanticEvidence;
  altText?: string;
};

export type CardNewsSemanticCardContent = {
  title: string;
  aspectRatio: CardNewsAspectRatio;
  template: CardNewsTemplateReference;
  cards: readonly CardNewsSemanticCard[];
};

export type CardNewsTemplateRegistryStatus = "active" | "inactive";
export type CardNewsTemplateRegistrySource = "builtin" | "database";

export type CardNewsTemplateRegistryEntry = {
  id: string;
  version: number;
  status: CardNewsTemplateRegistryStatus;
  source: CardNewsTemplateRegistrySource;
  preset: CardNewsTemplatePreset;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
};

export type CardNewsTemplateResolutionErrorCode =
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_VERSION_UNSUPPORTED"
  | "ASPECT_RATIO_UNSUPPORTED"
  | "CARD_COUNT_INVALID"
  | "CARD_ROLE_INVALID"
  | "SLOT_REQUIRED"
  | "SLOT_OVERFLOW"
  | "EVIDENCE_REQUIRED"
  | "EVIDENCE_REFERENCE_INVALID"
  | "INVALID_TEMPLATE_PRESET"
  | "INVALID_RESOLVED_CARD_DECK";

export class CardNewsTemplateResolutionError extends Error {
  readonly code: CardNewsTemplateResolutionErrorCode;
  readonly path?: string;

  constructor(code: CardNewsTemplateResolutionErrorCode, path?: string) {
    super(path ? `${code}:${path}` : code);
    this.name = "CardNewsTemplateResolutionError";
    this.code = code;
    this.path = path;
  }
}

export type CardNewsTemplateStarterInput = {
  evidence: CardNewsSemanticEvidence;
  title?: string;
  aspectRatio?: CardNewsAspectRatio;
  template?: CardNewsTemplateReference;
};

/**
 * 편집기에서 preset을 시작할 때 사용하는 5장 semantic fixture다.
 * 실제 기사 자동 생성은 이 계약을 소비하는 P6에서 담당하며, 여기서는 픽셀 좌표를 노출하지 않는다.
 */
export function createCardNewsTemplateStarter(input: CardNewsTemplateStarterInput): CardNewsSemanticCardContent {
  const template = input.template || {
    id: CARD_NEWS_BUILT_IN_TEMPLATE_ID,
    version: CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
  };
  return {
    title: input.title?.trim() || "AMU 카드뉴스",
    aspectRatio: input.aspectRatio || "4:5",
    template,
    cards: [
      {
        role: "cover",
        eyebrow: "AMU EDITORIAL",
        headline: "오늘의 핵심을 한눈에",
        body: "읽을 만한 내용을 짧고 선명하게 정리했습니다.",
        evidence: input.evidence,
        altText: input.evidence.altText || "카드뉴스 대표 이미지",
      },
      {
        role: "body",
        eyebrow: "01 · CONTEXT",
        headline: "왜 지금 이 이야기를 봐야 할까요?",
        body: "배경과 맥락을 한 장에 담아 다음 내용을 이해하기 쉽게 연결합니다.",
        altText: "카드뉴스 배경 설명",
      },
      {
        role: "body",
        eyebrow: "02 · POINT",
        headline: "핵심 포인트를 하나씩 살펴보세요",
        body: "한 카드에는 하나의 메시지만 남겨 읽는 흐름을 가볍게 만듭니다.",
        altText: "카드뉴스 핵심 포인트",
      },
      {
        role: "body",
        eyebrow: "03 · TAKEAWAY",
        headline: "읽고 나서 기억할 한 문장",
        body: "문장과 여백을 분리해 저장하고 싶은 결론을 강조합니다.",
        cta: "자세한 내용은 원문에서 확인하세요",
        altText: "카드뉴스 요약",
      },
      {
        role: "closing",
        eyebrow: "AMU MAGAZINE",
        headline: "다음 이야기에서도 만나요",
        body: "좋은 맥락을 꾸준히 전합니다.",
        cta: "저장하고 다시 읽어보세요",
        altText: "카드뉴스 마무리",
      },
    ],
  };
}
