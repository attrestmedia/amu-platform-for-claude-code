/**
 * @docHint
 * @purpose system_settings key 명명 규칙 정의
 * @process key 형식 검증  쓰기 시점 강제
 * @domain system-control
 * @scope shared
 */

/**
 * `<domain>.<name>.v<N>` 형식.
 * - 소문자 · 숫자 · 하이픈만 쓰고 `.`으로 구분한다
 * - domain과 name이 각각 최소 1개씩 있어야 하며 마지막 조각은 반드시 `v<N>`이다
 * - 저장 구조가 바뀌면 version을 올린다. 기존 key의 값 모양을 조용히 바꾸지 않는다
 */
export const SYSTEM_SETTING_KEY_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+\.v[1-9]\d*$/;

export function assertWritableSystemSettingKey(key: string) {
  const value = String(key || "").trim();
  if (SYSTEM_SETTING_KEY_PATTERN.test(value)) return value;

  const err = new Error("invalid_system_setting_key") as Error & {
    errorCode: string;
    status: number;
    detail?: unknown;
  };
  err.errorCode = "INVALID_INPUT";
  err.status = 400;
  err.detail = {
    key: value,
    expected: "<domain>.<name>.v<N>",
    hint: "소문자·숫자·하이픈과 마침표만 쓰고 마지막 조각을 v1처럼 버전으로 끝낸다.",
  };
  throw err;
}
