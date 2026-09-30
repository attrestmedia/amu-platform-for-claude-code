/**
 * @docHint
 * @purpose HTML 엔티티 문자열을 실제 문자로 복원하는 공용 유틸
 * @process 숫자(10/16진) + 주요 named 엔티티 치환, 미지원 엔티티는 원문 유지
 * @domain text-normalize
 * @scope shared
 */

// WordPress REST의 title.rendered/excerpt.rendered는 `&#8211;` 같은 엔티티를 그대로 담고 있어
// React 텍스트로 렌더하면 코드가 그대로 노출된다. DOM 의존성이 없는 순수 함수라
// SSR/CSR·서버 라우트 어디서든 안전하게 쓸 수 있다.
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  divide: "÷",
  laquo: "«",
  raquo: "»",
  deg: "°",
  plusmn: "±",
  euro: "€",
  pound: "£",
  yen: "¥",
  won: "₩",
};

const codePointOrRaw = (raw: string, code: number): string =>
  Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;

export const decodeHtmlEntities = (value: string): string => {
  if (!value) return "";
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (raw, hex) => codePointOrRaw(raw, Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (raw, dec) => codePointOrRaw(raw, Number(dec)))
    .replace(/&([a-z][a-z0-9]+);/gi, (raw, name) => NAMED_HTML_ENTITIES[name.toLowerCase()] ?? raw);
};
