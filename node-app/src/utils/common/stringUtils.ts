/**
 * @docHint
 * @purpose stringUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain utils
 * @scope shared
 */

// getFirstChar 정본은 @amu-labs/utils로 이관(S5). 로컬 구현 제거 후 재수출.
export { getFirstChar } from "@amu-labs/utils";

// 문장의 첫글자만 대문자로 변환
export function getCapitalized(str: string): string {
  const s = String(str);
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// 문장에서 모든 단어의 첫글자만 대문자로 변환
export function getCapitalizedWord(str: string): string {
  const s = String(str);
  if (!s) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

// key 형식의 문자열을 각 단어의 첫글자가 대문자인 단어로 변환
export function getKeyToWord(key: string) {
  return getCapitalizedWord(key.split("_").join(" "));
}

// 안전 문자 반환
export function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}
