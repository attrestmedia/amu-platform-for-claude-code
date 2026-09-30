import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TUTORS_ICON_ICO } from "src/libs/apps/layout/metadata";
import { ServiceThemeScope } from "components/module/theme/ServiceThemeScope";
import { ServiceAccessGate } from "components/module/service";
import tutorsSocialImage from "src/assets/tutors/tutors-social-v1.webp";

const TUTORS_OG_IMAGE = tutorsSocialImage.src;
const seoDescription = "배우고 싶은 분야의 튜터를 직접 만들고, 대화하며 오늘 할 공부를 이어갑니다.";
export const metadata: Metadata = {
  title: "나만의 AI 튜터 만들기 · 대화형 학습 | Tutors",
  description: seoDescription,
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "나만의 AI 튜터 만들기 · 대화형 학습 | Tutors",
    description: seoDescription,
    type: "website",
    siteName: "All My Universe",
    locale: "ko_KR",
    images: [
      {
        url: TUTORS_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Tutors social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "나만의 AI 튜터 만들기 · 대화형 학습 | Tutors",
    description: seoDescription,
    site: "@allmyuniverse25",
    creator: "@allmyuniverse25",
    images: [TUTORS_OG_IMAGE],
  },
  icons: {
    icon: TUTORS_ICON_ICO,
    shortcut: TUTORS_ICON_ICO,
    apple: TUTORS_ICON_ICO,
  },
};

export default function TutorsLayout({ children }: { children: ReactNode }) {
  // 코발트·민트 기본 + 밝은 옐로우 accent — 토큰 정본은 @amu-labs/ui/styles/themes/tutors.css
  return (
    <ServiceAccessGate serviceKey="tutors">
      <ServiceThemeScope service="tutors">{children}</ServiceThemeScope>
    </ServiceAccessGate>
  );
}
