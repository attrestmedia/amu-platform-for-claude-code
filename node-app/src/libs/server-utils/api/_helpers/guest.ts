import "server-only";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process isSameGuestId 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain api-middleware
 * @scope global
 */

export function isSameGuestId(a: string, b: string) {
  return (
    String(a || "")
      .trim()
      .toLowerCase() ===
    String(b || "")
      .trim()
      .toLowerCase()
  );
}
