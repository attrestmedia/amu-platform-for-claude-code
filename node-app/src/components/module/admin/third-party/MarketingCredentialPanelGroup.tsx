"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Lang from "components/module/i18n/Lang";
import fetchClient from "libs/api/fetchClient";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, ScrollArea, Sheet, SheetContent, SheetHeader, SheetTitle, Switch } from "@amu-labs/ui";
import { MARKETING_FEATURE_ENABLED } from "consts/marketing/public";
import type { CredentialProviderType } from "types/thirdparty/providers";
import { CredentialPanel } from "./CredentialPanel";
import { toUnknownRecord } from "utils/common/typeUtils";
import { cn } from "src/utils/common";

const MARKETING_CREDENTIAL_VISIBILITY_STORAGE_KEY = "amu:admin:marketing-credential-panels:v2";

const MARKETING_CREDENTIAL_PANELS: Array<{
  provider: Extract<
    CredentialProviderType,
    | "gitlab"
    | "naver_blog"
    | "naver_ads"
    | "naver_datalab"
    | "slack"
    | "email"
  >;
  badge: { ko: string; en: string };
  summary: { ko: string; en: string };
  defaultVisible: boolean;
  adminOnly?: boolean;
}> = [
  {
    provider: "gitlab",
    badge: { ko: "작업 증명", en: "Proof of work" },
    summary: {
      ko: "GitLab 커밋 작업 내용을 마케팅 콘텐츠 근거로 활용하기 위한 프로젝트/API credential slot",
      en: "GitLab project/API credential slot for using commit work as marketing proof",
    },
    defaultVisible: true,
  },
  {
    provider: "naver_blog",
    badge: { ko: "반자동 채널", en: "Semi-auto channel" },
    summary: {
      ko: "네이버 블로그 draft/완료 체크 플로우용 credential slot",
      en: "Credential slot for Naver Blog draft/complete workflow",
    },
    defaultVisible: true,
  },
  {
    provider: "naver_datalab",
    badge: { ko: "수요 측정", en: "Demand" },
    summary: {
      ko: "네이버 데이터랩 키워드 트렌드와 블로그 검색 경쟁/순위 조회용 credential slot",
      en: "Credential slot for Naver DataLab keyword trends and blog search rank tracking",
    },
    defaultVisible: true,
    adminOnly: true,
  },
  {
    provider: "slack",
    badge: { ko: "운영 알림", en: "Ops alerts" },
    summary: {
      ko: "queue 등록, 검수 대기, 발행 성공/실패 알림용 Slack slot",
      en: "Slack slot for queue, review, publish success/failure alerts",
    },
    defaultVisible: true,
  },
  {
    provider: "email",
    badge: { ko: "운영 알림", en: "Ops alerts" },
    summary: {
      ko: "아직 provider adapter가 연결되지 않은 승인 요청/운영 메일 발송용 slot",
      en: "Slot for approval and operations email before the provider adapter is connected",
    },
    defaultVisible: false,
    adminOnly: true,
  },
  {
    provider: "naver_ads",
    badge: { ko: "검색광고", en: "Search ads" },
    summary: {
      ko: "Naver SearchAd 성과 수집과 승인형 paused-first 집행을 위한 credential slot",
      en: "Credential slot for Naver SearchAd performance collection and approved paused-first execution",
    },
    defaultVisible: true,
    adminOnly: true,
  },
];

type MarketingCredentialProvider = (typeof MARKETING_CREDENTIAL_PANELS)[number]["provider"];
type MarketingCredentialVisibility = Partial<Record<MarketingCredentialProvider, boolean>>;
type MarketingCredentialReadyMap = Partial<Record<MarketingCredentialProvider, boolean>>;

const DEFAULT_CREDENTIAL_VISIBILITY = MARKETING_CREDENTIAL_PANELS.reduce<MarketingCredentialVisibility>((acc, item) => {
  acc[item.provider] = item.defaultVisible;
  return acc;
}, {});

