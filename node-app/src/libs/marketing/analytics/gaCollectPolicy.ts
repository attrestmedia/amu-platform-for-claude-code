import type { MarketingGaReportKey } from "models/marketing";

/**
 * 한 report만 다시 수집해도 자체 entityType을 완전하게 재구성할 수 있는 보고서다.
 * acquisition/key_events는 ga_channel 한 행을 공동 구성하므로 단독 rollup하면
 * 기존 지표를 덮어쓸 수 있어 전체 수집에서만 rollup한다.
 */
const FILTERED_ROLLUP_SAFE_REPORTS = new Set<MarketingGaReportKey>([
  "page_traffic",
  "event_funnel",
  "audience_profile",
  "promo_performance",
]);

export function canRollupFilteredGaReport(reportKey: string) {
  return !reportKey || FILTERED_ROLLUP_SAFE_REPORTS.has(reportKey as MarketingGaReportKey);
}
