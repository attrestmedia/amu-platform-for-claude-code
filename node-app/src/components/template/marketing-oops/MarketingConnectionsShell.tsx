"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  MarketingOAuthConnectPanel,
  type OAuthConnectProvider,
} from "components/module/admin/third-party/marketing-operations/MarketingOAuthConnectPanel";
import { LinkedInConnectPanel } from "components/module/admin/third-party/marketing-operations/LinkedInConnectPanel";
import { MarketingAnalyticsSettingsPanel } from "components/module/admin/third-party/marketing-operations/MarketingAnalyticsSettingsPanel";
import { GaReportingTargetsPanel } from "components/module/admin/third-party/marketing-operations/GaReportingTargetsPanel";
import { SocialProfilePanel } from "components/module/admin/third-party/marketing-operations/SocialProfilePanel";
import { getUniverseList } from "libs/api/universe";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useUniverseAdminAccess } from "hooks/admin";
import { useAuthStore } from "store/auth";
import type { IUniverse } from "types/game";
import { logger } from "utils/log";
import { PAGE_LAYOUT_CLASS, THEME_OVERRIDE_CLASS } from "utils/theme";
import { cn } from "utils/common";
import { toast } from "sonner";

const PROVIDERS: Array<{
  provider: OAuthConnectProvider;
  title: { ko: string; en: string };
  description: { ko: string; en: string };
}> = [
  {
    provider: "instagram",
    title: { ko: "Instagram", en: "Instagram" },
    description: { ko: "게시와 성과 수집에 사용할 비즈니스 계정을 연결합니다.", en: "Connect a business account for publishing and insights." },
  },
  {
    provider: "threads",
    title: { ko: "Threads", en: "Threads" },
    description: { ko: "게시와 성과 수집에 사용할 Threads 계정을 연결합니다.", en: "Connect a Threads account for publishing and insights." },
  },
  {
    provider: "google_analytics",
    title: { ko: "Google Analytics", en: "Google Analytics" },
    description: { ko: "Google 계정을 연결하고 성과 수집에 사용할 GA4 속성을 관리합니다.", en: "Connect Google and manage the GA4 properties used for performance collection." },
  },
  {
    provider: "google_ads",
    title: { ko: "Google Ads", en: "Google Ads" },
    description: { ko: "광고 운영에 사용할 접근 가능 고객 ID를 선택합니다.", en: "Select an accessible customer for ads operations." },
  },
];

