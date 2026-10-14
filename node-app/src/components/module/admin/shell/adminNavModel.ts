import {
  Activity,
  BarChart3,
  BookOpen,
  ContactRound,
  Database,
  Globe,
  ImagePlus,
  Key,
  LayoutDashboard,
  ListChecks,
  NotepadText,
  Power,
  Settings,
  ShieldAlert,
  Shield,
  UserCheck,
  Volume2,
  Wand2,
} from "lucide-react";
import { MARKETING_FEATURE_ENABLED } from "consts/marketing/public";
import type { AdminUniverseLink } from "hooks/admin/useAdminUniverseLinks";
import type { WorkspaceNavSection } from "components/module/layout/workspaceNavModel";

const RESERVED_ADMIN_SEGMENTS = new Set(["credentials", "magazine", "operations", "stagemap"]);

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function buildAdminNavSections({
  isAdministrator,
  adminUniverses,
  pathname,
}: {
  isAdministrator: boolean;
  adminUniverses: AdminUniverseLink[];
  pathname: string;
}): WorkspaceNavSection[] {
  const sections: WorkspaceNavSection[] = [];

  if (isAdministrator) {
    sections.push({
      id: "home",
      items: [
        {
          id: "dashboard",
          label: { ko: "유니버스 관리", en: "Universe Management" },
          href: "/admin",
          icon: LayoutDashboard,
          exactMatch: true,
        },
      ],
    });
  } else {
    sections.push({
      id: "my-universes",
      label: { ko: "내 유니버스", en: "My universes" },
      items: adminUniverses.map((universe) => ({
        id: `universe-${universe.id}`,
        label: universe.name,
        href: `/admin/${encodeURIComponent(universe.id)}`,
        icon: Globe,
      })),
    });
  }

  const rawSegment = pathname.startsWith("/admin/") ? pathname.slice("/admin/".length).split("/")[0] : "";
  const universeId = rawSegment ? decodePathSegment(rawSegment) : "";

  const isOperationsUniverseRoute =
    universeId === "operations" && (pathname === "/admin/operations" || pathname === "/admin/operations/canon");

  if (rawSegment && (!RESERVED_ADMIN_SEGMENTS.has(universeId) || isOperationsUniverseRoute)) {
    const universe = adminUniverses.find((item) => item.id === universeId);
    sections.push({
      id: "current-universe",
      label: { ko: "현재 유니버스", en: "Current universe" },
      items: [
        {
          id: "universe-overview",
          label: universe?.name ?? universeId,
          href: `/admin/${rawSegment}`,
          icon: Globe,
          exactMatch: true,
        },
        ...(isAdministrator
          ? [
              {
                id: "universe-canon",
                label: { ko: "Global Canon", en: "Global Canon" },
                href: `/admin/${rawSegment}/canon`,
                icon: BookOpen,
              },
            ]
          : []),
      ],
    });
  }

  if (isAdministrator) {
    sections.push(
      {
        id: "system-operations",
        label: { ko: "시스템 운영", en: "System Operations" },
        items: [
          {
            id: "service-availability",
            label: { ko: "서비스 공개 관리", en: "Service Availability" },
            href: "/admin/operations/service-availability",
            icon: Power,
          },
          {
            id: "system-controls",
            label: { ko: "시스템 컨트롤", en: "System Controls" },
            href: "/admin/operations/system-controls",
            icon: Settings,
          },
          {
            id: "jev-runtime",
            label: { ko: "JEV 런타임 제어", en: "JEV Runtime Controls" },
            href: "/admin/operations/jev-runtime",
            icon: Activity,
          },
          {
            id: "model-emergency-disable",
            label: { ko: "모델 비상 차단", en: "Model Emergency Disable" },
            href: "/admin/operations/model-emergency-disable",
            icon: ShieldAlert,
          },
          {
            id: "speech-runtime",
            label: { ko: "음성 런타임 제어", en: "Speech Runtime Controls" },
            href: "/admin/operations/speech-runtime",
            icon: Volume2,
          },
          {
            id: "age-step-up-mock",
            label: { ko: "성인 확인 모의 흐름", en: "Age Step-up Mock" },
            href: "/admin/operations/age-step-up-mock",
            icon: UserCheck,
          },
          {
            id: "policy-release-verification",
            label: { ko: "정책 릴리스 검증", en: "Policy Release Verification" },
            href: "/admin/operations/policy-release",
            icon: Shield,
          },
        ],
      },
      {
        id: "ai-content-management",
        label: { ko: "AI·콘텐츠 관리", en: "AI & Content Management" },
        items: [
          {
            id: "tts-review",
            label: { ko: "TTS 공개 검수", en: "TTS Preview Review" },
            href: "/admin/operations/tts-review",
            icon: ListChecks,
          },
          {
            id: "system-personas",
            label: { ko: "공통 시스템 페르소나", en: "Common System Personas" },
            href: "/admin/operations/system-personas",
            icon: Wand2,
          },
          {
            id: "personas",
            label: { ko: "페르소나 관리", en: "Persona Management" },
            href: "/admin/operations/personas",
            icon: ContactRound,
          },
          {
            id: "prompts",
            label: { ko: "프롬프트 관리", en: "Prompt Management" },
            href: "/admin/operations/prompts",
            icon: NotepadText,
          },
        ],
      },
    );

    sections.push({
      id: "tools",
      label: { ko: "운영 도구", en: "Operations" },
      items: [
        {
          id: "credentials",
          label: { ko: "플랫폼 자격증명", en: "Platform credentials" },
          href: "/admin/credentials",
          icon: Key,
        },
        {
          id: "intelligence",
          label: { ko: "Article Intelligence", en: "Article Intelligence" },
          href: "/admin/magazine/intelligence",
          icon: Database,
        },
      ],
    });
  }

  const workspaces = [
    {
      id: "assets-studio",
      label: { ko: "에셋 스튜디오", en: "Assets Studio" },
      href: "/assets-studio",
      icon: ImagePlus,
    },
    ...(MARKETING_FEATURE_ENABLED
      ? [
          {
            id: "marketing-oops",
            label: { ko: "Marketing Oops", en: "Marketing Oops" },
            href: "/marketing-oops/workspace",
            icon: BarChart3,
          },
        ]
      : []),
  ];

  sections.push({
    id: "workspaces",
    label: { ko: "다른 워크스페이스", en: "Other workspaces" },
    items: workspaces,
  });

  return sections;
}
