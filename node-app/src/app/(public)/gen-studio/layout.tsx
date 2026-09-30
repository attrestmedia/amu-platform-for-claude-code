import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GEN_STUDIO_ICON_ICO } from "src/libs/apps/layout/metadata";
import { ServiceThemeScope } from "components/module/theme/ServiceThemeScope";
import { ServiceAccessGate } from "components/module/service";

const GEN_STUDIO_OG_IMAGE = "https://app.allmyuniverse.com/social/app-default-1200x630.jpg";

export const metadata: Metadata = {
  title: "AI 이미지 생성 프롬프트 템플릿 | Gen Studio",
  description: "상품사진·모델컷·썸네일·카드뉴스 템플릿을 골라 바로 생성하세요. 프롬프트 확인과 복사는 무료이고, 실제 생성할 때만 코인이 차감됩니다.",
  alternates: {
    canonical: "/gen-studio",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "AI 이미지 생성 프롬프트 템플릿 | Gen Studio",
    description: "상품사진·모델컷·썸네일·카드뉴스 템플릿을 골라 바로 생성하세요. 프롬프트 확인과 복사는 무료이고, 실제 생성할 때만 코인이 차감됩니다.",
    type: "website",
    url: "/gen-studio",
    siteName: "All My Universe",
    locale: "ko_KR",
    images: [
      {
        url: GEN_STUDIO_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Gen Studio social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI 이미지 생성 프롬프트 템플릿 | Gen Studio",
    description: "상품사진·모델컷·썸네일·카드뉴스 템플릿을 골라 바로 생성하세요. 프롬프트 확인과 복사는 무료이고, 실제 생성할 때만 코인이 차감됩니다.",
    site: "@allmyuniverse25",
    creator: "@allmyuniverse25",
    images: [GEN_STUDIO_OG_IMAGE],
  },
  icons: {
    icon: GEN_STUDIO_ICON_ICO,
    shortcut: GEN_STUDIO_ICON_ICO,
    apple: GEN_STUDIO_ICON_ICO,
  },
};

export default function GenStudioLayout({ children }: { children: ReactNode }) {
  return (
    <ServiceAccessGate serviceKey="gen-studio">
      <ServiceThemeScope service="gen-studio">{children}</ServiceThemeScope>
    </ServiceAccessGate>
  );
}
