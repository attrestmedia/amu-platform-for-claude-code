import type { Metadata } from "next";
import HomePageClient from "components/template/home/HomePageClient";

const SITE_CANONICAL_ORIGIN = "https://allmyuniverse.com";

export const metadata: Metadata = {
  title: "All My Universe — 읽고, 만들고, 배우는 AI 유니버스",
  description:
    "Gen Studio·Tutors·Play·Store를 한 계정으로 쓰는 AI 유니버스. 이미지와 콘텐츠를 만들고, 튜터와 대화하며 배우고, 매거진에서 트렌드를 읽습니다.",
  alternates: {
    canonical: `${SITE_CANONICAL_ORIGIN}/`,
  },
  openGraph: {
    title: "All My Universe — 읽고, 만들고, 배우는 AI 유니버스",
    description:
      "Gen Studio·Tutors·Play·Store를 한 계정으로 쓰는 AI 유니버스. 이미지와 콘텐츠를 만들고, 튜터와 대화하며 배우고, 매거진에서 트렌드를 읽습니다.",
    type: "website",
    url: `${SITE_CANONICAL_ORIGIN}/`,
    siteName: "All My Universe",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "All My Universe — 읽고, 만들고, 배우는 AI 유니버스",
    description:
      "Gen Studio·Tutors·Play·Store를 한 계정으로 쓰는 AI 유니버스. 이미지와 콘텐츠를 만들고, 튜터와 대화하며 배우고, 매거진에서 트렌드를 읽습니다.",
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
