import type { DatalabGroupResult, DatalabSeriesPoint } from "./naverDatalabClient";

/**
 * @docHint
 * @purpose 데이터랩 시계열의 앵커 재정규화 지수 계산과 콘텐츠 수명 유형(evergreen 등) 분류
 * @process 앵커 그룹 대비 평균 비율로 anchorIndex 산출 → 변동계수/모멘텀/스파이크 규칙으로 분류
 * @domain marketing
 * @scope server
 */

export type KeywordSeasonality = "evergreen" | "seasonal" | "rising" | "declining" | "spike" | "insufficient";

export type KeywordTrendSummary = {
  keyword: string;
  /** 앵커 대비 재정규화 지수 (요청 간 비교 가능). 절대 검색량이 아님에 주의 */
  anchorIndex: number;
  /** 최근 3구간 평균 / 이전 구간 평균 - 1 (상승률) */
  momentum: number;
  seasonality: KeywordSeasonality;
  series: DatalabSeriesPoint[];
};

function average(points: DatalabSeriesPoint[]) {
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + p.ratio, 0) / points.length;
}

/**
 * 월 단위 시계열(권장 24개월)로 콘텐츠 수명 유형을 분류한다.
 * - evergreen: 변동계수(CV) 낮고 추세 완만 → 재사용/클러스터 허브 후보
 * - seasonal: 변동성 큼(반복 피크) → 발행 캘린더에 반영
 * - rising/declining: 최근 모멘텀 뚜렷 → 우선/회피
 * - spike: 단발 급등 후 소멸 → 뉴스성, 장기 클러스터 부적합
 * 임계값(CV 0.6, momentum ±0.5/0.4, spike 3배)은 초기 제안값으로 운영 데이터로 보정한다.
 */
export function classifySeasonality(series: DatalabSeriesPoint[]): KeywordSeasonality {
  if (series.length < 12) return "insufficient";
  const values = series.map((p) => p.ratio);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return "insufficient";
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;

  const recent = average(series.slice(-3));
  const base = average(series.slice(0, -3));
  const momentum = base > 0 ? recent / base - 1 : 0;

  const max = Math.max(...values);
  const aboveHalfMax = values.filter((v) => v >= max * 0.5).length;
  if (max >= mean * 3 && aboveHalfMax <= 2) return "spike";
  if (momentum >= 0.5) return "rising";
  if (momentum <= -0.4) return "declining";
  if (cv >= 0.6) return "seasonal";
  return "evergreen";
}

export function summarizeAgainstAnchor(
  anchor: DatalabGroupResult,
  candidates: DatalabGroupResult[],
): KeywordTrendSummary[] {
  const anchorAvg = average(anchor.data);
  return candidates.map((group) => {
    const avg = average(group.data);
    const recent = average(group.data.slice(-3));
    const base = average(group.data.slice(0, -3));
    return {
      keyword: group.title,
      anchorIndex: anchorAvg > 0 ? Number((avg / anchorAvg).toFixed(4)) : 0,
      momentum: base > 0 ? Number((recent / base - 1).toFixed(4)) : 0,
      seasonality: classifySeasonality(group.data),
      series: group.data,
    };
  });
}
