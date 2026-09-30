import { Globe, Home, Image, Map, Star, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ForgeLocalizedText } from "./forgeGlossary";
import type { ForgeAudienceContext } from "./forgeAudienceModel";

/** 사이드바 내비 항목 */
export type ForgeNavItem = {
  id: string;
  label: ForgeLocalizedText;
  href: string;
  /** 라이브러리·대시보드 항목용 아이콘. 단계 항목은 번호 배지를 쓴다. */
  icon?: LucideIcon;
  /** CREATION FLOW 단계 번호(1~5). */
  step?: number;
};

/** 사이드바 섹션 */
export type ForgeNavSection = {
  id: string;
  /** 섹션 상단 라벨("CREATION FLOW", "MY LIBRARY"). */
  label?: string | ForgeLocalizedText;
  /** 섹션 아래 구분선 표시. */
  trailingDivider?: boolean;
  items: ForgeNavItem[];
};

/** CREATION FLOW 단계 항목 id (forgeStepStatus와 공유). */
export const FORGE_STEP_ITEM_IDS = [
  "step-character",
  "step-master-sheet",
  "step-sprite",
  "step-world",
  "step-map",
] as const;

export type ForgeStepItemId = (typeof FORGE_STEP_ITEM_IDS)[number];

/** 사이드바 내비 SSOT (layoutSpec.sidebar 전 항목). */
export const FORGE_NAV_SECTIONS: ForgeNavSection[] = [
  {
    id: "dashboard",
    trailingDivider: true,
    items: [{ id: "dashboard", label: { ko: "대시보드", en: "Dashboard" }, href: "/assets-studio", icon: Home }],
  },
  {
    id: "my-world",
    label: "MY WORLD",
    items: [{ id: "personal-universe", label: { ko: "내 세계", en: "My world" }, href: "/assets-studio/universe", icon: Globe }],
  },
  {
    id: "creation-flow",
    label: "CREATION FLOW",
    items: [
      { id: "step-character", step: 1, label: { ko: "캐릭터 등록", en: "Register character" }, href: "/assets-studio/character" },
      {
        id: "step-master-sheet",
        step: 2,
        label: { ko: "캐릭터 방향 시트", en: "Character direction sheet" },
        href: "/assets-studio/direction-sheet",
      },
      { id: "step-sprite", step: 3, label: { ko: "스프라이트 스튜디오", en: "Sprite studio" }, href: "/assets-studio/sprite" },
      { id: "step-world", step: 4, label: { ko: "월드 에셋·라이브러리", en: "World asset library" }, href: "/assets-studio/world" },
      { id: "step-map", step: 5, label: { ko: "맵 스튜디오", en: "Map studio" }, href: "/assets-studio/map" },
    ],
  },
  {
    id: "my-library",
    label: "MY LIBRARY",
    items: [
      { id: "library-characters", label: { ko: "내 캐릭터", en: "My characters" }, href: "/assets-studio/library/characters", icon: User },
      { id: "library-assets", label: { ko: "내 에셋", en: "My assets" }, href: "/assets-studio/library/assets", icon: Image },
      { id: "library-maps", label: { ko: "내 맵", en: "My maps" }, href: "/assets-studio/library/maps", icon: Map },
      { id: "library-favorites", label: { ko: "즐겨찾기", en: "Favorites" }, href: "/assets-studio/library/favorites", icon: Star },
    ],
  },
];

const OPERATOR_NAV_SECTION: ForgeNavSection = {
  id: "operator",
  label: { ko: "운영", en: "Operator" },
  items: [
    { id: "operator-reference", label: { ko: "레퍼런스 킷", en: "Reference kits" }, href: "/assets-studio/reference" },
    { id: "operator-review", label: { ko: "검수·적용", en: "Review & apply" }, href: "/assets-studio/review" },
  ],
};

/** Forge 화면의 audience에 따라 operator 전용 진입점만 확장한다. */
export function buildForgeNavSections(ctx: ForgeAudienceContext): ForgeNavSection[] {
  if (ctx.audience !== "operator") return FORGE_NAV_SECTIONS;
  return [...FORGE_NAV_SECTIONS, OPERATOR_NAV_SECTION];
}
