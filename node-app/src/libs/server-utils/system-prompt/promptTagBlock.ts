/**
 * @docHint
 * @purpose system prompt의 태그 블록 주입 계약 — 같은 태그를 두 번 열지 않는다
 * @process 빈 내용 무시  이미 존재하는 태그 유지  최상단 1회 삽입
 * @domain ai.prompt
 * @scope server
 */

/**
 * 태그 블록을 프롬프트 최상단에 한 번만 넣는다.
 * 같은 태그가 이미 있으면 원본을 그대로 돌려줘 중첩 태그가 생기지 않게 한다.
 */
export function injectTaggedBlockOnce(base: string, tag: string, content: string) {
  const b = String(base || "");
  const c = String(content || "").trim();
  if (!c) return b;

  const begin = `<${tag}>`;
  const end = `</${tag}>`;
  if (b.includes(begin)) return b; // 중복 방지

  const block = `${begin}\n${c}\n${end}\n`;
  // 정책은 system prompt 최상단 배치 (우선순위/일관성)
  return `${block}\n${b.trimStart()}`;
}
