/**
 * node 공개·색인 가능 진입점 단일 원천 (QA-7 sitemap 자동화).
 *
 * - `/app-pages-sitemap.xml`은 이 목록만 참조한다. 공개 서비스 페이지를 추가하거나
 *   (공개·색인 가능이 되면) 노출 대상에서 제외할 때 이 상수만 고치면 sitemap이 따라간다.
 * - 매거진 고도화 콘텐츠(/magazine/{slug})의 sitemap은 DB 드라이브라 여기와 무관하다 —
 *   `/app-magazine-sitemap.xml`이 `listIndexableAppMagazineContents`를 요청 시점에 조회해
 *   신규 indexable 콘텐츠를 자동 수록한다(코드 변경 없음).
 * - 인증/내부 표면은 여기에 두지 않는다(제외 사유는 NODE_NOINDEX_SURFACES로 문서화).
 */

/** 색인 가능한 공개 node 진입점. Build in Public 공개 서비스 + 루트 홈. */
export const NODE_PUBLIC_INDEXABLE_PAGES = [
  "/",
  "/gen-studio",
  "/tutors",
  "/play",
  "/store",
  "/apps",
  "/newsletter",
] as const;

/** 인증·내부 표면 — sitemap 수록 제외 대상 (참고·문서화용). */
export const NODE_NOINDEX_SURFACES = [
  "/account",
  "/admin",
  "/auth",
  "/login",
  "/signup",
  "/payment",
  "/private",
  "/marketing",
  "/verification",
  "/embed",
  "/library",
  "/marketing-oops",
] as const;
