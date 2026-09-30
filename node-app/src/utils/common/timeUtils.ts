/**
 * @docHint
 * @purpose timeUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain utils
 * @scope shared
 */

// 밀리초를 시간으로 변환
export const millisecondsToHours = (ms: number): number => {
  return Math.floor(ms / (1000 * 60 * 60));
};

// timestamp 변환 (string/Date 혼용 방어)
export const toDate = (t: unknown): Date => {
  if (t instanceof Date) return t;
  if (typeof t === "string" || typeof t === "number") return new Date(t);
  return new Date(0);
};
