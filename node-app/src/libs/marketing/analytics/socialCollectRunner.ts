import "server-only";

import {
  finishMarketingCollectRun,
  getActiveMarketingCollectRun,
  getLatestMarketingCollectRun,
  getMarketingSocialCollectSettings,
  listEnabledMarketingSocialCollectSettings,
  startMarketingCollectRun,
} from "libs/database/marketing";
import {
  collectSocialAccountSnapshots,
  collectSocialPerformanceSnapshots,
  SOCIAL_PERFORMANCE_CHANNELS,
} from "libs/marketing/analytics/socialCollectService";
import { getSocialTokenWarnings, refreshThreadsTokenIfDue } from "libs/marketing/analytics/socialTokenService";
import { getLinkedInMemberTokenStatus } from "libs/database/secure/linkedinMemberTokens";
import {
  LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE,
  LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE,
} from "libs/api/thirdparty/linkedin/linkedinMemberAnalyticsClient";
import { toErrorMessage, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";
import type { MarketingCollectRunTrigger } from "models/marketing";

/**
 * @docHint
 * @purpose universe 단위 소셜 성과 자동 수집 오케스트레이션 — 토큰 갱신 → 게시물/계정 스냅샷 수집 → 실행 기록 저장
 * @process 설정(enabled/channels/rollingDays/weeklyDeepDays/linkedinVersion) 해석 → 중복 실행 가드 → run(running) 생성 → Threads 토큰 D-15 갱신 → collectSocialPerformanceSnapshots + collectSocialAccountSnapshots → 토큰 경고 요약 → run 종료 기록. 수집은 수 분 단위라 start*는 runId만 즉시 반환하고 완료는 백그라운드에서 기록한다.
 * @domain marketing
 * @scope server
 */

const SOCIAL_REPORT_TIME_ZONE = "Asia/Seoul";
const DEFAULT_AUTO_COLLECT_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"] as const;

function isDeepDayKst(now = new Date()) {
  // 주 1회(일요일 KST) 장기 window 보정 수집
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: SOCIAL_REPORT_TIME_ZONE, weekday: "short" }).format(now);
  return weekday === "Sun";
}

type SocialCollectArgs = {
  universeId: string;
  trigger: MarketingCollectRunTrigger;
  sinceDays?: number;
  channels?: string[];
  dryRun?: boolean;
};

type SocialCollectPlan = {
  universeId: string;
  trigger: MarketingCollectRunTrigger;
  channels: string[];
  sinceDays: number;
  dryRun: boolean;
  linkedinVersion: string;
  linkedinMemberAnalyticsEnabled: boolean;
};

async function resolveCollectPlan(args: SocialCollectArgs): Promise<SocialCollectPlan> {
  const universeId = toSafeString(args.universeId);
  const settings = await getMarketingSocialCollectSettings(universeId);
  const settingsChannels = Array.isArray(settings?.channels) && settings.channels.length > 0 ? settings.channels : [];
  const channels =
    args.channels && args.channels.length > 0
      ? args.channels
      : settingsChannels.length > 0
        ? settingsChannels
        : settings && args.trigger === "cron"
          ? [...DEFAULT_AUTO_COLLECT_CHANNELS]
        : [...SOCIAL_PERFORMANCE_CHANNELS];
  const rollingDays = Number(settings?.rollingDays || 14);
  const weeklyDeepDays = Number(settings?.weeklyDeepDays || 0);
  const sinceDays = args.sinceDays || (isDeepDayKst() && weeklyDeepDays > 0 ? weeklyDeepDays : rollingDays);

  return {
    universeId,
    trigger: args.trigger,
    channels,
    sinceDays,
    dryRun: args.dryRun === true,
    linkedinVersion: toSafeString(settings?.linkedinVersion),
    linkedinMemberAnalyticsEnabled: settings?.linkedinMemberAnalyticsEnabled === true,
  };
}

