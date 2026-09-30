"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Images, Sparkles } from "lucide-react";
import { Lang } from "components/module/i18n";
import { SiteFooter, TopBar } from "components/module/layout";
import { Preloader, Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { USER_CREATION_LIBRARY_PATH } from "consts/app";
import { UserImageLibrary } from "./UserImageLibrary";
import { UserTemplateLibrary } from "./UserTemplateLibrary";
import { hasLibraryImageUploadAccess } from "utils/auth/libraryImageUploadAccess";

export function UserCreationLibrary() {
  const router = useRouter();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isAdministrator } = useUserData();

  useEffect(() => {
    if (hasHydrated && !isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent(USER_CREATION_LIBRARY_PATH)}`);
    }
  }, [hasHydrated, isLoggedIn, router]);

  if (!hasHydrated || !isLoggedIn) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background" role="status">
        <Preloader variant="spin" size="md" />
        <span className="sr-only">
          <Lang text={{ ko: "내 라이브러리를 준비하는 중입니다.", en: "Preparing your library." }} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-primary-text">
      <TopBar
        isLoggedIn
        userName={userData?.userInfo?.name}
        canShowAdminButton={Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        logoutRedirectPage={USER_CREATION_LIBRARY_PATH}
      >
        <Link href="/" className="flex items-center gap-2 text-base font-extrabold tracking-tight sm:text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          All My Universe
        </Link>
      </TopBar>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <header className="mb-7 max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Lang text={{ ko: "나의 생성 기록", en: "My creation history" }} />
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            <Lang text={{ ko: "내 라이브러리", en: "My Library" }} />
          </h1>
          <p className="mt-3 text-sm leading-6 text-secondary-text sm:text-base">
            <Lang
              text={{
                ko: "Gen Studio와 Tutors 등에서 만든 이미지의 서비스·템플릿·모델 정보를 확인하고, 즐겨찾기 템플릿까지 함께 관리하세요.",
                en: "Track images created across Gen Studio, Tutors, and other services, then manage favorite templates in the same place.",
              }}
            />
          </p>
        </header>

        <Tabs defaultValue="images">
          <TabsList className="mb-6 grid w-full grid-cols-2 sm:w-[24rem]">
            <TabsTrigger value="images" className="gap-2">
              <Images className="h-4 w-4" />
              <Lang text={{ ko: "내 이미지", en: "My Images" }} />
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <Sparkles className="h-4 w-4" />
              <Lang text={{ ko: "즐겨찾기 템플릿", en: "Favorite Templates" }} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="images">
            <UserImageLibrary canUpload={hasLibraryImageUploadAccess(userData)} />
          </TabsContent>
          <TabsContent value="templates">
            <UserTemplateLibrary />
          </TabsContent>
        </Tabs>
      </main>

      <SiteFooter layout="wide" />
    </div>
  );
}
