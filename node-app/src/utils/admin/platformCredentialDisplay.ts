import type { LanguageType } from "types/language";

/**
 * @docHint
 * @purpose 자격증명 패널의 저장 상태 표기 규칙
 * @process 저장 여부 판정  placeholder 결정
 * @domain security
 * @scope admin
 *
 * 정책 정본: node-app `rules/platform-credentials.md`
 *
 * **placeholder는 "저장 여부"만 나타낸다.** 검증·활성 상태는 배지와 `active vN · latest vN` 줄이
 * 이미 전달하므로 placeholder까지 그 정보를 섞으면 세 곳이 같은 말을 다르게 한다.
 *
 * 자격증명 패널을 새로 만들거나 고칠 때 이 모듈을 쓴다. 컴포넌트마다 조건을 다시 쓰면
 * 패널이 늘어날 때마다 표기가 갈린다 — 실제로 그렇게 갈렸다(2026-08-07).
 */

/** 저장된 값이 있다는 표시. 값 자체를 절대 노출하지 않는다 */
export const STORED_CREDENTIAL_MASK = "●●●●●●●●";

/**
 * 값이 저장되어 있는지 판정한다.
 *
 * `configuredFields`는 **최신 버전** 기준이므로, 저장만 하고 검증·활성화를 하지 않은 값도 저장됨으로 본다.
 * 사용자가 알고 싶은 것은 "지금 이 칸에 값이 들어 있는가"이지 "그 값이 유효한가"가 아니다.
 */
export function isStoredCredentialField(configuredFields: readonly string[] | undefined, fieldKey: string): boolean {
  return Boolean(configuredFields?.includes(fieldKey));
}

/**
 * 자격증명 입력칸의 placeholder를 결정한다.
 *
 * 저장됨   ●●●●●●●●        입력하면 새 버전이 된다
 * 미저장   emptyLabel      아직 아무 값도 없다
 */
export function resolveCredentialFieldPlaceholder(params: {
  configuredFields: readonly string[] | undefined;
  fieldKey: string;
  /** 미저장 상태에서 보여줄 문구 (i18n 적용된 문자열) */
  emptyLabel: string;
}): string {
  return isStoredCredentialField(params.configuredFields, params.fieldKey)
    ? STORED_CREDENTIAL_MASK
    : params.emptyLabel;
}

/** 최신 자격증명 버전이 저장된 시각을 화면용 날짜로 표시한다. */
export function formatCredentialResetDate(value: string | undefined, language: LanguageType): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
