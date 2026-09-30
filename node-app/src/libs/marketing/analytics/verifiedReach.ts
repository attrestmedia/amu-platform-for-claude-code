/**
 * RM-110/RM-111 pure, read-only evidence builders.
 * Dimensioned activeUsers values are deliberately named metric-cell sums: GA4
 * activeUsers is non-additive and those sums are not 28-day distinct users.
 */

export const VERIFIED_REACH_RULES = Object.freeze({
  sessionUserRatioTolerance: 0.01,
  deviceDominanceMinimum: 0.99,
  browserDominanceMinimum: 0.99,
  countryCombinationsPerDayMinimum: 20,
  fixedDailySessionsRelativeMadMaximum: 0.1,
  fixedDailySessionsMinimumDays: 7,
});

export const AUDIENCE_PROFILE_DIMENSIONS = Object.freeze([
  "date",
  "country",
  "language",
  "deviceCategory",
  "browser",
] as const);
export const AUDIENCE_PROFILE_METRICS = Object.freeze(["activeUsers", "sessions", "screenPageViews"] as const);

export type GaQueryWindowProvenance = {
  propertyKey: string;
  startDate: string;
  endDate: string;
  source: string;
  asOf: string;
};

export type AudienceProfileQueryProvenance = GaQueryWindowProvenance & {
  reportKey: "audience_profile";
  dimensions: string[];
  metrics: string[];
};

export type PropertyTotalQueryProvenance = GaQueryWindowProvenance & {
  metric: "totalUsers";
  dimensions: string[];
  filter: null | {
    fieldName: "eventName";
    matchType: "EXACT";
    value: "first_visit";
  };
};

export type AudienceProfileEvidenceRow = {
  date: string;
  dimensions?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type VerifiedReachQuery = {
  propertyKey: string;
  startDate: string;
  endDate: string;
  reportedRowCount: number;
  provenance: AudienceProfileQueryProvenance;
};

export type ReturningUsersInput = {
  propertyKey: string;
  startDate: string;
  endDate: string;
  totalUsers: number;
  firstVisitUsers: number;
  totalUsersRowCount: number;
  firstVisitUsersRowCount: number;
  totalUsersQuery: PropertyTotalQueryProvenance;
  firstVisitUsersQuery: PropertyTotalQueryProvenance;
};

const JUDGMENT_DIMENSIONS = ["country", "language", "deviceCategory", "browser"] as const;
type JudgmentDimension = (typeof JUDGMENT_DIMENSIONS)[number];

type NormalizedAudienceRow = {
  date: string;
  country: string;
  language: string;
  deviceCategory: string;
  browser: string;
  missingDimensions: JudgmentDimension[];
  activeUsers: number;
  sessions: number;
};

type CountryAggregate = {
  country: string;
  activeUsersMetricCellSum: number;
  sessions: number;
  sessionUserRatio: number;
  dominantDevice: { value: string; sessions: number; share: number };
  dominantBrowser: { value: string; sessions: number; share: number };
  firstStageApproxOne: boolean;
  localSecondStageMatch: boolean;
  judgmentComplete: boolean;
  missingDimensions: JudgmentDimension[];
};

function requireTrimmedString(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid_${field}`);
  return normalized;
}

function toFiniteNonNegativeInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`invalid_${field}_integer`);
  }
  return value;
}

function toOptionalDimension(row: AudienceProfileEvidenceRow, key: JudgmentDimension) {
  const value = row.dimensions?.[key] ?? row.meta?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown) {
  const date = requireTrimmedString(value, "date");
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  ) {
    throw new Error("invalid_date");
  }
  return date;
}

function normalizeIsoTimestamp(value: unknown, field: string) {
  const timestamp = requireTrimmedString(value, field);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid_${field}`);
  return parsed.toISOString();
}

function normalizeStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() !== item || !item)) {
    throw new Error(`invalid_${field}`);
  }
  return [...value];
}

function assertExactArray(actual: string[], expected: readonly string[], field: string) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`invalid_${field}`);
  }
}

function normalizeQueryWindow(input: Pick<VerifiedReachQuery, "propertyKey" | "startDate" | "endDate">) {
  return {
    propertyKey: requireTrimmedString(input.propertyKey, "property_key"),
    startDate: normalizeDate(input.startDate),
    endDate: normalizeDate(input.endDate),
  };
}

