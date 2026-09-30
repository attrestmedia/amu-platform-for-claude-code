"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, Preloader } from "@amu-labs/ui";
import {
  UniverseDetailManager,
  UniverseForm,
  UniverseWalletPanel,
  UniverseUsageList,
} from "components/module/admin/universe";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { TossPaymentDialog } from "components/module/payments";
import { CoinChargeWidget } from "components/module/commerce";
import { Logout } from "components/module/auth";
import { Lang, lang } from "components/module/i18n";
import { MarketingCredentialPanelGroup, MarketingOperationsPanel } from "components/module/admin/third-party";
import fetchClient from "libs/api/fetchClient";
import type { IUniverse } from "types/game";
import { useAuthStore } from "store/auth";
import { useUniverseData } from "hooks/game/core";
import { useUniverseAdminAccess } from "hooks/admin";
import { logger } from "utils/log";
import { Pencil, CreditCard, Coins, LayoutGrid, Database, Settings, Store, ExternalLink, GitBranch } from "lucide-react";
import { MARKETING_FEATURE_ENABLED } from "consts/marketing/public";
import { PersonaManager } from "components/module/admin/persona";
import { StageList } from "components/module/admin/stage";
import { PAGE_LAYOUT_CLASS, SHEET_CLASS, SHEET_HEADER_CLASS, STAT_CARD_CLASS, THEME_OVERRIDE_CLASS } from "utils/theme";
import { cn, toUnknownRecord } from "utils/common";
import { useQuery } from "@tanstack/react-query";
import { fetchUniverseWallet } from "libs/api/payment";

type StorefrontStatusState = {
  ready: boolean;
  storeId: string;
  storefrontOpen: boolean;
};

