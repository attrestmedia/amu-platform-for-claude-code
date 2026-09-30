import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MARKETING_OOPS_ICON_SVG } from "src/libs/apps/layout/metadata";
import { ServiceThemeScope } from "components/module/theme/ServiceThemeScope";
import { ServiceAccessGate } from "components/module/service";

const MARKETING_OOPS_TITLE = "1인 사업자의 AI 마케팅 운영팀 | Marketing Oops";
const MARKETING_OOPS_DESCRIPTION =
  "목표를 정하고, 채널에 맞게 만들고, 발행하고, 성과까지 하나의 흐름으로 잇습니다. All My Universe의 AI 마케팅 운영 서비스이며 현재 출시를 준비하고 있습니다.";
// 전용 OG 이미지는 아직 없다. 로고 세트에서 1200x630을 내보낸 뒤 교체한다.
const MARKETING_OOPS_OG_IMAGE = "https://app.allmyuniverse.com/social/app-default-1200x630.jpg";

export const metadata: Metadata = {
  title: MARKETING_OOPS_TITLE,
  description: MARKETING_OOPS_DESCRIPTION,
  alternates: {
    canonical: "/marketing-oops",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: MARKETING_OOPS_TITLE,
    description: MARKETING_OOPS_DESCRIPTION,
    type: "website",
    url: "/marketing-oops",
    siteName: "All My Universe",
    locale: "ko_KR",
    images: [
      {
        url: MARKETING_OOPS_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Marketing Oops social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: MARKETING_OOPS_TITLE,
    description: MARKETING_OOPS_DESCRIPTION,
    site: "@allmyuniverse25",
    creator: "@allmyuniverse25",
    images: [MARKETING_OOPS_OG_IMAGE],
  },
  icons: {
    icon: MARKETING_OOPS_ICON_SVG,
    shortcut: MARKETING_OOPS_ICON_SVG,
  },
};

export default function MarketingOopsLayout({ children }: { children: ReactNode }) {
  // 로고 4색을 면색으로만 쓰는 서비스 테마 — 토큰 정본은 @amu-labs/ui/styles/themes/marketing-oops.css
  // 하위 workspace·connections에도 함께 적용해 세 화면이 하나의 서비스로 읽히게 한다.
  return (
    <ServiceAccessGate serviceKey="marketing-oops">
      <ServiceThemeScope service="marketing-oops">{children}</ServiceThemeScope>
    </ServiceAccessGate>
  );
}
