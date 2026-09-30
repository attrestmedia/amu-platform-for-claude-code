import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ServiceAccessGate } from "components/module/service";

const PLAY_OG_IMAGE = "https://app.allmyuniverse.com/social/app-default-1200x630.jpg";
const seoDescription = "캐릭터를 만들고 세계를 탐험하며 NPC와 관계를 쌓는 AI 가상 시뮬레이션 세계를 경험하세요.";

export const metadata: Metadata = {
  title: "Play · 출시 준비 중 | All My Universe",
  description: seoDescription,
  alternates: {
    canonical: "/play",
  },
  // 서비스 미공개 상태(serviceAvailability play=false)와 메타를 일치시킨다
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Play · 출시 준비 중 | All My Universe",
    description: seoDescription,
    type: "website",
    url: "/play",
    siteName: "All My Universe",
    locale: "ko_KR",
    images: [
      {
        url: PLAY_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "All My Universe play hub social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Play · 출시 준비 중 | All My Universe",
    description: seoDescription,
    site: "@allmyuniverse25",
    creator: "@allmyuniverse25",
    images: [PLAY_OG_IMAGE],
  },
};

export default function PlayLayout({ children }: { children: ReactNode }) {
  return <ServiceAccessGate serviceKey="play">{children}</ServiceAccessGate>;
}