// 개별 유니버스 관리자 페이지
// - editor: 자신의 권한이 있는 commerce 유니버스만 접근 가능
// - administrator: 모든 유니버스 접근 가능
export default function UniverseScopedAdminPage() {
  const router = useRouter();
  const { universeId } = useUniverseData();

  const [universes, setUniverses] = useState<IUniverse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [openStageManager, setOpenStageManager] = useState(false);
  const [showMarketingManager, setShowMarketingManager] = useState(false);
  const [showMarketingCredentialSettings, setShowMarketingCredentialSettings] = useState(false);

  // 결제 다이얼로그 상태
  const uid = useAuthStore((s) => s.user?.id || "");
  const [openCoin, setOpenCoin] = useState(false);
  const [openSub, setOpenSub] = useState(false);
  const [storefrontStatus, setStorefrontStatus] = useState<StorefrontStatusState>({
    ready: false,
    storeId: "",
    storefrontOpen: false,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchClient.get("/universe"); // 전체 목록 조회 API
        if (!alive) return;
        const list: IUniverse[] = Array.isArray(res.data?.data) ? res.data.data : res.data || [];
        setUniverses(list);
      } catch (e) {
        logger.error("[ScopedAdmin] universes fetch error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { canEditUniverse, isAdministrator } = useUniverseAdminAccess(universes || []);

  // 파라미터 기반 대상 유니버스
  const targetUniverse = useMemo(() => (universes || []).find((u) => u.id === universeId), [universes, universeId]);
  const isCommerceUniverse = targetUniverse?.type === "commerce";
  const naverStoreUrl = useMemo(() => {
    const storeId = storefrontStatus.storeId.trim();
    return storeId ? `https://smartstore.naver.com/${encodeURIComponent(storeId)}` : "";
  }, [storefrontStatus.storeId]);

  const walletQuery = useQuery({
    queryKey: ["universe-wallet", universeId],
    queryFn: () => fetchUniverseWallet(universeId),
    enabled: Boolean(universeId && targetUniverse),
  });
  const walletData = toUnknownRecord(walletQuery.data);
  const walletPolicy = toUnknownRecord(walletData.policy);
  const walletPermissions = toUnknownRecord(walletData.permissions);
  const canManageBilling = walletPermissions.canManageBilling === true;
  const chargeAllowed = walletPolicy.chargeAllowed === true;
  const renewalAllowed = walletPolicy.renewalAllowed === true;

  // 접근 가드: 권한 없으면 홈으로 리다이렉션
  useEffect(() => {
    if (loading) return;

    // 존재하지 않거나 권한 없는 경우
    if (!targetUniverse || !canEditUniverse(targetUniverse)) {
      router.replace("/");
      return;
    }
  }, [loading, targetUniverse, canEditUniverse, router]);

  useEffect(
    function loadStorefrontStatusForCommerce() {
      if (!targetUniverse || targetUniverse.type !== "commerce") {
        // 비-commerce 유니버스에서는 외부 storefront 상태를 기본값으로 동기화
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStorefrontStatus({ ready: false, storeId: "", storefrontOpen: false });
        return;
      }

      let alive = true;
      (async () => {
        try {
          const response = await fetchClient.get<unknown>(`/universe/${targetUniverse.id}/commerce/storefront-status`, {
            cache: "no-store",
          });
          if (!alive) return;
          const data = toUnknownRecord(toUnknownRecord(response.data).data);
          setStorefrontStatus({
            ready: Boolean(data.credentialReady),
            storeId: String(data.storeId || ""),
            storefrontOpen: Boolean(data.storefrontOpen),
          });
        } catch (error) {
          logger.warn("스마트스토어 공개 상태 조회 실패:", error);
          if (alive) setStorefrontStatus({ ready: false, storeId: "", storefrontOpen: false });
        }
      })();

      return () => {
        alive = false;
      };
    },
    [targetUniverse],
  );

  if (loading || !targetUniverse) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <div className={cn(PAGE_LAYOUT_CLASS, THEME_OVERRIDE_CLASS, "p-4 md:p-6")}>
      {/* 헤더 카드 */}
      <div className={cn(STAT_CARD_CLASS, "mb-6 p-4 md:p-6")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* 제목 영역 */}
          <div className="flex-1">
            <h1 className="mb-1 text-2xl font-bold text-primary-text">유니버스 관리자</h1>
            <p className="flex items-center gap-2 text-sm text-secondary-text">
              <span className="font-medium text-primary-text">{targetUniverse.name}</span>
              <span className="text-secondary-text">•</span>
              <span className="rounded-md border border-border bg-background/70 px-2 py-1 font-mono text-xs">
                {targetUniverse.id}
              </span>
            </p>
          </div>

          {/* 버튼 그룹 */}
          <div className="flex flex-wrap gap-2">
            {/* 코인 충전 버튼 */}
            <Button size="sm" onClick={() => setOpenCoin(true)} disabled={!canManageBilling || !chargeAllowed}>
              <Coins className="h-4 w-4" />
              <span className="font-medium"><Lang text={{ ko: "유니버스 코인 충전", en: "Universe Coin Top-up" }} /></span>
            </Button>

            {/* 구독 결제 버튼 */}
            <Button size="sm" variant="secondary" onClick={() => setOpenSub(true)} disabled={!canManageBilling || !renewalAllowed}>
              <CreditCard className="h-4 w-4" />
              <span className="font-medium"><Lang text={{ ko: "유니버스 멤버십 결제", en: "Universe Membership Payment" }} /></span>
            </Button>

            {/* 기본 데이터 편집 */}
            <Button size="sm" variant="outline" onClick={() => setShowEditDialog(true)}>
              <Pencil className="h-4 w-4" />
              <span className="font-medium">편집</span>
            </Button>

            {/* Stage Manager 버튼 */}
            <Button size="sm" variant="outline" onClick={() => setOpenStageManager(true)}>
              <LayoutGrid className="h-4 w-4" />
              <span className="font-medium">Stage Manager</span>
            </Button>

            <Button size="sm" variant="outline" onClick={() => router.push(`/admin/${encodeURIComponent(targetUniverse.id)}/canon`)}>
              <GitBranch className="h-4 w-4" />
              <span className="font-medium">
                <Lang text={{ ko: "Global Canon", en: "Global Canon" }} />
              </span>
            </Button>

            {isCommerceUniverse && storefrontStatus.ready && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/store/${targetUniverse.id}/manage`)}
              >
                <Store className="h-4 w-4" />
                <span className="font-medium">
                  <Lang text={{ ko: "스마트스토어 운영", en: "Smart Store Ops" }} />
                </span>
              </Button>
            )}

            {isCommerceUniverse && naverStoreUrl && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(naverStoreUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4" />
                <span className="font-medium">
                  <Lang text={{ ko: "네이버 스토어", en: "Naver Store" }} />
                </span>
              </Button>
            )}

            {MARKETING_FEATURE_ENABLED && (
              <Button size="sm" variant="outline" onClick={() => setShowMarketingManager(true)}>
                <Database className="h-4 w-4" />
                <span className="font-medium">Marketing Oops</span>
              </Button>
            )}

            <Logout className="text-sm text-secondary-text" />
          </div>
        </div>
      </div>

      {/* 코인 충전 */}
      <Dialog open={openCoin} onOpenChange={setOpenCoin}>
        <DialogContent innerWrapClassName="min-w-[20rem] md:min-w-[30rem]" centered>
          <DialogHeader>
            <DialogTitle><Lang text={{ ko: "유니버스 코인 충전", en: "Universe Coin Top-up" }} /></DialogTitle>
          </DialogHeader>
          <CoinChargeWidget uid={uid} title="" scope="universe" universeId={universeId} adminUid={uid} />
        </DialogContent>
      </Dialog>

      {/* 구독 결제 */}
      <TossPaymentDialog
        open={openSub}
        onOpenChange={setOpenSub}
        scope="universe"
        universeId={universeId}
        adminUid={uid}
        mode="subscription"
      />

      {/* 지갑 및 사용 내역 섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <UniverseWalletPanel universeId={universeId} />
        <UniverseUsageList universeId={universeId} />
      </div>

      {/* 상세 관리자 */}
      <div className="overflow-hidden">
        <UniverseDetailManager
          universes={[targetUniverse]}
          selectedUniverse={targetUniverse.id}
          lockSelection
          onNaverCredentialStatusChange={(status) =>
            setStorefrontStatus((prev) => ({
              ...prev,
              ready: status.ready,
              storeId: String(status.storeId || prev.storeId || ""),
              storefrontOpen: Boolean(status.storefrontOpen ?? prev.storefrontOpen),
            }))
          }
        />
      </div>

      {/* 편집 다이얼로그 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="w-full max-w-xl max-h-[90vh] overflow-y-auto before:opacity-0">
          <DialogHeader>
            <DialogTitle>기본 데이터 편집</DialogTitle>
          </DialogHeader>
          <UniverseForm
            universe={targetUniverse}
            onSuccess={async () => {
              try {
                const res = await fetchClient.get("/universe");
                const list: IUniverse[] = Array.isArray(res.data?.data) ? res.data.data : res.data || [];
                setUniverses(list);
              } catch (e) {
                logger.warn("우주 목록 재조회 실패(무시):", e);
              } finally {
                setShowEditDialog(false);
              }
            }}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 상품 이미지 생성/수정 */}
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            Gen Studio
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>상품 이미지 생성/수정</DialogTitle>
          </DialogHeader>
          <ImageStudioEditor
            mode="universe"
            universeId={targetUniverse.id!}
            surface="embedded"
            detailPresentation="embedded"
            onDone={(images) => {
              console.log("saved:", images);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 페르소나 통합 관리 */}
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            Persona Manager
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[50rem]">
          <DialogHeader>
            <DialogTitle>페르소나 통합 관리</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
            <PersonaManager universeId={universeId} availableUniverses={targetUniverse ? [targetUniverse] : []} />
          </div>
        </DialogContent>
      </Dialog>

      {/* 유니버스 스코프 스테이지 관리 */}
      <Dialog open={openStageManager} onOpenChange={setOpenStageManager}>
        <DialogContent
          className="w-full max-w-[95vw] h-[95vh] before:opacity-0"
          innerWrapClassName="max-w-none h-full overflow-y-auto overflow-x-hidden p-4 md:p-6"
        >
          <DialogHeader>
            <DialogTitle>스테이지 관리 (Universe: {universeId})</DialogTitle>
          </DialogHeader>
          <StageList universeId={universeId} />
        </DialogContent>
      </Dialog>

      <Sheet open={showMarketingManager} onOpenChange={setShowMarketingManager}>
        <SheetContent side="bottom" className={SHEET_CLASS}>
          <div className="flex h-full flex-col">
            <SheetHeader className={SHEET_HEADER_CLASS}>
              <div className="flex items-center justify-between gap-3">
                <SheetTitle>Marketing Oops</SheetTitle>
                <Button
                  variant="blank"
                  size="icon-sm"
                  className="mr-8 rounded-md border border-border bg-surface text-primary-text hover:bg-surface-2"
                  onClick={() => setShowMarketingCredentialSettings(true)}
                  aria-label={lang({ ko: "자격증명 카드 설정", en: "Credential card settings" })}
                  title={lang({ ko: "자격증명 카드 설정", en: "Credential card settings" })}
                >
                  <Settings size={18} />
                </Button>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className={cn("mx-auto flex w-full max-w-6xl flex-col gap-4", THEME_OVERRIDE_CLASS)}>
                <section className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">
                    <Lang text={{ ko: "유니버스별 마케팅 운영", en: "Universe Marketing Operations" }} />
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    <Lang
                      text={{
                        ko: "이 패널은 현재 유니버스의 자격증명과 운영 queue, 검수 상태를 고정 범위로 관리합니다.",
                        en: "This panel manages credentials, operation queues, and review status for the current universe.",
                      }}
                    />
                  </p>
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                    {targetUniverse.name} ({targetUniverse.id})
                  </p>
                </section>

                <MarketingCredentialPanelGroup
                  universeId={targetUniverse.id}
                  settingsOpen={showMarketingCredentialSettings}
                  onSettingsOpenChange={setShowMarketingCredentialSettings}
                  isGlobalAdmin={isAdministrator}
                />

                <MarketingOperationsPanel
                  universeId={targetUniverse.id}
                  availableUniverses={[
                    {
                      id: targetUniverse.id,
                      name: targetUniverse.name,
                    },
                  ]}
                  isGlobalAdmin={isAdministrator}
                  studioPresentation="embedded"
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