function validateSharedProvenance(
  provenance: GaQueryWindowProvenance,
  expected: { propertyKey: string; startDate: string; endDate: string },
) {
  if (!provenance || typeof provenance !== "object") throw new Error("missing_query_provenance");
  const propertyKey = requireTrimmedString(provenance.propertyKey, "provenance_property_key");
  const startDate = normalizeDate(provenance.startDate);
  const endDate = normalizeDate(provenance.endDate);
  const source = requireTrimmedString(provenance.source, "provenance_source");
  const asOf = normalizeIsoTimestamp(provenance.asOf, "provenance_as_of");
  if (propertyKey !== expected.propertyKey || startDate !== expected.startDate || endDate !== expected.endDate) {
    throw new Error("query_provenance_window_mismatch");
  }
  return { propertyKey, startDate, endDate, source, asOf };
}

function validateAudienceProfileProvenance(
  provenance: AudienceProfileQueryProvenance,
  expected: { propertyKey: string; startDate: string; endDate: string },
) {
  const shared = validateSharedProvenance(provenance, expected);
  if (provenance.reportKey !== "audience_profile") throw new Error("invalid_audience_profile_report_key");
  const dimensions = normalizeStringArray(provenance.dimensions, "audience_profile_dimensions");
  const metrics = normalizeStringArray(provenance.metrics, "audience_profile_metrics");
  assertExactArray(dimensions, AUDIENCE_PROFILE_DIMENSIONS, "audience_profile_dimensions");
  assertExactArray(metrics, AUDIENCE_PROFILE_METRICS, "audience_profile_metrics");
  return { ...shared, reportKey: provenance.reportKey, dimensions, metrics };
}

function validatePropertyTotalProvenance(
  provenance: PropertyTotalQueryProvenance,
  expected: { propertyKey: string; startDate: string; endDate: string },
  kind: "total" | "first_visit",
) {
  const shared = validateSharedProvenance(provenance, expected);
  if (provenance.metric !== "totalUsers") throw new Error(`invalid_${kind}_metric`);
  const dimensions = normalizeStringArray(provenance.dimensions, `${kind}_dimensions`);
  if (dimensions.length !== 0) throw new Error("property_level_queries_must_be_dimensionless");
  if (kind === "total") {
    if (provenance.filter !== null) throw new Error("total_users_query_must_be_unfiltered");
  } else if (
    !provenance.filter ||
    provenance.filter.fieldName !== "eventName" ||
    provenance.filter.matchType !== "EXACT" ||
    provenance.filter.value !== "first_visit"
  ) {
    throw new Error("first_visit_query_requires_exact_event_filter");
  }
  return { ...shared, metric: provenance.metric, dimensions, filter: provenance.filter };
}

