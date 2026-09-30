// toErrorMessage·UnknownRecord·ErrorLikeType·isUnknownRecord·toErrorLike 정본은
// @amu-labs/utils로 이관(S5/S8). 로컬 중복 구현 제거 후 재수출.
import { isUnknownRecord, toErrorLike, toErrorMessage } from "@amu-labs/utils";
import type { UnknownRecord, ErrorLikeType } from "@amu-labs/utils";

export { isUnknownRecord, toErrorLike, toErrorMessage };
export type { UnknownRecord, ErrorLikeType };

export type GenerateActionError = {
  message?: unknown;
  errorCode?: unknown;
};

export function toUnknownRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

// `Record<string, any>` 형태의 plain object 식별 유틸. JSON 파싱 결과 등의 가드용
export function isPlainObject(value: unknown): value is UnknownRecord {
  return isUnknownRecord(value);
}

// axios 등 응답에서 HTTP status를 안전 추출
export function getResponseStatus(error: unknown): number | undefined {
  const err = toErrorLike(error);
  const fromResponse = isUnknownRecord(err.response) ? Number((err.response as UnknownRecord).status) : NaN;
  if (Number.isFinite(fromResponse)) return fromResponse;
  const direct = Number(err.status);
  return Number.isFinite(direct) ? direct : undefined;
}

// axios/fetch 응답 에러에서 response.data.message → err.message → fallback 순으로 우선 추출.
// `catch (e: any) { e?.response?.data?.message || e?.message }` 패턴을 안전하게 대체.
export function extractApiErrorMessage(value: unknown, fallback = ""): string {
  const err = toErrorLike(value);
  const response = isUnknownRecord(err.response) ? (err.response as UnknownRecord) : null;
  const data = response && isUnknownRecord(response.data) ? (response.data as UnknownRecord) : null;
  if (data && typeof data.message === "string" && data.message) return data.message;
  if (data && typeof data.error === "string" && data.error) return data.error;
  if (typeof err.message === "string" && err.message) return err.message;
  return fallback;
}

// 라우트 catch 블록 공통 패턴: { message, errorCode, status } 정규화 추출.
// 기존 `catch (err: any) { err?.message; err?.errorCode; err?.status }` 패턴을
// `const { message, errorCode, status } = extractCodedError(err, { ... })`로 대체.
export type CodedErrorInfoType = {
  message: string;
  errorCode: string;
  status: number;
};

export function extractCodedError(
  value: unknown,
  fallback?: Partial<CodedErrorInfoType>,
): CodedErrorInfoType {
  const err = toErrorLike(value);
  const statusNum = Number(err.status);
  return {
    message: typeof err.message === "string" && err.message ? err.message : fallback?.message || "internal_error",
    errorCode:
      typeof err.errorCode === "string" && err.errorCode ? err.errorCode : fallback?.errorCode || "INTERNAL_ERROR",
    status: Number.isFinite(statusNum) && statusNum > 0 ? statusNum : fallback?.status || 500,
  };
}

// `unknown` → 배열 narrowing. 비배열 입력은 빈 배열로 폴백.
export function pickArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function runAfterCurrentRender(callback: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  void Promise.resolve().then(callback);
}

export function toTimestamp(value: unknown) {
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function toSafeString(value: unknown) {
  return String(value || "").trim();
}

// 입력이 문자열일 때만 trim된 값을 돌려준다. 비문자열은 빈 문자열로 폴백.
// `toSafeString`과 달리 number/boolean 등 비문자열 입력은 거부하므로,
// 외부 입력의 식별자/URL/이름 등 "엄격하게 문자열만 허용"하는 경계에서 사용.
export function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toSortIndex(value: unknown) {
  const index = Number(value);
  return Number.isFinite(index) ? index : 0;
}

// `role`/`tags` 형태 필드(`string | string[] | undefined`)를 안전하게 trimmed string[]로 정규화.
// - 문자열 입력은 콤마 분리 후 trim
// - 비배열/비문자열 입력은 빈 배열
// 충돌 처리(SpatialGrid, collisionUtils)처럼 입력 shape이 혼재된 곳에서 사용.
export function pickRoleList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}
