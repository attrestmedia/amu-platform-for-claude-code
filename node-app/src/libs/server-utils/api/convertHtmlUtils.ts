import "server-only";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process stripHtmlToText 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain content-sanitize
 * @scope global
 */

// 서버용: HTML -> plain text
function decodeBasicEntities(s: string) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

// 서버용: HTML -> script 제거
export function stripHtmlToText(input: unknown) {
  const html = String(input ?? "");
  const noScriptStyle = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = noScriptStyle.replace(/<[^>]+>/g, " ");
  const decoded = decodeBasicEntities(noTags);
  return decoded.replace(/\s+/g, " ").trim();
}
