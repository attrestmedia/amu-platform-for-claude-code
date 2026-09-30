import type { Metadata } from "next";
import type { ReactNode } from "react";

const GAMES_OG_IMAGE = "https://app.allmyuniverse.com/social/app-default-1200x630.jpg";

export const metadata: Metadata = {
  title: "Play | AI 캐릭터와 플레이하는 유니버스",
  description: "AI 캐릭터와 상호작용하며 탐험할 수 있는 All My Universe 플레이 월드",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Play | AI 캐릭터와 플레이하는 유니버스",
    description: "AI 캐릭터와 상호작용하며 탐험할 수 있는 All My Universe 플레이 월드",
    type: "website",
    siteName: "All My Universe",
    locale: "ko_KR",
    images: [
      {
        url: GAMES_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "All My Universe games social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Play | AI 캐릭터와 플레이하는 유니버스",
    description: "AI 캐릭터와 상호작용하며 탐험할 수 있는 All My Universe 플레이 월드",
    site: "@allmyuniverse25",
    creator: "@allmyuniverse25",
    images: [GAMES_OG_IMAGE],
  },
};

export default function UniverseLayout({ children }: { children: ReactNode }) {
  return children;
}
