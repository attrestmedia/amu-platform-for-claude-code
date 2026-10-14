import { Activity, BarChart3, ImagePlus, Layers, LayoutGrid, Link2, ListChecks, Mail, Search, Shield, Sliders, Target } from "lucide-react";
import type { WorkspaceNavSection } from "components/module/layout/workspaceNavModel";

export const MARKETING_ADMIN_ONLY_SECTIONS = ["keyword", "ads", "promo", "newsletter"] as const;

function withUniverseId(href: string, universeId: string): string {
  return universeId ? `${href}?universeId=${encodeURIComponent(universeId)}` : href;
}

export function buildMarketingNavSections({
  isAdministrator,
  universeId,
  reviewTotal,
}: {
  isAdministrator: boolean;
  universeId: string;
  reviewTotal: number;
}): WorkspaceNavSection[] {
  const sections: WorkspaceNavSection[] = [
    {
      id: "operations",
      label: { ko: "운영", en: "Operations" },
      items: [
        { id: "queue", label: { ko: "Queue 등록", en: "Queue" }, href: withUniverseId("/marketing-oops/workspace/queue", universeId), icon: Layers },
        { id: "system", label: { ko: "운영 상태", en: "System" }, href: withUniverseId("/marketing-oops/workspace/system", universeId), icon: Activity },
        { id: "generation", label: { ko: "생성 설정", en: "Policy" }, href: withUniverseId("/marketing-oops/workspace/generation", universeId), icon: Sliders },
        {
          id: "review",
          label: { ko: "검수/발행", en: "Review" },
          href: withUniverseId("/marketing-oops/workspace/review", universeId),
          icon: ListChecks,
          ...(reviewTotal > 0
            ? { badge: { value: reviewTotal, label: { ko: "검수 대기", en: "Pending review" } } }
            : {}),
        },
        { id: "performance", label: { ko: "성과", en: "Performance" }, href: withUniverseId("/marketing-oops/workspace/performance", universeId), icon: BarChart3 },
      ],
    },
  ];

  if (isAdministrator) {
    sections.push({
      id: "admin-operations",
      label: { ko: "관리자 운영", en: "Admin operations" },
      items: [
        { id: "keyword", label: { ko: "키워드/업로드 정책", en: "Keywords / Upload policy" }, href: withUniverseId("/marketing-oops/workspace/keyword", universeId), icon: Search },
        { id: "ads", label: { ko: "광고", en: "Ads" }, href: withUniverseId("/marketing-oops/workspace/ads", universeId), icon: Target },
        { id: "promo", label: { ko: "매거진 슬롯", en: "Magazine slots" }, href: withUniverseId("/marketing-oops/workspace/promo", universeId), icon: LayoutGrid },
        { id: "newsletter", label: { ko: "뉴스레터 승인", en: "Newsletter approval" }, href: withUniverseId("/marketing-oops/workspace/newsletter", universeId), icon: Mail },
      ],
    });
  }

  sections.push(
    {
      id: "connections",
      label: { ko: "연결", en: "Connections" },
      items: [
        {
          id: "connections",
          label: { ko: "외부 서비스 간편 연결", en: "Connected services" },
          href: withUniverseId("/marketing-oops/connections", universeId),
          icon: Link2,
        },
      ],
    },
    {
      id: "workspaces",
      label: { ko: "다른 워크스페이스", en: "Other workspaces" },
      items: [
        ...(isAdministrator
          ? [{ id: "admin", label: { ko: "관리자", en: "Admin" }, href: "/admin", icon: Shield }]
          : []),
        { id: "assets-studio", label: { ko: "에셋 스튜디오", en: "Assets Studio" }, href: "/assets-studio", icon: ImagePlus },
      ],
    },
  );

  return sections;
}
