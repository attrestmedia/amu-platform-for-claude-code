function optionalBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return fallback;
}

export const MARKETING_FEATURE_ENABLED = optionalBool(process.env.NEXT_PUBLIC_MARKETING_FEATURE_ENABLED, false);

/**
 * 마케팅 워크스페이스 운영 탭.
 *
 * 워크스페이스 셸(MarketingOperationsShell)의 라우팅 판정과 공개 랜딩이 주장하는 "운영 탭 N개"가
 * 같은 값을 보도록 여기에 단일 정의한다. 랜딩은 근거 없는 수치를 쓸 수 없으므로(Charter §6.4)
 * 노출 숫자는 반드시 이 배열의 길이에서 파생시킨다.
 */
export const MARKETING_OPERATION_TABS = [
  "queue",
  "system",
  "generation",
  "review",
  "keyword",
  "ads",
  "promo",
  "newsletter",
  "performance",
] as const;

export type MarketingOperationTab = (typeof MARKETING_OPERATION_TABS)[number];
