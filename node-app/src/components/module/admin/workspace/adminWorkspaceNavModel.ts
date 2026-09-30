import { Images, Map, type LucideIcon } from "lucide-react";

export type AdminWorkspaceLocalizedText = {
  ko: string;
  en: string;
};

export type AdminWorkspaceNavItem = {
  id: string;
  label: AdminWorkspaceLocalizedText;
  description?: AdminWorkspaceLocalizedText;
  href: string;
  icon?: LucideIcon;
  step?: number;
};

export type AdminWorkspaceNavSection = {
  id: string;
  label?: AdminWorkspaceLocalizedText;
  items: AdminWorkspaceNavItem[];
  trailingDivider?: boolean;
};

export const ADMIN_WORKSPACE_STEP_ITEM_IDS = [
  "step-entry",
  "step-target",
  "step-genesis",
  "step-sprite",
  "step-review",
] as const;

export type AdminWorkspaceStepItemId = (typeof ADMIN_WORKSPACE_STEP_ITEM_IDS)[number];

export const ADMIN_WORKSPACE_NAV_SECTIONS: AdminWorkspaceNavSection[] = [
  {
    id: "creation-flow",
    label: { ko: "제작 흐름", en: "Creation flow" },
    trailingDivider: true,
    items: [
      {
        id: "step-entry",
        step: 1,
        label: { ko: "Assets Studio", en: "Assets Studio" },
        description: { ko: "범위와 작업 시작", en: "Scope and start" },
        href: "/assets-studio",
      },
      {
        id: "step-target",
        step: 2,
        label: { ko: "캐릭터·모델 선택", en: "Choose character or model" },
        description: { ko: "제작 대상을 결정", en: "Choose what to create" },
        href: "/assets-studio/character",
      },
      {
        id: "step-genesis",
        step: 3,
        label: { ko: "이미지·페르소나", en: "Images and persona" },
        description: { ko: "기준 이미지와 레퍼런스", en: "Anchor and references" },
        href: "/assets-studio/genesis",
      },
      {
        id: "step-sprite",
        step: 4,
        label: { ko: "8방향 스프라이트", en: "8-direction sprite" },
        description: { ko: "스테이지 동작 생성", en: "Generate stage motion" },
        href: "/assets-studio/sprite",
      },
      {
        id: "step-review",
        step: 5,
        label: { ko: "검수·적용", en: "Review and apply" },
        description: { ko: "배경 제거와 애니메이션 확인", en: "Check and apply" },
        href: "/assets-studio/review",
      },
    ],
  },
  {
    id: "workspace-tools",
    label: { ko: "보조 작업", en: "Workspace tools" },
    items: [
      {
        id: "world-assets",
        icon: Map,
        label: { ko: "월드 에셋", en: "World assets" },
        description: { ko: "타일·건물·소품", en: "Tiles, buildings, and props" },
        href: "/assets-studio/world",
      },
      {
        id: "asset-library",
        icon: Images,
        label: { ko: "에셋 라이브러리", en: "Asset library" },
        description: { ko: "목록과 필터", en: "Lists and filters" },
        href: "/assets-studio/library",
      },
    ],
  },
];

export function isAdminWorkspaceNavItemActive(pathname: string, href: string): boolean {
  if (href === "/assets-studio") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