export function MarketingCredentialPanelGroup({
  universeId,
  settingsOpen = false,
  onSettingsOpenChange,
  isGlobalAdmin = false,
}: {
  universeId: string;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  isGlobalAdmin?: boolean;
}) {
  const [visibility, setVisibility] = useState<MarketingCredentialVisibility>(DEFAULT_CREDENTIAL_VISIBILITY);
  const [credentialReadyMap, setCredentialReadyMap] = useState<MarketingCredentialReadyMap>({});
  const [credentialStatusLoading, setCredentialStatusLoading] = useState(false);
  const [credentialSectionValue, setCredentialSectionValue] = useState("");
  const [selectedCredentialProvider, setSelectedCredentialProvider] = useState<MarketingCredentialProvider | null>(
    null,
  );

  useEffect(function restoreVisibilityFromLocalStorage() {
    try {
      const saved = window.localStorage.getItem(MARKETING_CREDENTIAL_VISIBILITY_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved) as MarketingCredentialVisibility;
      // localStorage(외부 시스템)에서 복원한 visibility를 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibility({ ...DEFAULT_CREDENTIAL_VISIBILITY, ...parsed });
    } catch {}
  }, []);

  const availablePanels = useMemo(
    () => MARKETING_CREDENTIAL_PANELS.filter((item) => !item.adminOnly || isGlobalAdmin),
    [isGlobalAdmin],
  );

  const visiblePanels = useMemo(
    () => availablePanels.filter((item) => visibility[item.provider] ?? item.defaultVisible),
    [availablePanels, visibility],
  );

  const selectedCredentialPanel = useMemo(
    () => visiblePanels.find((item) => item.provider === selectedCredentialProvider) ?? null,
    [selectedCredentialProvider, visiblePanels],
  );

  const setProviderVisible = (provider: MarketingCredentialProvider, checked: boolean) => {
    setVisibility((prev) => {
      const next = { ...prev, [provider]: checked };
      try {
        window.localStorage.setItem(MARKETING_CREDENTIAL_VISIBILITY_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const loadCredentialReadiness = useCallback(async () => {
    if (!universeId) {
      setCredentialReadyMap({});
      return;
    }

    try {
      setCredentialStatusLoading(true);
      const response = await fetchClient.get(`/universe/${universeId}/credentials`);
      const raw = response.data?.data ?? {};
      const rawRecord = toUnknownRecord(raw);
      const nextReadyMap = availablePanels.reduce<MarketingCredentialReadyMap>((acc, item) => {
        let ready = false;

        if (rawRecord[item.provider]) {
          const row = toUnknownRecord(rawRecord[item.provider]);
          ready =
            typeof row.ready !== "undefined"
              ? Boolean(row.ready)
              : Boolean(row.exists || row.ok || row.valid || row.configured);
        } else if (Array.isArray(raw)) {
          const row = (raw as unknown[]).map(toUnknownRecord).find((candidate) => candidate.provider === item.provider);
          ready =
            row && typeof row.ready !== "undefined"
              ? Boolean(row.ready)
              : Boolean(row?.exists || row?.ok || row?.valid || row?.configured);
        }

        acc[item.provider] = ready;
        return acc;
      }, {});
      setCredentialReadyMap(nextReadyMap);
    } catch {
      setCredentialReadyMap({});
    } finally {
      setCredentialStatusLoading(false);
    }
  }, [availablePanels, universeId]);

  useEffect(
    function fetchCredentialReadinessOnChange() {
      // 외부 API에서 credential ready 상태 fetch — 내부에서 readyMap을 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadCredentialReadiness();
    },
    [loadCredentialReadiness],
  );

  const updateCredentialReady = (provider: MarketingCredentialProvider, ready: boolean) => {
    setCredentialReadyMap((prev) => ({
      ...prev,
      [provider]: ready,
    }));
  };

  const renderCredentialStatusBadge = (provider: MarketingCredentialProvider) => {
    const ready = credentialReadyMap[provider];

    if (credentialStatusLoading && typeof ready === "undefined") {
      return (
        <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-xxs font-medium text-muted-foreground">
          상태 확인 중
        </span>
      );
    }

    if (ready) {
      return (
        <span className="rounded-full border border-accent/30 bg-accent/15 px-2 py-1 text-xxs font-medium text-primary-text">
          준비됨
        </span>
      );
    }

    return (
      <span className="rounded-full border border-border-hover/60 bg-muted/30 px-2 py-1 text-xxs font-medium text-secondary-text">
        미설정
      </span>
    );
  };

  const visibleReadyCount = visiblePanels.filter((item) => credentialReadyMap[item.provider]).length;
  const allVisibleCredentialsReady =
    visiblePanels.length > 0 &&
    !credentialStatusLoading &&
    visiblePanels.every(
      (item) => typeof credentialReadyMap[item.provider] !== "undefined" && credentialReadyMap[item.provider],
    );

  useEffect(
    function collapseCredentialSectionWhenAllReady() {
      if (allVisibleCredentialsReady) {
        // 모든 visible credential이 준비 상태가 되면 섹션을 자동 접기
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCredentialSectionValue("");
      }
    },
    [allVisibleCredentialsReady],
  );

  useEffect(
    function closeCredentialDialogWhenPanelHidden() {
      if (selectedCredentialProvider && !selectedCredentialPanel) {
        // 표시 설정에서 현재 모달의 provider가 숨겨지면 열린 설정 모달을 닫는다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedCredentialProvider(null);
      }
    },
    [selectedCredentialPanel, selectedCredentialProvider],
  );

  if (!MARKETING_FEATURE_ENABLED) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 text-primary-text">
      <Sheet open={settingsOpen} onOpenChange={onSettingsOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[min(80vh,34rem)] rounded-t-2xl border-t border-border bg-background p-0 text-primary-text"
        >
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-border bg-background/95 px-4 py-4 text-left">
              <SheetTitle>
                <Lang text={{ ko: "자격증명 카드 표시 설정", en: "Credential card visibility" }} />
              </SheetTitle>
              <p className="text-sm text-secondary-text">
                <Lang
                  text={{
                    ko: "모든 유니버스에서 공통으로 직접 등록할 자격증명 카드만 켜두세요.",
                    en: "Keep only the direct credential types shared across universes visible.",
                  }}
                />
              </p>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-2 md:grid-cols-2">
                {availablePanels.map((item) => (
                  <label
                    key={item.provider}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary-text"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span className="truncate">{item.provider}</span>
                      {item.adminOnly && (
                        <span className="rounded-full border border-secondary/30 bg-secondary/15 px-2 py-0.5 text-xxs font-medium text-primary-text">
                          admin
                        </span>
                      )}
                    </span>
                    <Switch
                      size="xs"
                      checked={visibility[item.provider] ?? item.defaultVisible}
                      onCheckedChange={(checked) => setProviderVisible(item.provider, checked)}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(selectedCredentialPanel)}
        onOpenChange={(open) => {
          if (!open) setSelectedCredentialProvider(null);
        }}
      >
        {selectedCredentialPanel && (
          <DialogContent
            className="w-[calc(100vw-2rem)] max-w-5xl p-0"
            innerWrapClassName="max-h-[min(88vh,48rem)] w-full max-w-5xl gap-0 overflow-hidden rounded-2xl border border-border bg-surface p-0 text-primary-text"
          >
            <DialogHeader className="border-b border-border bg-background/95 px-4 py-4 pr-12 text-left sm:px-5">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                <span>{selectedCredentialPanel.provider}</span>
                <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-xxs font-medium text-secondary-text">
                  <Lang text={selectedCredentialPanel.badge} />
                </span>
                {renderCredentialStatusBadge(selectedCredentialPanel.provider)}
                {selectedCredentialPanel.adminOnly && (
                  <span className="rounded-full border border-secondary/30 bg-secondary/15 px-2 py-1 text-xxs font-medium text-primary-text">
                    admin
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-secondary-text">
                <Lang text={selectedCredentialPanel.summary} />
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="h-[min(70vh,38rem)]">
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                <CredentialPanel
                  universeId={universeId}
                  provider={selectedCredentialPanel.provider}
                  hideStatusBadge
                  onReadyChange={(ready) => updateCredentialReady(selectedCredentialPanel.provider, ready)}
                />
              </div>
            </ScrollArea>
          </DialogContent>
        )}
      </Dialog>

      <Accordion
        type="single"
        collapsible
        value={credentialSectionValue}
        onValueChange={(value) => setCredentialSectionValue(value)}
      >
        <AccordionItem value="credentials" className="border-0">
          <AccordionTrigger className="gap-3 py-0 text-left hover:no-underline">
            <span className="min-w-0">
              <span className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  <Lang text={{ ko: "마케팅 자동화 자격증명", en: "Marketing automation credentials" }} />
                </span>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary">
                  feature flag
                </span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    allVisibleCredentialsReady
                      ? "border border-accent/30 bg-accent/15 text-primary-text"
                      : "border border-border-hover/60 bg-muted/30 text-secondary-text"
                  }`}
                >
                  {credentialStatusLoading ? "상태 확인 중" : `${visibleReadyCount}/${visiblePanels.length} 준비됨`}
                </span>
              </span>
              <span className="block text-sm font-normal leading-6 text-secondary-text">
                <Lang
                  text={{
                    ko: allVisibleCredentialsReady
                      ? "필요한 자격증명이 모두 준비되었습니다. 필요할 때 펼쳐서 세부 설정을 확인하세요."
                      : "필요한 채널의 자격증명 준비 상태를 확인하고 미설정 항목을 등록하세요.",
                    en: allVisibleCredentialsReady
                      ? "Required credentials are ready. Expand this section when you need to inspect settings."
                      : "Check credential readiness for required channels and configure missing items.",
                  }}
                />
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="mb-4 mt-3 text-sm leading-relaxed text-secondary-text">
              <Lang
                text={{
                    ko: "이 패널에는 유니버스에서 직접 등록해야 하는 공통 자격증명만 표시됩니다. OAuth 기반 채널 연결과 GA 추적 설정은 상단 간편 연결 메뉴에서 관리합니다.",
                    en: "This panel only shows shared credential types that must be registered directly for a universe. Manage OAuth channels and GA tracking from Connected services above.",
                }}
              />
            </p>

            {visiblePanels.length === 0 && (
              <div className="rounded-lg border border-border bg-background/70 p-4 text-sm text-secondary-text">
                <Lang
                  text={{
                    ko: "표시 중인 자격증명 카드가 없습니다. 상단 설정에서 필요한 채널을 다시 켜세요.",
                    en: "No credential cards are visible. Turn on the channels you need from settings.",
                  }}
                />
              </div>
            )}

            <ScrollArea className="w-full" wheelOnScrollX>
              <div className="flex min-w-max gap-3 pb-3">
                {visiblePanels.map((item) => (
                  <button
                    key={item.provider}
                    type="button"
                    onClick={() => setSelectedCredentialProvider(item.provider)}
                    className="flex max-w-[12rem] shrink-0 rounded-lg border border-border bg-surface px-4 py-4 text-left text-primary-text transition-colors hover:border-border-hover hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="block min-w-0">
                      <span className="mb-2 flex flex-wrap items-start gap-2">
                        <span className={cn("text-sm font-medium", item.adminOnly && "text-secondary")}>
                          {item.provider}
                        </span>
                      </span>
                      <span className="mb-2 flex flex-wrap items-start gap-2">
                        <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-xxs text-secondary-text">
                          <Lang text={item.badge} />
                        </span>
                        {renderCredentialStatusBadge(item.provider)}
                      </span>
                      <span className="block text-xs font-normal leading-5 text-secondary-text">
                        <Lang text={item.summary} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

export default MarketingCredentialPanelGroup;
