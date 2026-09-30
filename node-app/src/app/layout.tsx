import React from "react";
import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GameProvider } from "contexts/GameContext";
import { Toaster, AppDialogHost } from "@amu-labs/ui";
import { ReactQueryProvider, NextAuthProvider } from "components/module/provider";
import { AuthInitializer } from "components/module/auth";
import { LanguageProvider } from "components/module/i18n";
import { GlobalNotificationProvider } from "components/module/notifications";
import { GlobalPreloader } from "components/module/loading";
import ServiceWorkerRegistrar from "components/module/service-worker/ServiceWorkerRegistrar";
import { isDev } from "utils/common";
import { COOKIE_CONFIG } from "consts/token";
import { siteDomain, wpApiUri, wpAuthUri, wpMeUri } from "consts/env/runtime";
import { resolveGaTrackingMeasurementId } from "libs/server-utils/marketing/ga/gaTrackingConfig";
import { getServiceAvailability } from "libs/server-utils/system/serviceAvailability";
import { ServiceAvailabilityProvider } from "components/module/service";

// 소셜 로그인 시 '/api/auth/me' 호출이 403 이면 이메일 필수 안내 문구를 띄우기 위한 프로바이더
import { AppEmailConsentProvider } from "components/module/provider";

// 기본 폰트
import "styles/fonts/outfit.css";
import "styles/fonts/pretendard-subset.css";

// Fantasy 세계관 전용 폰트
import "styles/fonts/stylish.css";
import "styles/fonts/boogaloo.css";

// 스타일
import "styles/tailwind.css";
import "styles/globals.scss";

const SITE_CANONICAL_ORIGIN = "https://allmyuniverse.com";
const APP_DEFAULT_OG_IMAGE = `${SITE_CANONICAL_ORIGIN}/social/app-default-1200x630.jpg`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CANONICAL_ORIGIN),
  applicationName: "All My Universe",
  title: isDev ? "localhost :: All My Universe" : "All My Universe",
  description: "읽고, 만들고, 배우는 AI 유니버스. Gen Studio에서 프롬프트 템플릿으로 이미지를 만들고, Tutors와 대화하며 배웁니다.",
  openGraph: {
    title: "All My Universe",
    description: "읽고, 만들고, 배우는 AI 유니버스. Gen Studio에서 프롬프트 템플릿으로 이미지를 만들고, Tutors와 대화하며 배웁니다.",
    siteName: "All My Universe",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: APP_DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "All My Universe social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "All My Universe",
    description: "읽고, 만들고, 배우는 AI 유니버스. Gen Studio에서 프롬프트 템플릿으로 이미지를 만들고, Tutors와 대화하며 배웁니다.",
    site: "@allmyuniverse25",
    creator: "@allmyuniverse25",
    images: [APP_DEFAULT_OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7ee",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // cookies API를 사용하여 쿠키 값을 읽어옴
  const cookieStore = await cookies();
  const deviceType = cookieStore.get(COOKIE_CONFIG.DEVICE_TYPE.name)?.value || "desktop";
  const os = cookieStore.get(COOKIE_CONFIG.OS.name)?.value || "";
  const htmlClass = `${deviceType}${os ? ` ${os}` : ""}`;
  const language = cookieStore.get(COOKIE_CONFIG.LANGUAGE.name)?.value || "ko";
  const gaMeasurementId = !isDev ? await resolveGaTrackingMeasurementId() : "";
  const serviceAvailability = await getServiceAvailability();

  // 서버 런타임에서 env 읽고 → 클라이언트로 주입
  const runtimeEnv = {
    SITE_DOMAIN: siteDomain(),
    WP_API_URL: wpApiUri(),
    WP_AUTH_URL: wpAuthUri(),
    WP_ME_URL: wpMeUri(),
  };

  return (
    <html lang={language} className={htmlClass} suppressHydrationWarning>
      <head>
        <Script id="amu-runtime-env" strategy="beforeInteractive">
          {`window.__AMU_RUNTIME_ENV__ = ${JSON.stringify(runtimeEnv)};`}
        </Script>

        {/*
          라이트 단일 테마 단계다(2026-07-30 결정). 예전 방문자의 localStorage에
          "dark"가 남아 있으면 data-theme="dark"가 다시 붙어 dark: 유틸리티만 발동하므로,
          부트스트랩 단계에서 속성과 저장값을 함께 정리한다.
          다크 복구 시 이 스크립트를 저장값 복원 로직으로 되돌린다.
        */}
        <Script id="amu-theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                document.documentElement.removeAttribute("data-theme");
                localStorage.removeItem("amu-theme");
              } catch (e) {}
            })();
          `}
        </Script>

        {/* Google tag (gtag.js) */}
        {gaMeasurementId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());

                gtag('config', ${JSON.stringify(gaMeasurementId)});
              `}
            </Script>
          </>
        )}

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <NextAuthProvider>
          <LanguageProvider>
            <GameProvider>
              <ReactQueryProvider>
                <ServiceAvailabilityProvider initialServices={serviceAvailability}>
                  <GlobalPreloader />
                  <AuthInitializer>
                    <AppEmailConsentProvider>
                      <GlobalNotificationProvider>{children}</GlobalNotificationProvider>
                    </AppEmailConsentProvider>
                    <ServiceWorkerRegistrar />
                    <Toaster />
                    <AppDialogHost />
                  </AuthInitializer>
                </ServiceAvailabilityProvider>
              </ReactQueryProvider>
            </GameProvider>
          </LanguageProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
