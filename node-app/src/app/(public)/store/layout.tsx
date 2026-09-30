import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ServiceAccessGate } from "components/module/service";

const STORE_OG_IMAGE = "https://app.allmyuniverse.com/social/app-default-1200x630.jpg";
const STORE_TITLE = "Store · 출시 준비 중 | All My Universe";
const STORE_DESCRIPTION =
  "네이버 스마트스토어와 연동하여 상품 등록/관리를 쉽고 빠르게! 이제 제품 상세 걱정 말고 더 쉽게 판매하세요.";

export const metadata: Metadata = {
  title: STORE_TITLE,
  description: STORE_DESCRIPTION,
  alternates: {
    canonical: "/store",
  },
  // 서비스 미공개 상태(serviceAvailability store=false)와 메타를 일치시킨다
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: STORE_TITLE,
    description: STORE_DESCRIPTION,
    type: "website",
    url: "/store",
    siteName: "All My Universe",
    locale: "ko_KR",
    images: [
      {
        url: STORE_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "All My Universe store social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: STORE_TITLE,
    description: STORE_DESCRIPTION,
    site: "@allmyuniverse25",
    creator: "@allmyuniverse25",
    images: [STORE_OG_IMAGE],
  },
};

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <ServiceAccessGate serviceKey="store">{children}</ServiceAccessGate>;
}
