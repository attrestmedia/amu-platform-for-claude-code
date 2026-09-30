/**
 * @docHint
 * @purpose 네이버 키워드 전략 클러스터 seed 상수 — DB 원장(marketing_keyword_clusters)의 초기 부트스트랩 값
 * @process 기본 전략/토픽 클러스터 seed 제공 → repo lazy seeding → 이후 운영은 DB 원장 기준
 * @domain marketing
 * @scope shared
 */

export const DEFAULT_ANCHOR_KEYWORD = "AI 이미지 생성";

export type MarketingKeywordClusterScope = "strategy" | "topic";

export type MarketingKeywordClusterSeed = {
  key: string;
  scope: MarketingKeywordClusterScope;
  label: { ko: string; en: string };
  description?: { ko: string; en: string };
};

/**
 * 초기 seed — "허용 가능한 전체 목록"이 아니라 최초 부트스트랩 값.
 * 운영 추가/비활성/병합은 marketing_keyword_clusters 컬렉션(원장)에서 수행한다.
 */
export const DEFAULT_MARKETING_KEYWORD_CLUSTER_SEEDS: MarketingKeywordClusterSeed[] = [
  { key: "ai-image", scope: "strategy", label: { ko: "AI 이미지", en: "AI Image" } },
  { key: "ai-writing", scope: "strategy", label: { ko: "AI 글쓰기", en: "AI Writing" } },
  { key: "ai-marketing", scope: "strategy", label: { ko: "AI 마케팅", en: "AI Marketing" } },
  { key: "creator-productivity", scope: "strategy", label: { ko: "크리에이터 생산성", en: "Creator Productivity" } },
  { key: "build-log", scope: "strategy", label: { ko: "빌드로그", en: "Build Log" } },
  // 토픽 seed — 매거진 분류의 시작점 (운영 중 자유 추가/비활성/병합)
  { key: "investment", scope: "topic", label: { ko: "투자", en: "Investment" } },
  { key: "business-strategy", scope: "topic", label: { ko: "비즈니스 전략", en: "Business Strategy" } },
  { key: "brand", scope: "topic", label: { ko: "브랜드", en: "Brand" } },
  { key: "productivity", scope: "topic", label: { ko: "생산성", en: "Productivity" } },
  { key: "commerce", scope: "topic", label: { ko: "커머스", en: "Commerce" } },
];

/** key류(clusterKey/profileKey) 공통 정규화 — ASCII slug 고정, 한글은 label로만 노출 */
export function normalizeMarketingKeywordKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function normalizeMarketingKeywordClusterScope(value: unknown): MarketingKeywordClusterScope {
  return value === "topic" ? "topic" : "strategy";
}