function normalizeAudienceRows(rows: AudienceProfileEvidenceRow[]) {
  return rows.map<NormalizedAudienceRow>((row) => {
    const dimensions = Object.fromEntries(
      JUDGMENT_DIMENSIONS.map((key) => [key, toOptionalDimension(row, key)]),
    ) as Record<JudgmentDimension, string>;
    const missingDimensions = JUDGMENT_DIMENSIONS.filter((key) => !dimensions[key]);
    return {
      date: normalizeDate(row.date),
      country: dimensions.country,
      language: dimensions.language,
      deviceCategory: dimensions.deviceCategory,
      browser: dimensions.browser,
      missingDimensions,
      activeUsers: toFiniteNonNegativeInteger(row.metrics?.activeUsers, "active_users"),
      sessions: toFiniteNonNegativeInteger(row.metrics?.sessions, "sessions"),
    };
  });
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) || 0) + value);
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dominantValue(values: Map<string, number>, denominator: number) {
  const [value = "", sessions = 0] = [...values.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => rightValue - leftValue || leftKey.localeCompare(rightKey),
  )[0] || [];
  return { value, sessions, share: round(ratio(sessions, denominator)) };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function buildCountryAggregates(rows: NormalizedAudienceRow[]) {
  const groups = new Map<
    string,
    {
      activeUsersMetricCellSum: number;
      sessions: number;
      devices: Map<string, number>;
      browsers: Map<string, number>;
      missingDimensions: Set<JudgmentDimension>;
    }
  >();
  for (const row of rows) {
    const groupKey = row.country || "(missing country)";
    const group = groups.get(groupKey) || {
      activeUsersMetricCellSum: 0,
      sessions: 0,
      devices: new Map<string, number>(),
      browsers: new Map<string, number>(),
      missingDimensions: new Set<JudgmentDimension>(),
    };
    group.activeUsersMetricCellSum += row.activeUsers;
    group.sessions += row.sessions;
    if (row.deviceCategory) addToMap(group.devices, row.deviceCategory, row.sessions);
    if (row.browser) addToMap(group.browsers, row.browser, row.sessions);
    row.missingDimensions.forEach((dimension) => group.missingDimensions.add(dimension));
    groups.set(groupKey, group);
  }
  return [...groups.entries()]
    .map<CountryAggregate>(([country, group]) => {
      const sessionUserRatio = ratio(group.sessions, group.activeUsersMetricCellSum);
      const dominantDevice = dominantValue(group.devices, group.sessions);
      const dominantBrowser = dominantValue(group.browsers, group.sessions);
      const missingDimensions = [...group.missingDimensions].sort();
      const judgmentComplete = missingDimensions.length === 0;
      const firstStageApproxOne =
        group.activeUsersMetricCellSum > 0 &&
        Math.abs(sessionUserRatio - 1) <= VERIFIED_REACH_RULES.sessionUserRatioTolerance;
      // language is a cohort-level overdispersion dimension. A missing language
      // row must still join its device/browser cohort so that the whole affected
      // cohort is marked incomplete rather than silently dropping that row.
      const localFingerprintComplete = !missingDimensions.some((dimension) =>
        dimension === "country" || dimension === "deviceCategory" || dimension === "browser",
      );
      const localSecondStageMatch =
        localFingerprintComplete &&
        dominantDevice.share >= VERIFIED_REACH_RULES.deviceDominanceMinimum &&
        dominantBrowser.share >= VERIFIED_REACH_RULES.browserDominanceMinimum;
      return {
        country,
        activeUsersMetricCellSum: group.activeUsersMetricCellSum,
        sessions: group.sessions,
        sessionUserRatio: round(sessionUserRatio),
        dominantDevice,
        dominantBrowser,
        firstStageApproxOne,
        localSecondStageMatch,
        judgmentComplete,
        missingDimensions,
      };
    })
    .sort((left, right) => left.country.localeCompare(right.country));
}

function inclusiveDates(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("invalid_query_window");
  const dates: string[] = [];
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return dates;
}

function cohortFingerprint(country: CountryAggregate) {
  return `${country.dominantDevice.value}\u0000${country.dominantBrowser.value}`;
}

export function computeVerifiedReach(query: VerifiedReachQuery, audienceProfileRows: AudienceProfileEvidenceRow[]) {
  const normalizedQuery = normalizeQueryWindow(query);
  const queryDates = inclusiveDates(normalizedQuery.startDate, normalizedQuery.endDate);
  const reportedRowCount = toFiniteNonNegativeInteger(query.reportedRowCount, "reported_row_count");
  if (reportedRowCount !== audienceProfileRows.length) throw new Error("reported_row_count_mismatch");
  if (audienceProfileRows.length === 0) throw new Error("empty_audience_profile_rows");
  const provenance = validateAudienceProfileProvenance(query.provenance, normalizedQuery);
  const queryDateSet = new Set(queryDates);
  const normalizedRows = normalizeAudienceRows(audienceProfileRows);
  if (normalizedRows.some((row) => !queryDateSet.has(row.date))) throw new Error("row_outside_query_window");
  const activeInputDateSet = new Set(normalizedRows.map((row) => row.date));
  const missingDates = queryDates.filter((date) => !activeInputDateSet.has(date));
  const completeDateCoverage = missingDates.length === 0;

  const countries = buildCountryAggregates(normalizedRows);
  const cohortCountryNames = new Map<string, Set<string>>();
  for (const country of countries) {
    if (!country.firstStageApproxOne || !country.localSecondStageMatch) continue;
    const fingerprint = cohortFingerprint(country);
    const names = cohortCountryNames.get(fingerprint) || new Set<string>();
    names.add(country.country);
    cohortCountryNames.set(fingerprint, names);
  }

  const cohortEvidence = [...cohortCountryNames.entries()]
    .map(([fingerprint, countryNames]) => {
      const [deviceCategory, browser] = fingerprint.split("\u0000");
      const rows = normalizedRows.filter((row) => countryNames.has(row.country));
      const dailySessions = new Map(queryDates.map((date) => [date, 0]));
      const dailyCombinations = new Map(queryDates.map((date) => [date, new Set<string>()]));
      for (const row of rows) {
        dailySessions.set(row.date, (dailySessions.get(row.date) || 0) + row.sessions);
        if (row.country && row.language) dailyCombinations.get(row.date)?.add(`${row.country}\u0000${row.language}`);
      }
      const missingDimensions = [...new Set(rows.flatMap((row) => row.missingDimensions))].sort();
      const judgmentComplete = completeDateCoverage && missingDimensions.length === 0;
      const activeDaySessions = [...dailySessions.values()].filter((sessions) => sessions > 0);
      const dailySessionsMedian = median(activeDaySessions);
      const dailySessionsRelativeMad = dailySessionsMedian
        ? median(activeDaySessions.map((sessions) => Math.abs(sessions - dailySessionsMedian))) / dailySessionsMedian
        : Number.POSITIVE_INFINITY;
      const medianCountryLanguageCombinationsPerDay = median(
        [...dailyCombinations.values()].map((combinations) => combinations.size),
      );
      const countryCombinationOverdispersed =
        judgmentComplete &&
        medianCountryLanguageCombinationsPerDay >= VERIFIED_REACH_RULES.countryCombinationsPerDayMinimum;
      const dailySessionsFixed =
        judgmentComplete &&
        activeDaySessions.length === queryDates.length &&
        activeDaySessions.length >= VERIFIED_REACH_RULES.fixedDailySessionsMinimumDays &&
        dailySessionsRelativeMad <= VERIFIED_REACH_RULES.fixedDailySessionsRelativeMadMaximum;
      return {
        fingerprint: { deviceCategory, browser },
        countries: [...countryNames].sort(),
        judgmentComplete,
        incompleteReasons: [
          ...(completeDateCoverage ? [] : ["missing_query_dates"]),
          ...(missingDimensions.length ? ["missing_judgment_dimensions"] : []),
        ],
        missingDimensions,
        medianCountryLanguageCombinationsPerDay: round(medianCountryLanguageCombinationsPerDay),
        countryCombinationOverdispersed,
        activeDayCount: activeDaySessions.length,
        dailySessionsMedian: round(dailySessionsMedian),
        dailySessionsRelativeMad: Number.isFinite(dailySessionsRelativeMad) ? round(dailySessionsRelativeMad) : null,
        dailySessionsFixed,
        secondStageMatched: judgmentComplete && countryCombinationOverdispersed && dailySessionsFixed,
      };
    })
    .sort(
      (left, right) =>
        left.fingerprint.deviceCategory.localeCompare(right.fingerprint.deviceCategory) ||
        left.fingerprint.browser.localeCompare(right.fingerprint.browser),
    );

  const excludedCountrySet = new Set(
    cohortEvidence.filter((cohort) => cohort.secondStageMatched).flatMap((cohort) => cohort.countries),
  );
  const missingJudgmentDimensionRows = normalizedRows.filter((row) => row.missingDimensions.length > 0).length;
  const assessmentComplete = completeDateCoverage && missingJudgmentDimensionRows === 0;
  const rawActiveUsersMetricCellSum = countries.reduce((sum, country) => sum + country.activeUsersMetricCellSum, 0);
  const rawSessions = countries.reduce((sum, country) => sum + country.sessions, 0);
  const excluded = countries
    .filter((country) => excludedCountrySet.has(country.country))
    .map((country) => {
      const cohort = cohortEvidence.find((item) => item.countries.includes(country.country));
      return {
        segment: { country: country.country },
        fingerprint: cohort?.fingerprint ?? null,
        activeUsersMetricCellSum: country.activeUsersMetricCellSum,
        sessions: country.sessions,
        sessionUserRatio: country.sessionUserRatio,
        dominantDevice: country.dominantDevice,
        dominantBrowser: country.dominantBrowser,
        matchedSignals: [
          "sessions_per_active_user_metric_cell_sum_approximately_one",
          "single_device_dominance",
          "single_browser_dominance",
          "cohort_country_language_combinations_overdispersed",
          "cohort_daily_sessions_fixed",
        ],
      };
    });
  const excludedActiveUsersMetricCellSum = excluded.reduce((sum, segment) => sum + segment.activeUsersMetricCellSum, 0);
  const excludedSessions = excluded.reduce((sum, segment) => sum + segment.sessions, 0);

  return {
    schemaVersion: "amu-rm-reach-output-v2" as const,
    task: "RM-110" as const,
    status: assessmentComplete ? ("complete" as const) : ("incomplete" as const),
    decisionEligible: assessmentComplete,
    incompleteReasons: [
      ...(completeDateCoverage ? [] : ["missing_query_dates"]),
      ...(missingJudgmentDimensionRows ? ["missing_judgment_dimensions"] : []),
    ],
    query: { ...normalizedQuery, windowDays: queryDates.length },
    source: {
      ...provenance,
      inputRowCount: audienceProfileRows.length,
      reportedRowCount,
      rowCountMatchesReported: true as const,
      activeDateCount: activeInputDateSet.size,
      missingDates,
      missingJudgmentDimensionRows,
    },
    denominator: {
      metric: "activeUsers" as const,
      aggregation: "sum_of_dimensioned_metric_cells" as const,
      definition:
        "audience_profile의 country×language×deviceCategory×browser×date 행별 activeUsers metric cell 합. 비가산 지표이므로 28일 distinct 사용자 수나 property-level Verified Reach가 아님",
      isDistinctPropertyUserCount: false as const,
      rawActiveUsersMetricCellSum,
      rawSessions,
      excludedActiveUsersMetricCellSum,
      excludedSessions,
      retainedActiveUsersMetricCellSum: rawActiveUsersMetricCellSum - excludedActiveUsersMetricCellSum,
      retainedSessions: rawSessions - excludedSessions,
      baselineComparableValue: rawActiveUsersMetricCellSum - excludedActiveUsersMetricCellSum,
      baselineComparableUnit: "audience_profile_activeUsers_metric_cell_sum" as const,
    },
    rules: VERIFIED_REACH_RULES,
    cohortEvidence,
    excludedSegments: excluded,
    retainedSegments: countries
      .filter((country) => !excludedCountrySet.has(country.country))
      .map((country) => ({
        segment: { country: country.country },
        activeUsersMetricCellSum: country.activeUsersMetricCellSum,
        sessions: country.sessions,
        sessionUserRatio: country.sessionUserRatio,
        firstStageApproxOne: country.firstStageApproxOne,
        localSecondStageMatch: country.localSecondStageMatch,
        judgmentComplete: country.judgmentComplete,
        missingDimensions: country.missingDimensions,
      })),
  };
}

export function computeReturningUsers(input: ReturningUsersInput) {
  const normalizedQuery = normalizeQueryWindow(input);
  const windowDays = inclusiveDates(normalizedQuery.startDate, normalizedQuery.endDate).length;
  const totalUsers = toFiniteNonNegativeInteger(input.totalUsers, "total_users");
  const firstVisitUsers = toFiniteNonNegativeInteger(input.firstVisitUsers, "first_visit_users");
  if (firstVisitUsers > totalUsers) throw new Error("first_visit_users_exceed_total_users");
  const totalUsersRowCount = toFiniteNonNegativeInteger(input.totalUsersRowCount, "total_users_row_count");
  const firstVisitUsersRowCount = toFiniteNonNegativeInteger(input.firstVisitUsersRowCount, "first_visit_users_row_count");
  if (totalUsersRowCount !== 1 || firstVisitUsersRowCount !== 1) {
    throw new Error("property_level_queries_must_each_return_one_row");
  }
  const totalUsersQuery = validatePropertyTotalProvenance(input.totalUsersQuery, normalizedQuery, "total");
  const firstVisitUsersQuery = validatePropertyTotalProvenance(input.firstVisitUsersQuery, normalizedQuery, "first_visit");
  return {
    schemaVersion: "amu-rm-returning-users-output-v2" as const,
    task: "RM-111" as const,
    query: { ...normalizedQuery, windowDays, dimensions: [] as string[] },
    source: {
      totalUsers: { ...totalUsersQuery, rowCount: totalUsersRowCount },
      firstVisitUsers: { ...firstVisitUsersQuery, rowCount: firstVisitUsersRowCount },
    },
    formula: "totalUsers - firstVisitUsers" as const,
    totalUsers,
    firstVisitUsers,
    returningUsers: totalUsers - firstVisitUsers,
    denominator: {
      definition: "GA4 property-level dimensionless totalUsers",
      value: totalUsers,
      verifiedReachApplied: false,
      note:
        "property-level subtraction은 차원 없는 distinct 사용자 산출이며 RM-110의 audience_profile metric-cell 필터와 자동 결합하지 않음",
    },
  };
}
