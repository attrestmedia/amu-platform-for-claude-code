import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Private Trade Lab — 게이트 4(네트워크·크롤러 차단)의 애플리케이션 측 절반.
 *
 * AMU 도메인 하위에 있다는 사실만으로 오해 소지가 있으므로 /private/** 전체를 색인에서 제외한다.
 * 나머지 절반(X-Robots-Tag 응답 헤더)은 next.config.mjs의 headers()에 있다 —
 * 메타 태그는 HTML을 파싱하는 크롤러에만 걸리고, 헤더는 그 밖의 요청에도 걸린다.
 */
export const metadata: Metadata = {
  title: "Private",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
