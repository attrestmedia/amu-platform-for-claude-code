"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AudioStudioEditor } from "components/template/gen-studio/AudioStudioEditor";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { ContentStudioEditor } from "components/template/gen-studio/ContentStudioEditor";
import { VideoStudioEditor } from "components/template/gen-studio/VideoStudioEditor";
import { logger } from "utils/log";
import { TopBar } from "components/module/layout";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { ServiceManagementAddon, SiteFooter } from "components/module/layout";
import { GenStudioLogo } from "components/template/gen-studio/modules/GenStudioLogo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { trackGenStudioEntry } from "utils/analytics/ga4";
import {
  createCanonicalGenStudioTemplateSearchParams,
  getGenStudioTemplateSearchParam,
  hasGenStudioTemplateSearchParam,
} from "utils/app/genStudioTemplateQuery";
import { buildGenStudioLegacyRedirectUrl, buildGenStudioListUrl } from "utils/app/genStudioRouteContract";

type GenStudioTemplateBrowserProps = {
  basePath?: string;
  homePath?: string;
};

export function GenStudioTemplateBrowser({
  basePath = "/gen-studio/templates",
  homePath = "/gen-studio",
}: GenStudioTemplateBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canonicalSearchParams = useMemo(
    () => createCanonicalGenStudioTemplateSearchParams(searchParams),
    [searchParams],
  );
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { userData, isAdministrator } = useUserData();
  const entryTrackedRef = useRef(false);

  const requestedMode = getGenStudioTemplateSearchParam(canonicalSearchParams, "mode");
  const activeMode =
    requestedMode === "content"
      ? "content"
      : requestedMode === "video"
        ? "video"
        : requestedMode === "audio"
          ? "audio"
          : "image";
  const initialQuery = String(getGenStudioTemplateSearchParam(canonicalSearchParams, "q") || "").trim();
  const hasLegacyDetailQuery = ["view", "templateKey", "template", "detailMode"].some((key) =>
    hasGenStudioTemplateSearchParam(
      canonicalSearchParams,
      key as "view" | "templateKey" | "template" | "detailMode",
    ),
  );
  const legacyRedirectUrl = useMemo(
    () =>
      buildGenStudioLegacyRedirectUrl({
        mode: getGenStudioTemplateSearchParam(canonicalSearchParams, "mode"),
        templateKey: getGenStudioTemplateSearchParam(canonicalSearchParams, "templateKey"),
        template: getGenStudioTemplateSearchParam(canonicalSearchParams, "template"),
        detailMode: getGenStudioTemplateSearchParam(canonicalSearchParams, "detailMode"),
        currentSearchParams: canonicalSearchParams.toString(),
      }),
    [canonicalSearchParams],
  );

  const setMode = (nextMode: "image" | "content" | "video") => {
    router.replace(
      buildGenStudioListUrl({
        basePath,
        mode: nextMode,
        currentSearchParams: canonicalSearchParams.toString(),
      }),
    );
  };

  useEffect(() => {
    if (!hasLegacyDetailQuery) return;
    router.replace(legacyRedirectUrl);
  }, [hasLegacyDetailQuery, legacyRedirectUrl, router]);

  useEffect(() => {
    if (hasLegacyDetailQuery || entryTrackedRef.current) return;
    trackGenStudioEntry(canonicalSearchParams, {
      studio_scope: "user",
      entry_mode: activeMode,
    });
    entryTrackedRef.current = true;
  }, [canonicalSearchParams, activeMode, hasLegacyDetailQuery]);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background text-primary-text">
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => {
          router.push(basePath);
        }}
        logoutRedirectPage={basePath}
        serviceAddon={<ServiceManagementAddon variant="genstudio" />}
        serviceName="gen-studio"
      >
        <Link href={homePath}>
          <GenStudioLogo />
        </Link>
      </TopBar>

      <main className="p-layout flex-1">
        {hasLegacyDetailQuery ? (
          <section
            className="flex min-h-[50vh] items-center justify-center text-sm text-secondary-text"
            role="status"
            aria-live="polite"
          >
            <Lang text={{ ko: "새 Gen Studio 화면으로 이동하고 있습니다.", en: "Opening the new Gen Studio workspace." }} />
          </section>
        ) : (
          <Tabs value={activeMode} onValueChange={(v) => setMode(v as "image" | "content" | "video")} className="w-full">
            <TabsList className="mb-8 grid w-full grid-cols-3">
              <TabsTrigger value="image">
                <Lang text={{ ko: "이미지 템플릿", en: "Image Templates" }} />
              </TabsTrigger>
              <TabsTrigger value="content">
                <Lang text={{ ko: "콘텐츠 템플릿", en: "Content Templates" }} />
              </TabsTrigger>
              <TabsTrigger value="video">
                <Lang text={{ ko: "영상 만들기", en: "Create Video" }} />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="mt-4">
              <ImageStudioEditor
                mode="user"
                enableTemplateGroupManagement
                detailPresentation="page"
                detailNavigationMode="url"
                navigationBasePath={basePath}
                initialQuery={initialQuery}
                onDone={(images) => logger.log("saved:", images)}
              />
            </TabsContent>

            <TabsContent value="content" className="mt-4">
              <ContentStudioEditor
                mode="user"
                enableTemplateGroupManagement
                detailPresentation="page"
                detailNavigationMode="url"
                navigationBasePath={basePath}
                initialQuery={initialQuery}
                onDone={(contents) => logger.log("contents:", contents)}
              />
            </TabsContent>

            <TabsContent value="video" className="mt-4">
              <VideoStudioEditor />
            </TabsContent>

            {/* audio는 G-EL-PILOT 전까지 visible trigger를 두지 않는다(?mode=audio direct 진입만 허용). */}
            <TabsContent value="audio" className="mt-4">
              <AudioStudioEditor />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <SiteFooter className="mt-4" layout="wide" />
    </div>
  );
}