export function MarketingConnectionsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedUniverseId = searchParams.get("universeId") || "";
  const callbackStatus = searchParams.get("marketingOAuth") || "";
  const [universes, setUniverses] = useState<IUniverse[]>([]);
  const [loading, setLoading] = useState(true);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData } = useUserData();
  const { editableUniverses } = useUniverseAdminAccess(universes);

  useAuthCheck();

  useEffect(() => {
    if (!isLoggedIn) router.push("/login?next=/marketing-oops/connections");
  }, [isLoggedIn, router]);

  useEffect(() => {
    void getUniverseList({ enabledOnly: false, sortByOrder: true })
      .then(setUniverses)
      .catch((error) => logger.error("마케팅 연결 유니버스 목록 조회 실패:", error))
      .finally(() => setLoading(false));
  }, []);

  const selectedUniverseId = editableUniverses.some((universe) => universe.id === requestedUniverseId)
    ? requestedUniverseId
    : editableUniverses[0]?.id || "";

  useEffect(() => {
    if (!callbackStatus) return;
    if (callbackStatus === "connected") toast.success(lang({ ko: "계정 연결이 완료되었습니다.", en: "Account connected." }));
    else if (callbackStatus === "selection_required") toast.info(lang({ ko: "연결되었습니다. 사용할 운영 대상을 선택해 주세요.", en: "Connected. Select a resource to continue." }));
    else toast.error(lang({ ko: "계정 연결을 완료하지 못했습니다. 다시 시도해 주세요.", en: "Could not complete the connection. Try again." }));
    router.replace(`/marketing-oops/connections${requestedUniverseId ? `?universeId=${encodeURIComponent(requestedUniverseId)}` : ""}`);
  }, [callbackStatus, requestedUniverseId, router]);

  const selectedUniverse = useMemo(
    () => editableUniverses.find((universe) => universe.id === selectedUniverseId),
    [editableUniverses, selectedUniverseId],
  );

  const changeUniverse = (value: string | string[]) => {
    const universeId = Array.isArray(value) ? value[0] || "" : value;
    router.replace(`/marketing-oops/connections?universeId=${encodeURIComponent(universeId)}`);
  };

  if (loading || !isLoggedIn || !userData) return <Preloader variant="spin" size="lg" container fullScreen />;

  return (
    <div className={PAGE_LAYOUT_CLASS}>
      <div className={cn("container mx-auto max-w-4xl p-4", THEME_OVERRIDE_CLASS)}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => router.push(`/marketing-oops/workspace${selectedUniverseId ? `?universeId=${encodeURIComponent(selectedUniverseId)}` : ""}`)}
              aria-label={lang({ ko: "이전 화면", en: "Back" })}
            >
              <ArrowLeft size={16} />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-primary"><Lang text={{ ko: "외부 서비스 간편 연결", en: "Connected services" }} /></h1>
              <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "비밀 키를 직접 입력하지 않고 계정 로그인으로 안전하게 연결합니다.", en: "Connect securely by signing in instead of entering secret keys." }} /></p>
            </div>
          </div>
          <div className="w-full max-w-72">
            <Select size="sm" value={selectedUniverseId} onValueChange={changeUniverse}>
              <SelectTrigger><SelectValue placeholder={lang({ ko: "유니버스 선택", en: "Select universe" })} /></SelectTrigger>
              <SelectContent>
                {editableUniverses.map((universe) => <SelectItem key={universe.id} value={universe.id}>{universe.name} ({universe.id})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <section className="mb-6 rounded-xl bg-primary/5 p-4 text-sm text-secondary-text">
          <Lang
            text={{
              ko: "이 화면에는 선택한 유니버스가 실제 사용할 계정과 운영 대상만 표시됩니다. 모든 유니버스가 공유하는 OAuth App ID와 Secret은 통합 관리자용 플랫폼 자격증명에서 분리 관리합니다.",
              en: "This page only shows the accounts and resources used by the selected universe. Shared OAuth app IDs and secrets are managed separately in administrator platform credentials.",
            }}
          />
        </section>

        {!selectedUniverse ? (
          <section className="rounded-xl border border-border bg-surface p-5 text-sm text-secondary-text">
            <Lang text={{ ko: "연결을 관리할 수 있는 커머스 유니버스가 없습니다.", en: "You do not have an editable commerce universe." }} />
          </section>
        ) : (
          <div className="grid gap-4">
            {PROVIDERS.map((item) => (
              <section key={item.provider} className="rounded-xl border border-border bg-surface p-4">
                <h2 className="font-semibold text-primary-text"><Lang text={item.title} /></h2>
                <p className="mb-3 mt-1 text-xs text-secondary-text"><Lang text={item.description} /></p>
                <MarketingOAuthConnectPanel
                  universeId={selectedUniverse.id}
                  provider={item.provider}
                />
                {item.provider === "google_analytics" ? (
                  <>
                    <GaReportingTargetsPanel universeId={selectedUniverse.id} />
                    <MarketingAnalyticsSettingsPanel universeId={selectedUniverse.id} />
                  </>
                ) : null}
              </section>
            ))}
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="font-semibold text-primary-text">LinkedIn</h2>
              <p className="mb-3 mt-1 text-xs text-secondary-text">
                <Lang text={{ ko: "게시와 회원 성과 분석에 사용할 계정을 연결합니다.", en: "Connect an account for publishing and member analytics." }} />
              </p>
              <LinkedInConnectPanel universeId={selectedUniverse.id} />
            </section>
            <SocialProfilePanel universeId={selectedUniverse.id} />
          </div>
        )}
      </div>
    </div>
  );
}
