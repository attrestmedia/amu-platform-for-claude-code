import "server-only";
import { listMarketingKeywordCandidates } from "libs/database/marketing";
import {
  findRecentNaverTrendSnapshot,
  mergeKeywordCandidateNaverMetrics,
  upsertMarketingNaverTrendSnapshot,
} from "libs/database/marketing/naverTrendRepo";
import {
  resolveNaverDatalabConnection,
  runDatalabSearchTrend,
  type DatalabSeriesPoint,
  type NaverDatalabConnection,
  type NaverTimeUnit,
} from "libs/server-utils/marketing/naver/naverDatalabClient";
import {
  classifySeasonality,
  summarizeAgainstAnchor,
  type KeywordTrendSummary,
} from "libs/server-utils/marketing/naver/naverTrendAnalysis";
import { buildSerpCompetitionSummary, searchNaverBlog } from "libs/server-utils/marketing/naver/naverSearchClient";
import { getMarketingKeywordProfile, getMarketingKeywordSettings } from "libs/database/marketing/keywordProfileRepo";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 네이버 데이터랩/검색 기반 키워드 수요·경쟁 측정 오케스트레이션 (캐시 우선, 앵커 배치)
 * @process 스냅샷 캐시 확인 → 미스만 앵커 포함 4개 배치로 datalab 조회 → 요약 저장 → 후보 metrics 보강
 * @domain marketing
 * @scope server
 */

const TREND_MONTHS = 24;
const TREND_CACHE_DAYS = 7;
const CANDIDATES_PER_REQUEST = 4; // 앵커 1그룹 + 후보 4그룹 = datalab 최대 5그룹

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultTrendRange() {
  const end = new Date();
  end.setDate(1);
  end.setDate(0); // 지난달 말일 — 진행 중인 달의 미완성 구간 제외
  const start = new Date(end);
  start.setMonth(start.getMonth() - TREND_MONTHS);
  start.setDate(1);
  return { startDate: toDateString(start), endDate: toDateString(end) };
}

export type KeywordTrendResult = KeywordTrendSummary & { fromCache: boolean };

async function resolveEnabledConnection(universeId: string, anchorOverride?: string) {
  const connection = await resolveNaverDatalabConnection(universeId);
  if (!connection) return { ok: false as const, error: "naver_datalab_credential_not_configured" };
  if (!connection.enabled) return { ok: false as const, error: "naver_datalab_disabled" };

  // 앵커 해석 우선순위: 명시 override(프로필/임시) → 설정 defaultAnchorKeyword → credential.extras.anchorKeyword
  const explicit = String(anchorOverride ?? "").trim();
  if (explicit) {
    return { ok: true as const, connection: { ...connection, anchorKeyword: explicit } };
  }
  const settings = await getMarketingKeywordSettings(universeId);
  const settingAnchor = String(settings?.defaultAnchorKeyword ?? "").trim();
  if (settingAnchor) {
    return { ok: true as const, connection: { ...connection, anchorKeyword: settingAnchor } };
  }
  return { ok: true as const, connection };
}

async function fetchTrendBatch(
  connection: NaverDatalabConnection,
  keywords: string[],
  timeUnit: NaverTimeUnit,
  startDate: string,
  endDate: string,
) {
  const keywordGroups = [
    { groupName: connection.anchorKeyword, keywords: [connection.anchorKeyword] },
    ...keywords.map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
  ];
  const results = await runDatalabSearchTrend(connection, { startDate, endDate, timeUnit, keywordGroups });

  const anchor = results.find((group) => group.title === connection.anchorKeyword);
  const candidates = results.filter((group) => group.title !== connection.anchorKeyword);
  if (!anchor) throw new Error("naver_datalab_anchor_group_missing");

  return summarizeAgainstAnchor(anchor, candidates);
}

/**
 * 키워드 트렌드 조회 (앵커 재정규화 지수 + 시즌성 분류).
 * 캐시(7일) 우선으로 quota를 절약하고, force=true일 때만 재수집한다.
 */
