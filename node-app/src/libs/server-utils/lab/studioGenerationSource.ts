import "server-only";

import type { NextRequest } from "next/server";
import type { StudioGenerationSourceType } from "types/app";
import { getMagazineEmbedSession } from "libs/server-utils/magazine/magazineEmbedSession";

const UNKNOWN_SOURCE: StudioGenerationSourceType = { service: "unknown", surface: "unknown" };

const SOURCE_BY_PATH: ReadonlyArray<{
  prefix: string;
  source: StudioGenerationSourceType;
}> = [
  { prefix: "/embed/magazine/v1/", source: { service: "gen-studio", surface: "magazine-article-embed" } },
  { prefix: "/gen-studio/templates", source: { service: "gen-studio", surface: "template-browser" } },
  { prefix: "/gen-studio", source: { service: "gen-studio", surface: "home" } },
  { prefix: "/tutors", source: { service: "tutors", surface: "tutor-profile" } },
  { prefix: "/store", source: { service: "store", surface: "store-management" } },
  { prefix: "/play", source: { service: "play", surface: "play" } },
  { prefix: "/apps", source: { service: "mini-app", surface: "mini-app" } },
  { prefix: "/marketing-oops", source: { service: "marketing", surface: "marketing-operations" } },
  { prefix: "/admin", source: { service: "admin", surface: "admin" } },
];

/**
 * @docHint
 * @purpose 이미지 생성 요청의 동일 출처 서비스/표면 식별
 * @process same-origin Referer 검증  고정 path prefix 매핑  미확인 출처 fallback 반환
 * @domain ai-image
 * @scope server
 */
function resolveRefererSource(request: NextRequest): StudioGenerationSourceType {
  const referer = String(request.headers.get("referer") || "").trim();
  if (!referer) return UNKNOWN_SOURCE;

  try {
    const sourceUrl = new URL(referer);
    if (sourceUrl.origin !== request.nextUrl.origin) return UNKNOWN_SOURCE;
    return SOURCE_BY_PATH.find((item) => sourceUrl.pathname.startsWith(item.prefix))?.source || UNKNOWN_SOURCE;
  } catch {
    return UNKNOWN_SOURCE;
  }
}

/**
 * iframe 내부 fetch의 Referer는 부모 기사 URL로 축약될 수 있으므로,
 * 유효한 opaque embed session을 보조 증거로 사용해 Magazine 출처를 복원한다.
 * session 자체는 bootstrap에서 서버가 발급하고 Redis에서 재검증한다.
 */
export async function resolveStudioGenerationSource(
  request: NextRequest,
  embedSessionId?: unknown,
): Promise<StudioGenerationSourceType> {
  const refererSource = resolveRefererSource(request);
  if (refererSource.surface !== "unknown") return refererSource;

  const session = await getMagazineEmbedSession(embedSessionId);
  if (
    session?.serviceKey === "gen-studio" &&
    (session.moduleType === "image_embed" || session.moduleType === "content_embed")
  ) {
    return { service: "gen-studio", surface: "magazine-article-embed" };
  }

  return refererSource;
}
