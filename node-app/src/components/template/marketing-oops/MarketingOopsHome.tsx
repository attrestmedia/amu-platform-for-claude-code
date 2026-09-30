"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteFooter, TopBar } from "components/module/layout";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { MarketingOopsLogo } from "./modules/brand";
import {
  MarketingOopsConnectSection,
  MarketingOopsDifferenceSection,
  MarketingOopsHeroSection,
  MarketingOopsLoopSection,
  MarketingOopsStorySection,
  useMarketingOopsWorkspaceAccess,
} from "./modules/landing";
import "styles/modules/marketing-oops.scss";

/**
 * @docHint
 * @purpose Marketing Oops 공개 랜딩 페이지 조합
 * @process 권한 분기 판정 → 5개 섹션 서사(정체성 → 맥락 → 설명 → 신뢰 → 전환) 렌더
 * @domain marketing
 * @scope marketing-oops
 *
 * 섹션 구성 근거:
 * .agent/docs/node-app/2026/08/20260802_083020__marketing-oops-landing-design-improvement.md §5.1
 *
 * 서비스 색·조형 토큰은 app/(public)/marketing-oops/layout.tsx의 ServiceThemeScope가 공급한다.
 */
export function MarketingOopsHome() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isAdministrator } = useUserData();
  const { canOpenWorkspace } = useMarketingOopsWorkspaceAccess();

  return (
    <div className="min-h-screen bg-background text-primary-text">
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.push("/marketing-oops")}
        logoutRedirectPage="/marketing-oops"
        serviceName="Marketing Oops"
      >
        <Link href="/marketing-oops" className="flex items-center" aria-label="Marketing Oops">
          <MarketingOopsLogo className="h-12" />
        </Link>
      </TopBar>

      <main>
        <MarketingOopsHeroSection canOpenWorkspace={canOpenWorkspace} />
        <MarketingOopsStorySection />
        <MarketingOopsLoopSection />
        <MarketingOopsDifferenceSection />
        <MarketingOopsConnectSection canOpenWorkspace={canOpenWorkspace} />
      </main>

      <SiteFooter layout="wide" />
    </div>
  );
}
