"use client";

/**
 * @docHint
 * @purpose 관리자 마케팅 성과 탭 — 게시물/계정 스냅샷 조회·수동/자동 수집 + LinkedIn Member Analytics 승인 후 scope 요청 제어
 * @process GET 스냅샷·수집 상태·LinkedIn capability 로드 → 채널/기간 필터 → 비동기 수집 run 폴링 / 자동 수집·LinkedIn-Version·analytics scope 요청 설정
 * @domain marketing
 * @scope admin-ui
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { cn } from "utils/common";
import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";
import { REVIEW_PANEL_CARD_CLASS, REVIEW_PANEL_LABEL_CLASS } from "./MarketingOpsConstants";
import { getMarketingOperatorErrorMessage } from "./MarketingOpsUtils";

const SOCIAL_PERFORMANCE_API = "/marketing/performance/social";

const CHANNEL_OPTIONS = [
  { value: "__all__", label: "All" },
  { value: "threads", label: "Threads" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "naver_blog", label: "Naver Blog" },
];
const PERFORMANCE_CHANNELS = CHANNEL_OPTIONS.filter((option) => option.value !== "__all__");

const DAYS_OPTIONS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

const DEFAULT_AUTO_COLLECT_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"];
// 수집은 게시물 수에 비례해 수 분까지 걸리므로 시작(runId) 후 완료를 폴링으로 확인한다.
const COLLECT_POLL_INTERVAL_MS = 5000;
const COLLECT_POLL_MAX_ATTEMPTS = 120; // 최대 약 10분

type SocialAutoCollectLastRun = {
  runId?: string;
  trigger?: string;
  status?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  result?: UnknownRecord;
  channelResults?: Array<{ channel?: string; status?: string; reason?: string; error?: string }>;
  tokenWarnings?: string[];
  error?: string;
};

type SocialAutoCollectStatus = {
  settings?: {
    enabled?: boolean;
    channels?: string[];
    rollingDays?: number;
    weeklyDeepDays?: number;
    linkedinVersion?: string;
    linkedinMemberAnalyticsEnabled?: boolean;
  } | null;
  linkedinCapabilities?: {
    tokenConnected?: boolean;
    tokenExpired?: boolean;
    postAnalytics?: boolean;
    profileAnalytics?: boolean;
    reconnectRequired?: boolean;
  };
  lastRun?: SocialAutoCollectLastRun | null;
};

type SocialPerformanceResponse = {
  days?: number;
  itemCount?: number;
  summaryByChannel?: Array<{
    channel?: string;
    metricBasis?: string[];
    metrics?: UnknownRecord;
  }>;
  accountSummaryByChannel?: Array<{
    channel?: string;
    date?: string;
    metrics?: UnknownRecord;
    meta?: UnknownRecord;
  }>;
  topPosts?: Array<{
    entityId?: string;
    channel?: string;
    date?: string;
    metrics?: UnknownRecord;
    meta?: UnknownRecord;
  }>;
  autoCollect?: SocialAutoCollectStatus;
  attribution?: {
    level?: string;
    campaignId?: string;
    sourceFingerprint?: string;
    draftId?: string;
    metricBasis?: string;
    fetchedPostRows?: number;
    matchedPostRows?: number;
    missingAttributionRows?: number;
  };
};

type CollectRunResult = {
  ok?: boolean;
  post?: {
    targetCount?: number;
    collectedCount?: number;
    skippedCount?: number;
    failedCount?: number;
    truncatedChannels?: string[];
    results?: Array<{ channel?: string; status?: string; reason?: string; error?: string }>;
  };
  account?: {
    collectedCount?: number;
    failedCount?: number;
  };
  tokenWarnings?: string[];
  error?: string;
};

function formatNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("ko-KR") : "0";
}

function formatRate(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${(number * 100).toFixed(number > 0 && number < 0.01 ? 2 : 1)}%`;
}

function channelLabel(channel: unknown) {
  const value = toSafeString(channel);
  if (value === "naver_blog") return "Naver Blog";
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : "-";
}

function getMissingChannelMessage(args: {
  channel: string;
  autoCollectEnabled: boolean;
  autoCollectChannels: string[];
  linkedinCapabilities?: SocialAutoCollectStatus["linkedinCapabilities"];
  linkedinMemberAnalyticsEnabled: boolean;
  lastIssue?: { status?: string; reason?: string; error?: string };
}) {
  const issue = toSafeString(args.lastIssue?.reason || args.lastIssue?.error);
  if (
    args.channel === "linkedin" &&
    (issue === "linkedin_social_actions_read_scope_missing" || issue === "linkedin_member_post_analytics_scope_missing")
  ) {
    return lang({ ko: "성과 읽기 권한이 없어 수집이 건너뛰어졌습니다.", en: "Collection skipped because a read scope is unavailable." });
  }
  if (args.channel === "linkedin" && issue === "linkedin_member_analytics_disabled") {
    return lang({
      ko: "Community Management API 승인 후 분석 권한 요청을 켜세요.",
      en: "Enable analytics scopes after Community Management API approval.",
    });
  }
  if (issue) {
    return lang({ ko: `최근 수집: ${issue}`, en: `Latest collection: ${issue}` });
  }
  if (args.channel === "linkedin") {
    if (!args.linkedinMemberAnalyticsEnabled) {
      return lang({
        ko: "Community Management API 승인 후 분석 권한 요청을 켜세요.",
        en: "Enable analytics scopes after Community Management API approval.",
      });
    }
    if (args.linkedinCapabilities?.reconnectRequired) {
      return lang({
        ko: "새 분석 권한 반영을 위해 LinkedIn 계정을 다시 연결해야 합니다.",
        en: "Reconnect LinkedIn to grant the approved analytics scopes.",
      });
    }
    return args.autoCollectEnabled && !args.autoCollectChannels.includes(args.channel)
      ? lang({
          ko: "현재 OAuth 범위는 발행 전용이며 자동 수집 대상에서도 제외되어 있습니다.",
          en: "The current OAuth scopes are publish-only, and this channel is excluded from auto collection.",
        })
      : lang({
          ko: "현재 OAuth 범위는 발행 전용이며 성과 읽기 권한이 없습니다.",
          en: "The current OAuth scopes allow publishing but not performance reads.",
        });
  }
  if (args.autoCollectEnabled && !args.autoCollectChannels.includes(args.channel)) {
    return lang({ ko: "자동 수집 대상에서 제외되어 있습니다.", en: "Excluded from auto collection." });
  }
  return lang({ ko: "저장된 게시물 성과가 없습니다.", en: "No stored post performance." });
}

function formatDateTime(value: unknown) {
  const text = toSafeString(value);
  if (!text) return "-";
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return text;
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// 종료된 run 기록(marketing_collect_runs)을 기존 수집 결과 표시 형태로 변환
function toRunDisplayResult(lastRun: SocialAutoCollectLastRun): CollectRunResult {
  const result = toUnknownRecord(lastRun.result);
  return {
    ok: toSafeString(lastRun.status) === "completed",
    post: {
      targetCount: Number(result.targetCount || 0),
      collectedCount: Number(result.collectedCount || 0),
      skippedCount: Number(result.skippedCount || 0),
      failedCount: Number(result.failedCount || 0),
      truncatedChannels: Array.isArray(result.truncatedChannels) ? (result.truncatedChannels as string[]) : [],
      results: Array.isArray(lastRun.channelResults) ? lastRun.channelResults : [],
    },
    account: {
      collectedCount: Number(result.accountCollectedCount || 0),
      failedCount: Number(result.accountFailedCount || 0),
    },
    tokenWarnings: lastRun.tokenWarnings || [],
    error: toSafeString(lastRun.error) || undefined,
  };
}

export function SocialPerformancePanel({ universeId, initialCampaignId = "" }: { universeId?: string; initialCampaignId?: string }) {
  const [channel, setChannel] = useState("__all__");
  const [days, setDays] = useState("30");
  const [data, setData] = useState<SocialPerformanceResponse | null>(null);
  const [collectResult, setCollectResult] = useState<CollectRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [togglingAutoCollect, setTogglingAutoCollect] = useState(false);
  const [savingAutoCollectChannels, setSavingAutoCollectChannels] = useState(false);
  const [autoCollectChannelDraft, setAutoCollectChannelDraft] = useState<string[]>(DEFAULT_AUTO_COLLECT_CHANNELS);
  const [linkedinVersionInput, setLinkedinVersionInput] = useState("");
  const [savingLinkedinVersion, setSavingLinkedinVersion] = useState(false);
  const [togglingLinkedinAnalytics, setTogglingLinkedinAnalytics] = useState(false);
  const mountedRef = useRef(true);
  const safeUniverseId = toSafeString(universeId);
  const campaignId = toSafeString(initialCampaignId);
  const apiChannel = channel === "__all__" ? "" : channel;
  const selectedChannels = useMemo(() => (apiChannel ? [apiChannel] : []), [apiChannel]);

  const loadPerformance = useCallback(async () => {
    if (!safeUniverseId) {
      setData(null);
      return;
    }

    try {
      setLoading(true);
      const response = await fetchClient.get<{ data?: SocialPerformanceResponse }>(SOCIAL_PERFORMANCE_API, {
        params: {
          universeId: safeUniverseId,
          channel: apiChannel,
          days,
          campaignId,
        },
      });
      setData(response.data?.data || null);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "소셜 성과 조회에 실패했습니다.", en: "Failed to load social performance." }),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [apiChannel, campaignId, days, safeUniverseId]);

  useEffect(
    function loadSocialPerformanceWhenFiltersChange() {
      // 필터 변경 시 저장된 성과 스냅샷을 조회한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadPerformance();
    },
    [loadPerformance],
  );

  useEffect(function trackMountedStateForPolling() {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(
    function syncLinkedinVersionFromSettings() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedinVersionInput(toSafeString(data?.autoCollect?.settings?.linkedinVersion));
    },
    [data?.autoCollect?.settings?.linkedinVersion],
  );

  useEffect(
    function syncAutoCollectChannelsFromSettings() {
      const storedChannels = data?.autoCollect?.settings?.channels;
      if (!Array.isArray(storedChannels)) return;
      // 서버 저장값이 바뀐 경우에만 편집 draft를 동기화한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoCollectChannelDraft(storedChannels.length > 0 ? storedChannels : DEFAULT_AUTO_COLLECT_CHANNELS);
    },
    [data?.autoCollect?.settings?.channels],
  );

  // 시작한 run이 종료(completed/failed)될 때까지 상태를 폴링한다. 언마운트/시간 초과 시 null 반환.
  const waitForRunCompletion = useCallback(
    async (runId: string) => {
      for (let attempt = 0; attempt < COLLECT_POLL_MAX_ATTEMPTS && mountedRef.current; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, COLLECT_POLL_INTERVAL_MS));
        try {
          const response = await fetchClient.get<{ data?: SocialPerformanceResponse }>(SOCIAL_PERFORMANCE_API, {
            params: { universeId: safeUniverseId, channel: apiChannel, days, campaignId },
          });
          const next = response.data?.data || null;
          if (mountedRef.current && next) setData(next);
          const lastRun = next?.autoCollect?.lastRun || null;
          if (toSafeString(lastRun?.runId) === runId && toSafeString(lastRun?.status) !== "running") return lastRun;
        } catch {
          // 일시적 조회 실패는 다음 폴링에서 재시도한다.
        }
      }
      return null;
    },
    [apiChannel, campaignId, days, safeUniverseId],
  );

  const collectPerformance = async () => {
    if (!safeUniverseId) return;

    try {
      setCollecting(true);
      setCollectResult(null);
      // 수집은 백그라운드로 시작되고 응답은 runId만 반환한다 — 완료는 폴링으로 확인.
      const response = await fetchClient.post<{ data?: { started?: boolean; runId?: string } }>(SOCIAL_PERFORMANCE_API, {
        universeId: safeUniverseId,
        channels: selectedChannels,
        sinceDays: Number(days || 30),
      });
      const runId = toSafeString(response.data?.data?.runId);
      if (!runId) {
        throw new Error(lang({ ko: "수집 시작 응답에 실행 ID가 없습니다.", en: "Missing run id in the start response." }));
      }

      toast.info(
        lang({
          ko: "성과 수집을 시작했습니다. 게시물 수에 따라 완료까지 수 분 걸릴 수 있습니다.",
          en: "Collection started. It may take a few minutes depending on the number of posts.",
        }),
      );

      const lastRun = await waitForRunCompletion(runId);
      if (!mountedRef.current) return;
      if (!lastRun) {
        toast.warning(
          lang({
            ko: "수집이 아직 진행 중입니다. 잠시 후 조회를 눌러 결과를 확인해주세요.",
            en: "Collection is still running. Reload later to check the result.",
          }),
        );
        return;
      }

      const result = toRunDisplayResult(lastRun);
      setCollectResult(result);
      if (result.ok) {
        toast.success(
          lang({
            ko: `성과 수집 완료: ${Number(result.post?.collectedCount || 0)}건`,
            en: "Social performance collection completed.",
          }),
        );
      } else {
        toast.warning(
          lang({
            ko: `수집 종료(일부 실패): ${Number(result.post?.collectedCount || 0)}건 수집 · ${Number(result.post?.failedCount || 0)}건 실패`,
            en: "Collection finished with failures.",
          }),
        );
      }
      await loadPerformance();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "소셜 성과 수집에 실패했습니다.", en: "Failed to collect social performance." }),
        ),
      );
    } finally {
      if (mountedRef.current) setCollecting(false);
    }
  };

  const toggleAutoCollect = async () => {
    if (!safeUniverseId) return;

    try {
      setTogglingAutoCollect(true);
      const nextEnabled = !(data?.autoCollect?.settings?.enabled === true);
      await fetchClient.post(SOCIAL_PERFORMANCE_API, {
        universeId: safeUniverseId,
        action: "update_settings",
        enabled: nextEnabled,
        channels: nextEnabled ? autoCollectChannelDraft : undefined,
      });
      toast.success(
        nextEnabled
          ? lang({ ko: "자동 수집을 켰습니다. 크론 스케줄에서 매일 수집됩니다.", en: "Auto collection enabled." })
          : lang({ ko: "자동 수집을 껐습니다.", en: "Auto collection disabled." }),
      );
      await loadPerformance();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "자동 수집 설정 변경에 실패했습니다.", en: "Failed to update auto collection settings." }),
        ),
      );
    } finally {
      setTogglingAutoCollect(false);
    }
  };

  const saveAutoCollectChannels = async () => {
    if (!safeUniverseId || autoCollectChannelDraft.length === 0) {
      toast.error(lang({ ko: "자동 수집 채널을 하나 이상 선택해 주세요.", en: "Select at least one auto-collect channel." }));
      return;
    }

    try {
      setSavingAutoCollectChannels(true);
      await fetchClient.post(SOCIAL_PERFORMANCE_API, {
        universeId: safeUniverseId,
        action: "update_settings",
        channels: autoCollectChannelDraft,
      });
      toast.success(lang({ ko: "자동 수집 채널을 저장했습니다.", en: "Auto-collect channels saved." }));
      await loadPerformance();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "자동 수집 채널 저장에 실패했습니다.", en: "Failed to save auto-collect channels." }),
        ),
      );
    } finally {
      setSavingAutoCollectChannels(false);
    }
  };

  const saveLinkedinVersion = async () => {
    if (!safeUniverseId) return;
    const value = linkedinVersionInput.trim();
    // Linkedin-Version 헤더는 YYYYMM 6자리 — 빈 값은 서버 기본값(env/코드) 사용을 의미한다.
    if (value && !/^\d{6}$/.test(value)) {
      toast.error(lang({ ko: "LinkedIn-Version은 YYYYMM 형식의 6자리 숫자여야 합니다.", en: "LinkedIn-Version must be a 6-digit YYYYMM value." }));
      return;
    }

    try {
      setSavingLinkedinVersion(true);
      await fetchClient.post(SOCIAL_PERFORMANCE_API, {
        universeId: safeUniverseId,
        action: "update_settings",
        linkedinVersion: value,
      });
      toast.success(
        value
          ? lang({ ko: `LinkedIn API 버전을 ${value}로 저장했습니다.`, en: "LinkedIn API version saved." })
          : lang({ ko: "LinkedIn API 버전을 기본값으로 되돌렸습니다.", en: "LinkedIn API version reset to default." }),
      );
      await loadPerformance();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "LinkedIn API 버전 저장에 실패했습니다.", en: "Failed to save LinkedIn API version." }),
        ),
      );
    } finally {
      setSavingLinkedinVersion(false);
    }
  };

  const toggleLinkedinMemberAnalytics = async () => {
    if (!safeUniverseId) return;
    const nextEnabled = !(data?.autoCollect?.settings?.linkedinMemberAnalyticsEnabled === true);

    try {
      setTogglingLinkedinAnalytics(true);
      await fetchClient.post(SOCIAL_PERFORMANCE_API, {
        universeId: safeUniverseId,
        action: "update_settings",
        linkedinMemberAnalyticsEnabled: nextEnabled,
        channels: nextEnabled
          ? Array.from(new Set([...(data?.autoCollect?.settings?.channels || DEFAULT_AUTO_COLLECT_CHANNELS), "linkedin"]))
          : undefined,
      });
      toast.success(
        nextEnabled
          ? lang({
              ko: "LinkedIn 분석 권한 요청을 켰습니다. API 승인 후 LinkedIn 계정을 다시 연결하세요.",
              en: "LinkedIn analytics scopes enabled. Reconnect after API approval.",
            })
          : lang({ ko: "LinkedIn 분석 권한 요청을 껐습니다.", en: "LinkedIn analytics scopes disabled." }),
      );
      await loadPerformance();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "LinkedIn 분석 권한 설정 변경에 실패했습니다.", en: "Failed to update LinkedIn analytics scopes." }),
        ),
      );
    } finally {
      setTogglingLinkedinAnalytics(false);
    }
  };

  const summaryRows = data?.summaryByChannel || [];
  const summaryByChannel = new Map(summaryRows.map((row) => [toSafeString(row.channel), row]));
  const accountSummaryByChannel = new Map(
    (data?.accountSummaryByChannel || []).map((row) => [toSafeString(row.channel), row]),
  );
  const visiblePerformanceChannels = apiChannel
    ? PERFORMANCE_CHANNELS.filter((option) => option.value === apiChannel)
    : PERFORMANCE_CHANNELS;
  const topPosts = data?.topPosts || [];
  const autoCollectSettings = data?.autoCollect?.settings || null;
  const autoCollectEnabled = autoCollectSettings?.enabled === true;
  const autoCollectChannels = autoCollectSettings?.channels || [];
  const linkedinMemberAnalyticsEnabled = autoCollectSettings?.linkedinMemberAnalyticsEnabled === true;
  const linkedinCapabilities = data?.autoCollect?.linkedinCapabilities;
  const lastRun = data?.autoCollect?.lastRun || null;
  const lastRunResult = toUnknownRecord(lastRun?.result);
  const tokenWarnings = lastRun?.tokenWarnings || [];
  const lastIssueByChannel = new Map(
    (lastRun?.channelResults || []).map((item) => [toSafeString(item.channel), item]),
  );

  if (!safeUniverseId) {
    return (
      <p className="rounded-lg border border-border bg-surface p-4 text-sm text-secondary-text">
        <Lang
          text={{
            ko: "성과와 자동 수집 설정은 유니버스 단위입니다. 화면 상단에서 All My Universe (amu)를 선택해 주세요.",
            en: "Performance and auto-collect settings are universe-scoped. Select All My Universe (amu) at the top of the page.",
          }}
        />
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-text">05 · social performance</span>
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold tracking-tight text-primary-text">
              <Lang text={{ ko: "소셜 콘텐츠 성과", en: "Social content performance" }} />
            </h4>
            {loading ? (
              <RefreshCw className="icon-xs animate-spin text-muted-text" />
            ) : (
              <BarChart3 className="icon-xs text-muted-text" />
            )}
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Select value={channel} onValueChange={(value) => setChannel(Array.isArray(value) ? value[0] || "__all__" : value)}>
            <SelectTrigger className="min-w-[9rem] flex-1 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={days} onValueChange={(value) => setDays(Array.isArray(value) ? value[0] || "30" : value)}>
            <SelectTrigger className="min-w-[6rem] flex-1 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="xs" onClick={() => void loadPerformance()} disabled={loading || collecting}>
            <RefreshCw className={cn("icon-xxs", loading && "animate-spin")} />
            <span>{lang({ ko: "조회", en: "Load" })}</span>
          </Button>
          <Button size="xs" onClick={() => void collectPerformance()} disabled={!safeUniverseId || loading || collecting}>
            <RefreshCw className={cn("icon-xxs", collecting && "animate-spin")} />
            <span>{lang({ ko: "성과 수집", en: "Collect" })}</span>
          </Button>
        </div>
      </div>

      {campaignId ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-5 text-secondary-text">
          <p className="font-semibold text-primary-text"><Lang text={{ ko: "상품 캠페인 성과 범위", en: "Product campaign performance scope" }} /></p>
          <p className="mt-1 break-all font-mono">campaignId: {campaignId}</p>
          <p className="mt-1">
            <Lang text={{ ko: `게시물 ${formatNumber(data?.attribution?.matchedPostRows)}건 · 귀속 누락 ${formatNumber(data?.attribution?.missingAttributionRows)}건 · ${data?.attribution?.metricBasis || "provider snapshot"}`, en: `${formatNumber(data?.attribution?.matchedPostRows)} posts · ${formatNumber(data?.attribution?.missingAttributionRows)} missing attribution · ${data?.attribution?.metricBasis || "provider snapshot"}` }} />
          </p>
        </div>
      ) : null}

      <div className={REVIEW_PANEL_CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="icon-xs text-muted-text" />
              <h5 className="text-sm font-semibold text-primary-text">
                <Lang text={{ ko: "자동 수집", en: "Auto collection" }} />
              </h5>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em]",
                  autoCollectEnabled ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-text",
                )}
              >
                {autoCollectEnabled ? "ON" : "OFF"}
              </span>
            </div>
            <p className="text-xs leading-5 text-secondary-text">
              {autoCollectEnabled ? (
                <Lang
                  text={{
                    ko: `매일 1회(KST 새벽) 최근 ${Number(autoCollectSettings?.rollingDays || 14)}일 발행물 수집 · 일요일 ${Number(autoCollectSettings?.weeklyDeepDays || 0) || "-"}일 보정`,
                    en: `Daily rolling ${Number(autoCollectSettings?.rollingDays || 14)}d · Sunday deep ${Number(autoCollectSettings?.weeklyDeepDays || 0) || "-"}d`,
                  }}
                />
              ) : (
                <Lang
                  text={{
                    ko: "자동 수집이 꺼져 있습니다. 켜면 크론 스케줄에서 매일 스냅샷을 적재합니다.",
                    en: "Auto collection is off. Turn it on to accumulate daily snapshots via cron.",
                  }}
                />
              )}
            </p>
            <p className="text-xs leading-5 text-muted-text">
              {toSafeString(lastRun?.status) === "running" ? (
                <>
                  <Lang text={{ ko: "수집 진행 중", en: "Collecting" }} />
                  {" · "}
                  {toSafeString(lastRun?.trigger) || "-"}
                  {" · "}
                  <Lang text={{ ko: "시작", en: "Started" }} />: {formatDateTime(lastRun?.startedAt)}
                </>
              ) : (
                <>
                  <Lang text={{ ko: "마지막 실행", en: "Last run" }} />: {formatDateTime(lastRun?.finishedAt)}
                  {lastRun ? (
                    <>
                      {" · "}
                      {toSafeString(lastRun.trigger) || "-"}
                      {" · "}
                      {formatNumber(lastRunResult.collectedCount)}/{formatNumber(lastRunResult.targetCount)}
                      {Number(lastRunResult.failedCount || 0) > 0 ? ` · failed ${formatNumber(lastRunResult.failedCount)}` : ""}
                    </>
                  ) : null}
                </>
              )}
            </p>
            {autoCollectEnabled ? (
              <p className="text-xs leading-5 text-muted-text">
                <Lang text={{ ko: "자동 수집 채널", en: "Auto-collect channels" }} />: {" "}
                {autoCollectChannels.map(channelLabel).join(", ") || "-"}
              </p>
            ) : null}
            <div className="space-y-2 rounded-md border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-medium text-primary-text">
                <Lang text={{ ko: "자동 수집 채널 선택", en: "Select auto-collect channels" }} />
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {PERFORMANCE_CHANNELS.map((option) => (
                  <label key={option.value} className="inline-flex items-center gap-2 text-xs text-secondary-text">
                    <Checkbox
                      checked={autoCollectChannelDraft.includes(option.value)}
                      onCheckedChange={(checked) =>
                        setAutoCollectChannelDraft((current) =>
                          checked
                            ? Array.from(new Set([...current, option.value]))
                            : current.filter((channel) => channel !== option.value),
                        )
                      }
                      aria-label={option.label}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xxs leading-5 text-muted-text">
                  <Lang
                    text={{
                      ko: "LinkedIn은 분석 API 승인 전까지 선택해도 권한 사유로 건너뜁니다.",
                      en: "LinkedIn is skipped until its analytics API scopes are approved.",
                    }}
                  />
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void saveAutoCollectChannels()}
                  disabled={savingAutoCollectChannels || loading || autoCollectChannelDraft.length === 0}
                >
                  <span>{lang({ ko: "채널 저장", en: "Save channels" })}</span>
                </Button>
              </div>
            </div>
            {tokenWarnings.slice(0, 3).map((warning, index) => (
              <p key={`token-warning-${index}`} className="break-all text-xs leading-5 text-amber-600 dark:text-amber-400">
                {warning}
              </p>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-text">LinkedIn-Version</span>
              <Input
                size="xs"
                value={linkedinVersionInput}
                onChange={(event) => setLinkedinVersionInput(event.target.value)}
                placeholder={lang({ ko: "비우면 기본값", en: "Default if empty" })}
                maxLength={6}
                inputContainerClassName="w-32"
                className="font-mono"
              />
              <Button
                variant="outline"
                size="xs"
                onClick={() => void saveLinkedinVersion()}
                disabled={!safeUniverseId || savingLinkedinVersion || loading}
              >
                <span>{lang({ ko: "저장", en: "Save" })}</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-text">
                LinkedIn Member Analytics
              </span>
              <span className="text-xs text-muted-text">
                {lang({
                  ko: `게시물 ${linkedinCapabilities?.postAnalytics ? "준비" : "꺼짐"} · 프로필 ${linkedinCapabilities?.profileAnalytics ? "준비" : "꺼짐"}`,
                  en: `post ${linkedinCapabilities?.postAnalytics ? "ready" : "off"} · profile ${linkedinCapabilities?.profileAnalytics ? "ready" : "off"}`,
                })}
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => void toggleLinkedinMemberAnalytics()}
                disabled={!safeUniverseId || togglingLinkedinAnalytics || loading}
              >
                <span>
                  {linkedinMemberAnalyticsEnabled
                    ? lang({ ko: "분석 권한 요청 끄기", en: "Disable analytics scopes" })
                    : lang({ ko: "승인 후 분석 권한 요청 켜기", en: "Enable after approval" })}
                </span>
              </Button>
              {linkedinCapabilities?.reconnectRequired ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  <Lang text={{ ko: "LinkedIn 계정 재연결 필요", en: "LinkedIn reconnection required" }} />
                </span>
              ) : null}
            </div>
          </div>

          <Button
            variant={autoCollectEnabled ? "outline" : "primary"}
            size="xs"
            onClick={() => void toggleAutoCollect()}
            disabled={!safeUniverseId || togglingAutoCollect || loading}
          >
            <RefreshCw className={cn("icon-xxs", togglingAutoCollect && "animate-spin")} />
            <span>
              {autoCollectEnabled
                ? lang({ ko: "자동 수집 끄기", en: "Disable" })
                : lang({ ko: "자동 수집 켜기", en: "Enable" })}
            </span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visiblePerformanceChannels.map((option) => {
          const row = summaryByChannel.get(option.value);
          const metrics = toUnknownRecord(row?.metrics);
          const hasLinkedinMemberAnalytics =
            option.value === "linkedin" && (row?.metricBasis || []).includes("linkedin_member_post_analytics");
          const account = accountSummaryByChannel.get(option.value);
          const accountMetrics = toUnknownRecord(account?.metrics);
          const primaryValue =
            option.value === "naver_blog"
              ? metrics.published
              : option.value === "linkedin" && !hasLinkedinMemberAnalytics
                ? metrics.engagements
                : metrics.impressions;
          const primaryLabel =
            option.value === "naver_blog"
              ? lang({ ko: "발행 확인", en: "Published" })
              : option.value === "linkedin"
                ? hasLinkedinMemberAnalytics
                  ? lang({ ko: "노출", en: "Impressions" })
                  : lang({ ko: "좋아요·댓글", en: "Likes/comments" })
                : lang({ ko: "노출/조회 기준", en: "Impressions/views" });
          return (
            <div key={option.value} className={REVIEW_PANEL_CARD_CLASS}>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-text">
                  {option.label}
                </p>
                {row ? (
                  <>
                    <p className="mt-2 font-mono text-2xl font-semibold leading-none text-primary-text">
                      {formatNumber(primaryValue)}
                    </p>
                    <p className="mt-1 text-xs text-secondary-text">{primaryLabel}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-secondary-text">
                      <span>{lang({ ko: "반응", en: "Eng." })}: {formatNumber(metrics.engagements)}</span>
                      <span>
                        {lang({ ko: "반응률", en: "Rate" })}: {option.value === "linkedin" && !hasLinkedinMemberAnalytics ? "—" : formatRate(metrics.engagementRate)}
                      </span>
                      <span>
                        {option.value === "linkedin" ? lang({ ko: "리액션", en: "Reactions" }) : lang({ ko: "좋아요", en: "Likes" })}: {formatNumber(option.value === "linkedin" ? metrics.reactions : metrics.likes)}
                      </span>
                      <span>{lang({ ko: "댓글", en: "Comments" })}: {formatNumber(metrics.comments)}</span>
                      {option.value === "linkedin" && hasLinkedinMemberAnalytics ? (
                        <>
                          <span>{lang({ ko: "도달", en: "Reach" })}: {formatNumber(metrics.reach)}</span>
                          <span>{lang({ ko: "재공유", en: "Reshares" })}: {formatNumber(metrics.reshares)}</span>
                        </>
                      ) : null}
                      {option.value === "threads" || option.value === "instagram" || option.value === "linkedin" ? (
                        <span>{lang({ ko: "팔로워", en: "Followers" })}: {account ? formatNumber(accountMetrics.followers) : "—"}</span>
                      ) : null}
                      {option.value === "instagram" ? (
                        <span>{lang({ ko: "미디어", en: "Media" })}: {account ? formatNumber(accountMetrics.mediaCount) : "—"}</span>
                      ) : null}
                    </div>
                  </>
                ) : account ? (
                  <div className="mt-5 space-y-2">
                    <p className="font-mono text-2xl font-semibold leading-none text-primary-text">
                      {formatNumber(accountMetrics.followers)}
                    </p>
                    <p className="text-xs text-secondary-text">
                      {lang({ ko: "팔로워 · 계정 스냅샷", en: "Followers · account snapshot" })}
                    </p>
                    {option.value === "instagram" ? (
                      <p className="text-xs text-secondary-text">
                        {lang({ ko: "미디어", en: "Media" })}: {formatNumber(accountMetrics.mediaCount)}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 space-y-2">
                    <p className="font-mono text-2xl font-semibold leading-none text-muted-text">—</p>
                    <p className="text-xs leading-5 text-amber-600 dark:text-amber-400">
                      {getMissingChannelMessage({
                        channel: option.value,
                        autoCollectEnabled,
                        autoCollectChannels,
                        linkedinCapabilities,
                        linkedinMemberAnalyticsEnabled,
                        lastIssue: lastIssueByChannel.get(option.value),
                      })}
                    </p>
                  </div>
                )}
            </div>
          );
        })}
      </div>

      {collectResult ? (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs leading-5 text-secondary-text">
          <p className="font-medium text-primary-text">
            {lang({ ko: "최근 수집", en: "Latest collection" })}: {formatNumber(collectResult.post?.collectedCount)} /{" "}
            {formatNumber(collectResult.post?.targetCount)}
          </p>
          <p>
            skipped {formatNumber(collectResult.post?.skippedCount)} · failed {formatNumber(collectResult.post?.failedCount)}
            {Number(collectResult.account?.collectedCount || 0) > 0
              ? ` · ${lang({ ko: "계정 스냅샷", en: "account" })} ${formatNumber(collectResult.account?.collectedCount)}`
              : ""}
          </p>
          {(collectResult.post?.truncatedChannels || []).length > 0 ? (
            <p className="text-amber-600 dark:text-amber-400">
              {lang({ ko: "조회 상한 도달 채널", en: "Truncated channels" })}: {(collectResult.post?.truncatedChannels || []).join(", ")}
            </p>
          ) : null}
          {(collectResult.post?.results || [])
            .filter((item) => item.status === "failed" || item.status === "skipped")
            .slice(0, 4)
            .map((item, index) => (
              <p key={`${item.channel}-${index}`} className="break-all">
                {channelLabel(item.channel)} {item.status}: {toSafeString(item.reason || item.error) || "-"}
              </p>
            ))}
          {(collectResult.tokenWarnings || []).slice(0, 3).map((warning, index) => (
            <p key={`collect-token-warning-${index}`} className="break-all text-amber-600 dark:text-amber-400">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className={REVIEW_PANEL_CARD_CLASS}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h5 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "상위 콘텐츠", en: "Top posts" }} />
          </h5>
          <span className="font-mono text-[11px] text-muted-text">
            {Number(data?.days || days)}d · {formatNumber(data?.itemCount)} rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="text-muted-text">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">{lang({ ko: "채널", en: "Channel" })}</th>
                <th className="py-2 pr-3 font-medium">entity</th>
                <th className="py-2 pr-3 font-medium">{lang({ ko: "노출", en: "Impr." })}</th>
                <th className="py-2 pr-3 font-medium">{lang({ ko: "반응", en: "Eng." })}</th>
                <th className="py-2 pr-3 font-medium">{lang({ ko: "반응률", en: "Rate" })}</th>
                <th className="py-2 pr-3 font-medium">{lang({ ko: "발행/수집", en: "Published/collected" })}</th>
                <th className="py-2 font-medium">{lang({ ko: "링크", en: "Link" })}</th>
              </tr>
            </thead>
            <tbody>
              {topPosts.map((post) => {
                const metrics = toUnknownRecord(post.metrics);
                const meta = toUnknownRecord(post.meta);
                const permalink = toSafeString(meta.permalink);
                return (
                  <tr key={toSafeString(post.entityId)} className="border-b border-border/70 text-secondary-text">
                    <td className="py-2 pr-3 font-medium text-primary-text">{channelLabel(post.channel)}</td>
                    <td className="max-w-[16rem] truncate py-2 pr-3 font-mono">{toSafeString(post.entityId)}</td>
                    <td className="py-2 pr-3 font-mono">{formatNumber(metrics.impressions)}</td>
                    <td className="py-2 pr-3 font-mono">{formatNumber(metrics.engagements)}</td>
                    <td className="py-2 pr-3 font-mono">{formatRate(metrics.engagementRate)}</td>
                    <td className="py-2 pr-3">
                      <span className="block">{toSafeString(meta.publishedAt) || "-"}</span>
                      <span className="block text-muted-text">{toSafeString(meta.collectedAt) || toSafeString(post.date)}</span>
                    </td>
                    <td className="py-2">
                      {permalink ? (
                        <a
                          href={permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        >
                          <ExternalLink className="icon-xxs" />
                          <span>{lang({ ko: "열기", en: "Open" })}</span>
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
              {!topPosts.length ? (
                <tr>
                  <td className="py-8 text-center text-muted-text" colSpan={7}>
                    <Lang text={{ ko: "표시할 콘텐츠 성과가 없습니다.", en: "No post performance to show." }} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className={cn(REVIEW_PANEL_LABEL_CLASS, "leading-5")}>
        <Lang
          text={{
            ko: "Threads/Instagram은 provider insights API, LinkedIn은 가능한 경우 socialActions, Naver Blog는 발행 URL 검증/GA4 보조 분석을 기준으로 저장합니다.",
            en: "Threads/Instagram use provider insights APIs; LinkedIn uses socialActions when available; Naver Blog stores published URL verification and relies on GA4-assisted analysis.",
          }}
        />
      </p>
    </section>
  );
}

export default SocialPerformancePanel;
