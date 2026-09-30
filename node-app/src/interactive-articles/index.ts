import { parseInteractiveArticle, type InteractiveArticleResource } from "../motion-story";

/**
 * 인터랙티브 아티클 정적 리소스 레지스트리.
 *
 * - 리소스는 원문 기사를 기반으로 인터랙티브 전용으로 재구성한 `interactive-article.v1` 데이터다.
 * - 정적 파일로 번들한다: `resources/<slug>.ts` 에 리소스를 만들고 아래 `RESOURCES` 에 등록한다.
 * - 등록된 리소스는 모두 `parseInteractiveArticle` 를 통과해야 노출된다. 실패하면 조용히 제외하고
 *   `getInteractiveArticleRegistryReport()` 에 사유를 남긴다 (fail-closed).
 * - 공개 표면(홈 카드 등)은 `status: "published"` 만 쓴다.
 */

const RESOURCES: readonly unknown[] = [
  // 예) import { aiAgentCostInteractive } from "./resources/ai-agent-cost"; → aiAgentCostInteractive,
];

type RegistryReport = {
  valid: InteractiveArticleResource[];
  rejected: { index: number; slug: string | null; errors: string[] }[];
};

let cache: RegistryReport | null = null;

export function buildInteractiveArticleRegistry(resources: readonly unknown[]): RegistryReport {
  const valid: InteractiveArticleResource[] = [];
  const rejected: RegistryReport["rejected"] = [];
  const seenSlugs = new Set<string>();
  resources.forEach((input, index) => {
    const result = parseInteractiveArticle(input);
    const slug = typeof (input as { slug?: unknown })?.slug === "string" ? (input as { slug: string }).slug : null;
    if (!result.ok) {
      rejected.push({ index, slug, errors: result.errors });
      return;
    }
    if (seenSlugs.has(result.resource.slug)) {
      rejected.push({ index, slug, errors: [`slug 중복: ${result.resource.slug}`] });
      return;
    }
    seenSlugs.add(result.resource.slug);
    valid.push(result.resource);
  });
  return { valid, rejected };
}

export function getInteractiveArticleRegistryReport(): RegistryReport {
  if (!cache) cache = buildInteractiveArticleRegistry(RESOURCES);
  return cache;
}

export function getInteractiveArticle(slug: string, options: { includeUnpublished?: boolean } = {}): InteractiveArticleResource | null {
  const resource = getInteractiveArticleRegistryReport().valid.find((item) => item.slug === slug) ?? null;
  if (!resource) return null;
  if (!options.includeUnpublished && resource.status !== "published") return null;
  return resource;
}

export function listPublishedInteractiveArticles(): InteractiveArticleResource[] {
  return getInteractiveArticleRegistryReport().valid.filter((resource) => resource.status === "published");
}

/** 홈(/) 시그니처 카드 후보: published + homeCard 표면 보유. 최신 수정순. */
export function listHomeCardInteractiveArticles(limit = 5): InteractiveArticleResource[] {
  return listPublishedInteractiveArticles()
    .filter((resource) => resource.surfaces.homeCard !== undefined)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, limit);
}
