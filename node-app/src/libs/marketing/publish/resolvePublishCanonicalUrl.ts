import "server-only";

import wpCacheService from "libs/services/wpCacheService";
import { toSafeString } from "utils/common/typeUtils";

// WP REST 의 link 필드는 게시물이 draft 면 canonical permalink 가 아니라 /?p=<ID> 를 반환한다.
//
// 소셜 초안은 기사가 draft 인 시점에 생성된다(todo-content TASK-COMMON: order 1 에서 운영 draft 등록 →
// order 2 에서 곧바로 초안 생성 후 waiting_review). 따라서 생성 시점의 링크를 그대로 발행하면
// 외부 링크가 전부 301 경유가 되고, 기사가 아직 미발행이면 독자가 404 를 본다.
//
// 생성은 draft 에서 하는 것이 정상이므로 막지 않는다. 막아야 할 지점은 발행이다.
// 근거: .agent/docs/project/2026/08/20260812_115123__gsc-403-and-technical-error-triage-r126-r127.md §3-3
const WP_NON_CANONICAL_LINK_RE = /[?&]p=\d+/;

export type PublishCanonicalUrlResult =
  | { ok: true; canonicalUrl: string; resolved: boolean }
  | { ok: false; reason: string };

/**
 * 발행 직전에 소스 기사의 canonical URL 을 라이브 WordPress 로 다시 확인한다.
 *
 * 초안 생성 시점(draft)과 발행 시점(publish) 사이에 permalink 가 확정되므로
 * 저장된 linkUrl 이 아니라 발행 시점의 link 를 신뢰한다.
 *
 * 조회 실패 시 판정은 fallbackUrl 의 형태로 갈린다.
 * 이미 canonical 형태면 그대로 진행하고(캐시·네트워크 장애로 운영이 멈추지 않게),
 * /?p=<ID> 형태면 잘못된 링크임이 확실하므로 발행을 막는다.
 */
export async function resolvePublishCanonicalUrl(args: {
  postId?: number;
  slug?: string;
  fallbackUrl?: string;
}): Promise<PublishCanonicalUrlResult> {
  const fallbackUrl = toSafeString(args.fallbackUrl);
  const postId = Number(args.postId || 0) || undefined;
  const slug = toSafeString(args.slug) || undefined;
  const fallbackIsCanonical = Boolean(fallbackUrl) && !WP_NON_CANONICAL_LINK_RE.test(fallbackUrl);

  // WordPress 소스를 특정할 수 없는 job(외부 소스 등)은 기존 동작을 유지한다.
  if (!postId && !slug) {
    return fallbackIsCanonical
      ? { ok: true, canonicalUrl: fallbackUrl, resolved: false }
      : { ok: false, reason: "source_unresolvable" };
  }

  let post: Awaited<ReturnType<typeof wpCacheService.getPostDetail>> = null;
  try {
    post = await wpCacheService.getPostDetail({
      postId,
      slug,
      includeUnpublished: true,
      forceRefresh: true,
    });
  } catch {
    post = null;
  }

  if (!post) {
    return fallbackIsCanonical
      ? { ok: true, canonicalUrl: fallbackUrl, resolved: false }
      : { ok: false, reason: "source_lookup_failed" };
  }

  const status = toSafeString(post.status);
  if (status !== "publish") {
    return { ok: false, reason: `post_status=${status || "unknown"}` };
  }

  const liveLink = toSafeString(post.link);
  if (!liveLink || WP_NON_CANONICAL_LINK_RE.test(liveLink)) {
    return fallbackIsCanonical
      ? { ok: true, canonicalUrl: fallbackUrl, resolved: false }
      : { ok: false, reason: "non_canonical_link" };
  }

  return { ok: true, canonicalUrl: liveLink, resolved: true };
}