// 실행 본체 — 내부에서 모든 예외를 흡수하고 run 종료 상태를 기록한다. (백그라운드 실행 시 unhandled rejection 방지)
async function executeCollectRun(runId: string, plan: SocialCollectPlan) {
  const { universeId, channels, sinceDays, dryRun } = plan;
  const tokenWarnings: string[] = [];
  let postResult: UnknownRecord = {};
  let accountResult: UnknownRecord = {};
  let error = "";

  try {
    // 1. Threads 토큰 갱신 (D-15 또는 만료 메타 부트스트랩) — dry-run에서는 상태 변경을 하지 않는다.
    if (!dryRun && channels.includes("threads")) {
      const refresh = await refreshThreadsTokenIfDue(universeId);
      if (refresh.status === "failed") {
        tokenWarnings.push(`threads: 토큰 자동 갱신 실패 — ${toSafeString(refresh.error).slice(0, 160)}`);
      }
    }

    // 2. 게시물 성과 스냅샷
    postResult = toUnknownRecord(
      await collectSocialPerformanceSnapshots({
        universeId,
        channels,
        sinceDays,
        dryRun,
        linkedinVersion: plan.linkedinVersion,
        linkedinMemberAnalyticsEnabled: plan.linkedinMemberAnalyticsEnabled,
      }),
    );

    // 3. 계정 스냅샷 (Threads/Instagram + 승인된 LinkedIn profile analytics)
    accountResult = toUnknownRecord(
      await collectSocialAccountSnapshots({
        universeId,
        channels,
        dryRun,
        linkedinVersion: plan.linkedinVersion,
        linkedinMemberAnalyticsEnabled: plan.linkedinMemberAnalyticsEnabled,
      }),
    );

    // 4. 토큰 만료 경고 요약
    tokenWarnings.push(...(await getSocialTokenWarnings(universeId)));
  } catch (runError) {
    error = toErrorMessage(runError, String(runError));
    logger.warn("[socialCollectRunner] run failed", { universeId, trigger: plan.trigger, error });
  }

  const channelResults = [
    ...(Array.isArray(accountResult.results) ? (accountResult.results as UnknownRecord[]) : []),
    ...(Array.isArray(postResult.results) ? (postResult.results as UnknownRecord[]) : []),
  ]
    .filter((item) => item.status === "failed" || item.status === "skipped")
    .slice(0, 50);
  const ok = !error && postResult.ok !== false && accountResult.ok !== false;

  try {
    await finishMarketingCollectRun({
      runId,
      ok,
      result: {
        ok,
        publishLogCount: Number(postResult.publishLogCount || 0),
        targetCount: Number(postResult.targetCount || 0),
        collectedCount: Number(postResult.collectedCount || 0),
        skippedCount: Number(postResult.skippedCount || 0),
        failedCount: Number(postResult.failedCount || 0),
        linkedinBudgetDeferredCount: Number(postResult.linkedinBudgetDeferredCount || 0),
        linkedinApiCallBudget: Number(postResult.linkedinApiCallBudget || 0),
        truncatedChannels: Array.isArray(postResult.truncatedChannels) ? postResult.truncatedChannels : [],
        accountCollectedCount: Number(accountResult.collectedCount || 0),
        accountFailedCount: Number(accountResult.failedCount || 0),
      },
      channelResults,
      tokenWarnings,
      error,
    });
  } catch (finishError) {
    logger.error("[socialCollectRunner] finish run record failed", {
      universeId,
      runId,
      error: toErrorMessage(finishError, String(finishError)),
    });
  }

  return {
    ok,
    busy: false,
    runId,
    universeId,
    trigger: plan.trigger,
    sinceDays,
    channels,
    dryRun,
    post: postResult,
    account: accountResult,
    tokenWarnings,
    error: error || undefined,
  };
}

type SocialCollectRunResult = Awaited<ReturnType<typeof executeCollectRun>>;

function buildBusyResult(plan: SocialCollectPlan, activeRunId: string): SocialCollectRunResult {
  return {
    ok: false,
    busy: true,
    runId: activeRunId,
    universeId: plan.universeId,
    trigger: plan.trigger,
    sinceDays: plan.sinceDays,
    channels: plan.channels,
    dryRun: plan.dryRun,
    post: {},
    account: {},
    tokenWarnings: [],
    error: "collect_already_running",
  };
}

// 동기 실행 — 크론 sync 모드/agent 경로에서 사용. 완료까지 대기한다.
export async function runSocialCollectForUniverse(args: SocialCollectArgs): Promise<SocialCollectRunResult> {
  const plan = await resolveCollectPlan(args);
  const active = await getActiveMarketingCollectRun(plan.universeId);
  if (active) return buildBusyResult(plan, toSafeString(active.runId));

  const run = await startMarketingCollectRun({
    universeId: plan.universeId,
    trigger: plan.trigger,
    params: { sinceDays: plan.sinceDays, channels: plan.channels, dryRun: plan.dryRun },
  });
  return await executeCollectRun(toSafeString(run.runId), plan);
}

// 백그라운드 시작 — run(running) 기록을 만든 뒤 runId를 즉시 반환한다.
// 호출한 라우트는 completion을 after()로 넘겨 응답 이후에도 수집이 완료되도록 한다.
export async function startSocialCollectForUniverse(args: SocialCollectArgs) {
  const plan = await resolveCollectPlan(args);
  const active = await getActiveMarketingCollectRun(plan.universeId);
  if (active) {
    return {
      started: false as const,
      busy: true as const,
      runId: toSafeString(active.runId),
      startedAt: active.startedAt ? new Date(active.startedAt).toISOString() : null,
      universeId: plan.universeId,
      sinceDays: plan.sinceDays,
      channels: plan.channels,
      dryRun: plan.dryRun,
      completion: Promise.resolve(buildBusyResult(plan, toSafeString(active.runId))),
    };
  }

  const run = await startMarketingCollectRun({
    universeId: plan.universeId,
    trigger: plan.trigger,
    params: { sinceDays: plan.sinceDays, channels: plan.channels, dryRun: plan.dryRun },
  });
  const runId = toSafeString(run.runId);

  return {
    started: true as const,
    busy: false as const,
    runId,
    startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : new Date().toISOString(),
    universeId: plan.universeId,
    sinceDays: plan.sinceDays,
    channels: plan.channels,
    dryRun: plan.dryRun,
    completion: executeCollectRun(runId, plan),
  };
}

