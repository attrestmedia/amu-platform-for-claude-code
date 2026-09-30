"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lang, lang } from "components/module/i18n";
import { LoginDialog } from "components/module/auth";
import { ServiceManagementAddon, SiteFooter, TopBar } from "components/module/layout";
import { GenStudioLogo } from "components/template/gen-studio/modules/GenStudioLogo";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { hasLibraryImageUploadAccess } from "utils/auth/libraryImageUploadAccess";
import { CardNewsEditor } from "./CardNewsEditor";

type CardNewsEditorPageProps = {
  deckId?: string;
};

export function CardNewsEditorPage({ deckId }: CardNewsEditorPageProps) {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isAdministrator } = useUserData();
  const [loginOpen, setLoginOpen] = useState(false);
  const handleDeckCreated = useCallback((createdDeckId: string) => {
    router.replace(`/gen-studio/card-news/${encodeURIComponent(createdDeckId)}`, { scroll: false });
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background text-primary-text">
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.refresh()}
        logoutRedirectPage="/gen-studio/card-news"
        serviceAddon={<ServiceManagementAddon variant="genstudio" />}
        serviceName="gen-studio"
      >
        <Link href="/gen-studio" aria-label={lang({ ko: "Gen Studio 홈으로 이동", en: "Go to Gen Studio home" })}>
          <GenStudioLogo />
        </Link>
      </TopBar>

      <main className="flex-1">
        <div className="border-b border-border bg-surface/60 px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">Gen Studio</p>
              <p className="mt-1 truncate text-sm text-secondary-text">
                <Lang text={{ ko: "인스타그램 카드뉴스 편집기", en: "Instagram card news editor" }} />
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isAdministrator ? (
                <Link href="/gen-studio/card-news/templates" className="min-h-11 rounded-md px-3 py-2 text-sm text-accent-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Lang text={{ ko: "템플릿 관리", en: "Manage templates" }} />
                </Link>
              ) : null}
              <Link href="/gen-studio" className="min-h-11 rounded-md px-3 py-2 text-sm text-secondary-text underline-offset-4 hover:text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Lang text={{ ko: "Gen Studio로 돌아가기", en: "Back to Gen Studio" }} />
              </Link>
            </div>
          </div>
        </div>
        <CardNewsEditor
          deckId={deckId}
          canUpload={hasLibraryImageUploadAccess(userData)}
          onRequireLogin={() => setLoginOpen(true)}
          onDeckCreated={handleDeckCreated}
        />
      </main>

      <SiteFooter className="mt-4" layout="wide" />
      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onLoginSuccess={() => router.refresh()}
        title={lang({ ko: "로그인이 필요해요.", en: "You need to log in." })}
        description={lang({ ko: "로그인 후 카드뉴스를 저장하고 편집할 수 있어요.", en: "Log in to save and edit your card news." })}
      />
    </div>
  );
}
