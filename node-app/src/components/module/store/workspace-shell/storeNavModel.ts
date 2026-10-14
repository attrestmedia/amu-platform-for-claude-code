import { BarChart3, Eye, Globe, ImagePlus, Package } from "lucide-react";
import type { WorkspaceNavSection } from "components/module/layout/workspaceNavModel";

export function buildStoreNavSections({
  universeId,
  marketingEnabled,
}: {
  universeId: string;
  marketingEnabled: boolean;
}): WorkspaceNavSection[] {
  const encodedUniverseId = encodeURIComponent(universeId);

  return [
    {
      id: "store",
      label: { ko: "스토어 운영", en: "Store operations" },
      items: [
        {
          id: "products",
          label: { ko: "상품 관리", en: "Products" },
          href: `/store/${encodedUniverseId}/manage`,
          icon: Package,
          exactMatch: true,
        },
      ],
    },
    {
      id: "shortcuts",
      label: { ko: "바로가기", en: "Shortcuts" },
      items: [
        {
          id: "storefront-preview",
          label: { ko: "스토어 미리보기", en: "Storefront preview" },
          href: `/store/${encodedUniverseId}?mode=preview`,
          icon: Eye,
          exactMatch: true,
        },
        ...(marketingEnabled
          ? [
              {
                id: "marketing-oops",
                label: { ko: "Marketing Oops", en: "Marketing Oops" },
                href: `/marketing-oops/workspace/queue?universeId=${encodedUniverseId}`,
                icon: BarChart3,
              },
            ]
          : []),
        {
          id: "assets-studio",
          label: { ko: "에셋 스튜디오", en: "Assets Studio" },
          href: "/assets-studio",
          icon: ImagePlus,
        },
        {
          id: "universe-admin",
          label: { ko: "유니버스 관리", en: "Universe admin" },
          href: `/admin/${encodedUniverseId}`,
          icon: Globe,
          exactMatch: true,
        },
      ],
    },
  ];
}