function summarizeRuns(runs: SocialCollectRunResult[]) {
  return runs.map((run) => ({
    universeId: run.universeId,
    runId: run.runId,
    ok: run.ok,
    busy: run.busy,
    sinceDays: run.sinceDays,
    collectedCount: Number(toUnknownRecord(run.post).collectedCount || 0),
    failedCount: Number(toUnknownRecord(run.post).failedCount || 0),
    tokenWarnings: run.tokenWarnings,
    error: run.error,
  }));
}

async function collectEnabledUniversesSequentially(args: { trigger: MarketingCollectRunTrigger; sinceDays?: number; dryRun?: boolean }, universeIds: string[]) {
  const runs: SocialCollectRunResult[] = [];

  // universe 순차 실행 — 동시 실행은 provider quota와 DB 부하를 불필요하게 키운다.
  for (const universeId of universeIds) {
    runs.push(
      await runSocialCollectForUniverse({
        universeId,
        trigger: args.trigger,
        sinceDays: args.sinceDays,
        dryRun: args.dryRun,
      }),
    );
  }

  return { ok: runs.every((run) => run.ok), universeCount: universeIds.length, runs: summarizeRuns(runs) };
}

// 동기 실행(enabled 전체) — 완료까지 대기. 크론 sync 모드 전용.
export async function runSocialCollectForEnabledUniverses(args: { trigger: MarketingCollectRunTrigger; sinceDays?: number; dryRun?: boolean }) {
  const settingsList = await listEnabledMarketingSocialCollectSettings();
  const universeIds = settingsList.map((settings) => toSafeString(settings.universeId));
  return await collectEnabledUniversesSequentially(args, universeIds);
}

// 백그라운드 시작(enabled 전체) — 대상 universe 목록만 즉시 반환하고 순차 수집은 completion에서 진행한다.
export async function startSocialCollectForEnabledUniverses(args: { trigger: MarketingCollectRunTrigger; sinceDays?: number; dryRun?: boolean }) {
  const settingsList = await listEnabledMarketingSocialCollectSettings();
  const universeIds = settingsList.map((settings) => toSafeString(settings.universeId));

  return {
    accepted: true as const,
    universeCount: universeIds.length,
    universeIds,
    completion: collectEnabledUniversesSequentially(args, universeIds),
  };
}

export async function getSocialCollectStatus(universeId: string) {
  const [settings, lastRun, linkedinToken] = await Promise.all([
    getMarketingSocialCollectSettings(universeId),
    getLatestMarketingCollectRun(universeId),
    getLinkedInMemberTokenStatus(universeId),
  ]);
  const linkedinScopes = new Set(linkedinToken.exists && Array.isArray(linkedinToken.scope) ? linkedinToken.scope : []);

  return {
    settings: settings
      ? {
          enabled: settings.enabled === true,
          channels: Array.isArray(settings.channels) && settings.channels.length > 0 ? settings.channels : [...DEFAULT_AUTO_COLLECT_CHANNELS],
          rollingDays: Number(settings.rollingDays || 14),
          weeklyDeepDays: Number(settings.weeklyDeepDays || 0),
          linkedinVersion: toSafeString(settings.linkedinVersion),
          linkedinMemberAnalyticsEnabled: settings.linkedinMemberAnalyticsEnabled === true,
          updatedAt: settings.updatedAt ? new Date(settings.updatedAt).toISOString() : null,
        }
      : null,
    linkedinCapabilities: {
      tokenConnected: linkedinToken.exists === true,
      tokenExpired: linkedinToken.exists === true ? linkedinToken.expired === true : false,
      postAnalytics: linkedinScopes.has(LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE),
      profileAnalytics: linkedinScopes.has(LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE),
      reconnectRequired:
        settings?.linkedinMemberAnalyticsEnabled === true &&
        (!linkedinScopes.has(LINKEDIN_MEMBER_POST_ANALYTICS_SCOPE) ||
          !linkedinScopes.has(LINKEDIN_MEMBER_PROFILE_ANALYTICS_SCOPE)),
    },
    lastRun: lastRun
      ? {
          runId: toSafeString(lastRun.runId),
          trigger: toSafeString(lastRun.trigger),
          // 레거시 문서(status 부재)는 종료 시점에 생성된 기록이므로 completed로 간주한다.
          status: toSafeString(lastRun.status) || "completed",
          startedAt: lastRun.startedAt ? new Date(lastRun.startedAt).toISOString() : null,
          finishedAt: lastRun.finishedAt ? new Date(lastRun.finishedAt).toISOString() : null,
          params: toUnknownRecord(lastRun.params),
          result: toUnknownRecord(lastRun.result),
          channelResults: Array.isArray(lastRun.channelResults) ? lastRun.channelResults : [],
          tokenWarnings: Array.isArray(lastRun.tokenWarnings) ? lastRun.tokenWarnings : [],
          error: toSafeString(lastRun.error),
        }
      : null,
  };
}