export async function getNaverKeywordTrends(args: {
  universeId: string;
  keywords: string[];
  timeUnit?: NaverTimeUnit;
  force?: boolean;
  profileKey?: string; // 프로필 anchor override 조회
  anchorKeyword?: string; // 작업/캠페인 임시 override (최우선)
}) {
  let anchorOverride = String(args.anchorKeyword ?? "").trim();
  if (!anchorOverride && args.profileKey) {
    const profile = await getMarketingKeywordProfile({ universeId: args.universeId, profileKey: args.profileKey });
    if (profile?.anchorKeyword) anchorOverride = String(profile.anchorKeyword).trim();
  }
  const ready = await resolveEnabledConnection(args.universeId, anchorOverride);
  if (!ready.ok) return { ok: false as const, error: ready.error };
  const { connection } = ready;

  const timeUnit: NaverTimeUnit = args.timeUnit || "month";
  const { startDate, endDate } = defaultTrendRange();
  const keywords = Array.from(new Set(args.keywords.map((k) => k.trim()).filter(Boolean))).slice(0, 20);

  const results: KeywordTrendResult[] = [];
  const misses: string[] = [];

  for (const keyword of keywords) {
    if (!args.force) {
      const cached = await findRecentNaverTrendSnapshot({
        universeId: args.universeId,
        kind: "search_trend",
        subjectKey: keyword,
        timeUnit,
        anchorKeyword: connection.anchorKeyword,
        maxAgeDays: TREND_CACHE_DAYS,
      });
      if (cached) {
        const series = (cached.series || []) as DatalabSeriesPoint[];
        const summary = (cached.summary || {}) as Partial<KeywordTrendSummary>;
        results.push({
          keyword,
          anchorIndex: Number(summary.anchorIndex ?? 0),
          momentum: Number(summary.momentum ?? 0),
          seasonality: summary.seasonality || classifySeasonality(series),
          series,
          fromCache: true,
        });
        continue;
      }
    }
    misses.push(keyword);
  }

  for (let i = 0; i < misses.length; i += CANDIDATES_PER_REQUEST) {
    const batch = misses.slice(i, i + CANDIDATES_PER_REQUEST);
    const summaries = await fetchTrendBatch(connection, batch, timeUnit, startDate, endDate);

    for (const summary of summaries) {
      await upsertMarketingNaverTrendSnapshot({
        universeId: args.universeId,
        kind: "search_trend",
        subjectKey: summary.keyword,
        timeUnit,
        startDate,
        endDate,
        anchorKeyword: connection.anchorKeyword,
        series: summary.series,
        summary: {
          anchorIndex: summary.anchorIndex,
          momentum: summary.momentum,
          seasonality: summary.seasonality,
        },
      });
      results.push({ ...summary, fromCache: false });
    }
  }

  return {
    ok: true as const,
    anchorKeyword: connection.anchorKeyword,
    timeUnit,
    startDate,
    endDate,
    note: "anchorIndex는 앵커 키워드 대비 상대 지수이며 절대 검색량이 아닙니다.",
    results,
  };
}

/** 블로그 검색 기반 경쟁 분석 (경쟁 문서량, 최근 30일 포화도, 상위 제목). */
export async function analyzeNaverSerp(args: { universeId: string; keyword: string; display?: number }) {
  const ready = await resolveEnabledConnection(args.universeId);
  if (!ready.ok) return { ok: false as const, error: ready.error };

  const keyword = args.keyword.trim();
  if (!keyword) return { ok: false as const, error: "keyword_required" };

  const { total, items } = await searchNaverBlog(ready.connection, keyword, {
    display: Math.min(args.display ?? 30, 100),
    sort: "sim",
  });

  return {
    ok: true as const,
    keyword,
    rankScope: "blog_tab" as const,
    note: "블로그 검색 탭 기준이며 통합검색 노출 순위와 다를 수 있습니다. 추세 지표로만 사용하세요.",
    ...buildSerpCompetitionSummary(total, items),
  };
}

/**
 * 후보 큐 일괄 트렌드 검증: status=candidate 키워드의 트렌드/경쟁을 조회해
 * metrics.naver 네임스페이스로 병합한다 (dryRun 시 저장 없이 결과만 반환).
 */
export async function refreshKeywordCandidatesWithNaver(args: {
  universeId: string;
  limit?: number;
  withSerp?: boolean;
  dryRun?: boolean;
}) {
  const ready = await resolveEnabledConnection(args.universeId);
  if (!ready.ok) return { ok: false as const, error: ready.error };

  const candidates = await listMarketingKeywordCandidates({
    universeId: args.universeId,
    status: "candidate",
    limit: Math.min(args.limit ?? 40, 100),
  });
  const keywords = Array.from(new Set(candidates.map((c) => String(c.keyword || "").trim()).filter(Boolean)));
  if (keywords.length === 0) {
    return { ok: true as const, updated: 0, checked: 0, items: [] };
  }

  const trends = await getNaverKeywordTrends({ universeId: args.universeId, keywords });
  if (!trends.ok) return trends;

  const checkedAt = toDateString(new Date());
  const items: Array<Record<string, unknown>> = [];
  let updated = 0;

  for (const trend of trends.results) {
    let competition: Record<string, unknown> = {};
    if (args.withSerp !== false) {
      try {
        const serp = await analyzeNaverSerp({ universeId: args.universeId, keyword: trend.keyword });
        if (serp.ok) {
          competition = {
            competitionTotal: serp.competitionTotal,
            recent30dRatio: serp.recent30dRatio,
          };
        }
      } catch (error) {
        logger.warn("[naverTrend] serp analysis failed", {
          universeId: args.universeId,
          keyword: trend.keyword,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const naverMetrics = {
      anchorIndex: trend.anchorIndex,
      momentum: trend.momentum,
      seasonality: trend.seasonality,
      anchorKeyword: trends.anchorKeyword,
      ...competition,
      checkedAt,
    };
    items.push({ keyword: trend.keyword, fromCache: trend.fromCache, ...naverMetrics });

    if (!args.dryRun) {
      await mergeKeywordCandidateNaverMetrics({
        universeId: args.universeId,
        keyword: trend.keyword,
        naverMetrics,
      });
      updated += 1;
    }
  }

  return { ok: true as const, dryRun: args.dryRun === true, checked: keywords.length, updated, items };
}
