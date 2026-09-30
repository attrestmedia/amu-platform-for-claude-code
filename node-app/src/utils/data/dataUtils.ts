/**
 * @docHint
 * @purpose dataUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain utils
 * @scope global
 */

export function jsonPretty(v: unknown) {
  try {
    if (v === undefined || v === null || v === "") return "";
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

// json 파싱 실패 시 에러 던짐
export function parseJson(text: string, field: string) {
  const t = (text || "").trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`${field} JSON 파싱에 실패했습니다.`);
  }
}

// json 파싱 실패 시에도 중단없이 null 반환
export const parseJsonSafe = (raw: string) => {
  try {
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
};

export function splitCsv(s: string) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function joinCsv(arr: unknown) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

// 랜덤으로 지정된 갯수만큼 데이터를 선택하는 함수
export function getRandomDatas<T = unknown>(
  data: T[],
  count: number,
  options?: {
    uniqueOnly?: boolean;
  },
): T[] {
  // uniqueOnly 옵션이 true인 경우 중복 제거
  const filteredData = options?.uniqueOnly ? Array.from(new Set(data)) : data;
  // 배열을 랜덤하게 섞기
  const shuffled = filteredData.sort(() => 0.5 - Math.random());
  // count 개수만큼 데이터를 잘라서 반환
  return shuffled.slice(0, count);
}

// CSS 변수 값을 가져오는 헬퍼 함수
export function getCSSVariable(variableName: string, fallback = "#959595"): string {
  if (typeof window === "undefined") return fallback;

  try {
    // document.documentElement에서 CSS 변수 값 읽기
    const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();

    return value || fallback;
  } catch {
    return fallback;
  }
}
