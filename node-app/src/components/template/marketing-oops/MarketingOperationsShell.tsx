"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { Button, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TooltipBasic } from "@amu-labs/ui";
import { Settings } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { MarketingCredentialPanelGroup, MarketingOperationsPanel } from "components/module/admin/third-party";
import { MARKETING_FEATURE_ENABLED, MARKETING_OPERATION_TABS } from "consts/marketing/public";
import { getUniverseList } from "libs/api/universe";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { useUniverseAdminAccess } from "hooks/admin";
import type { IUniverse } from "types/game";
import { logger } from "utils/log";
import { cn } from "utils/common";
import { THEME_OVERRIDE_CLASS } from "utils/theme";

/**
 * @docHint
 * @purpose 마케팅 운영 전용 페이지 셸(유니버스 선택 + 자격증명/운영 패널)
 * @process 관리자 권한 확인 → 유니버스 로드 → 대상 유니버스 선택 → credential/operations 패널 렌더
 * @domain marketing
 * @scope marketing-oops
 */

const MARKETING_ALL_SCOPE = "__ALL__";
const MARKETING_TABS = new Set<string>(MARKETING_OPERATION_TABS);
const ADMIN_ONLY = new Set(["keyword", "ads", "promo", "newsletter"]);

export function MarketingOperationsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = useSelectedLayoutSegment() ?? "queue";
  const requestedUniverseId = searchParams.get("universeId") || "";
  const requestedJobId = searchParams.get("jobId") || "";
  const requestedCampaignId = searchParams.get("campaignId") || "";
  const [universes, setUniverses] = useState<IUniverse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUniverse, setSelectedUniverse] = useState(requestedUniverseId || MARKETING_ALL_SCOPE);
  const [credentialSettingsOpen, setCredentialSettingsOpen] = useState(false);

  const { userData } = useUserData();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { isAdministrator, editableUniverses } = useUniverseAdminAccess(universes);

  useAuthCheck();

  useEffect(
    function redirectRestrictedSection() {
      if (!loading && userData && !isAdministrator && ADMIN_ONLY.has(section)) {
        const universeQuery = requestedUniverseId ? `?universeId=${encodeURIComponent(requestedUniverseId)}` : "";
        router.replace(`/marketing-oops/workspace/queue${universeQuery}`);
      }
    },
    [isAdministrator, loading, requestedUniverseId, router, section, userData],
  );

  useEffect(
    function guardMarketingAccess() {
      if (!isLoggedIn) router.push("/login?next=/marketing-oops/workspace");
    },
    [isLoggedIn, userData, router],
  );

  useEffect(function fetchUniversesOnMount() {
    async function loadUniverses() {
      try {
        setLoading(true);
        const data = await getUniverseList({ enabledOnly: false, sortByOrder: true });
        setUniverses(data);
      } catch (error) {
        logger.error("유니버스 목록 조회 실패:", error);
      } finally {
        setLoading(false);
      }
    }
    // 마운트 시 외부 API에서 유니버스 목록 fetch — 내부에서 universes/loading 동기화
    void loadUniverses();
  }, []);

  useEffect(
    function syncScopeFromEditableUniverses() {
      if (loading) return;
      if (editableUniverses.length === 0) {
        // 편집 가능 유니버스가 없을 때 외부 데이터에 맞춰 scope 초기화
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedUniverse(isAdministrator ? MARKETING_ALL_SCOPE : "");
        setCredentialSettingsOpen(false);
        return;
      }
      const requestedUniverse = editableUniverses.find((universe) => universe.id === requestedUniverseId);
      setSelectedUniverse((prev) => {
        if (requestedUniverse) return requestedUniverse.id;
        if (!requestedUniverseId) return isAdministrator ? MARKETING_ALL_SCOPE : editableUniverses[0]?.id || "";
        if (prev === MARKETING_ALL_SCOPE) return isAdministrator ? prev : editableUniverses[0]?.id || "";
        if (prev && editableUniverses.some((universe) => universe.id === prev)) return prev;
        return isAdministrator ? MARKETING_ALL_SCOPE : editableUniverses[0]?.id || "";
      });
    },
    [editableUniverses, isAdministrator, loading, requestedUniverseId],
  );

  useEffect(
    function hideSettingsForAllScope() {
      if (selectedUniverse === MARKETING_ALL_SCOPE) {
        // 전체 scope에서는 자격증명 카드 설정 시트를 닫는다
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCredentialSettingsOpen(false);
      }
    },
    [selectedUniverse],
  );

  const availableUniverses = useMemo(
    () => editableUniverses.map((universe) => ({ id: universe.id, name: universe.name })),
    [editableUniverses],
  );

  const activeTab = MARKETING_TABS.has(section) && (!ADMIN_ONLY.has(section) || isAdministrator) ? section : "queue";
  const updateMarketingUrl = (universeId: string, tab = activeTab, navigation: "push" | "replace" = "push") => {
    const params = new URLSearchParams();
    if (universeId !== MARKETING_ALL_SCOPE) params.set("universeId", universeId);
    const query = params.toString();
    const href = `/marketing-oops/workspace/${tab}${query ? `?${query}` : ""}`;
    if (navigation === "replace") {
      router.replace(href);
    } else {
      router.push(href);
    }
  };

  if (!MARKETING_FEATURE_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-3xl text-sm text-secondary-text">
        <Lang text={{ ko: "마케팅 운영 기능이 비활성화되어 있습니다.", en: "Marketing operations is disabled." }} />
      </div>
    );
  }

  if (loading || !isLoggedIn) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  if (!isAdministrator && editableUniverses.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl text-sm text-secondary-text">
        <Lang
          text={{
            ko: "Marketing Oops를 운영할 수 있는 유니버스가 없습니다.",
            en: "You do not have a universe that can use Marketing Oops.",
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className={cn("flex w-full flex-col gap-4", THEME_OVERRIDE_CLASS)}>
        <section className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-primary-text">Marketing Oops</h1>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCredentialSettingsOpen(true)}
            disabled={selectedUniverse === MARKETING_ALL_SCOPE}
            aria-label={lang({ ko: "자격증명 카드 설정", en: "Credential card settings" })}
            title={
              selectedUniverse === MARKETING_ALL_SCOPE
                ? lang({ ko: "특정 유니버스를 선택해 주세요.", en: "Select a universe." })
                : undefined
            }
          >
            <Settings size={16} />
          </Button>
        </section>

          <section className="flex items-center justify-between gap-3">
            <div className="flex items-center">
              <h3 className="text-md font-semibold text-slate-900">
                <Lang text={{ ko: "대상 유니버스 선택", en: "Select target universe" }} />
              </h3>
              <TooltipBasic>
                <Lang
                  text={{
                    ko: "전체 유니버스 범위에서 queue, worker, 검수 현황을 통합 운영하고, 대상 유니버스를 지정하여 신규 queue를 등록할 수 있습니다.",
                    en: "Manage queues, workers, and inspection status in the entire universe, and register new queues by target universe.",
                  }}
                />
              </TooltipBasic>
            </div>

            <div className="w-full max-w-40">
              <Select
                size="sm"
                value={selectedUniverse}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] || MARKETING_ALL_SCOPE : value;
                  setSelectedUniverse(next);
                  updateMarketingUrl(next, activeTab, "replace");
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      editableUniverses.length > 0
                        ? lang({ ko: "유니버스 선택", en: "Select universe" })
                        : lang({ ko: "등록된 유니버스 없음", en: "No universes available" })
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {isAdministrator ? (
                    <SelectItem value={MARKETING_ALL_SCOPE}>
                      {lang({ ko: "전체 유니버스", en: "All universes" })}
                    </SelectItem>
                  ) : null}
                  {editableUniverses.map((universe) => (
                    <SelectItem key={universe.id} value={universe.id}>
                      {universe.name} ({universe.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {selectedUniverse !== MARKETING_ALL_SCOPE ? (
            <MarketingCredentialPanelGroup
              universeId={selectedUniverse}
              settingsOpen={credentialSettingsOpen}
              onSettingsOpenChange={setCredentialSettingsOpen}
              isGlobalAdmin={isAdministrator}
            />
          ) : (
            <section className="rounded-2xl border border-border bg-surface p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">
                <Lang
                  text={{
                    ko: "Credential 패널은 유니버스 단위로 관리됩니다.",
                    en: "Credentials are managed per universe.",
                  }}
                />
              </p>
              <p className="mt-1 text-xs">
                <Lang
                  text={{
                    ko: "전체 범위 운영 모드에서는 queue와 검수 현황을 통합해서 확인할 수 있고, 특정 유니버스를 선택하면 해당 credential 설정 패널이 함께 열립니다.",
                    en: "In all-universe mode you can review queue and operations globally, and selecting a specific universe reveals its credential panel.",
                  }}
                />
              </p>
            </section>
          )}

          <MarketingOperationsPanel
            universeId={selectedUniverse === MARKETING_ALL_SCOPE ? undefined : selectedUniverse}
            availableUniverses={availableUniverses}
            isGlobalAdmin={isAdministrator}
            activeTab={activeTab}
            showTabList={false}
            initialJobId={requestedJobId}
            initialCampaignId={requestedCampaignId}
            onActiveTabChange={(tab) => updateMarketingUrl(selectedUniverse, tab)}
          />
        </div>
    </div>
  );
}

export default MarketingOperationsShell;
