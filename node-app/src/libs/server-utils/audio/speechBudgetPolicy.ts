import {
  SPEECH_BUDGET_REQUIRED_PROVIDERS,
  isSpeechBudgetOwner,
  type SpeechBudgetOwnerType,
} from "consts/system/speechRuntimeControls";
import type { ISpeechBillingContext } from "./types";

/**
 * @docHint
 * @purpose EL-204 speech 지출 상한의 순수 판정 규칙 (강제 대상·owner·기간 키)
 * @process provider 판정  owner 판정  KST 기간 키 산출
 * @domain speech
 * @scope shared
 *
 * DB·env를 건드리는 speechBudgetGuard와 파일을 나눈 이유는 elevenlabsCredential과 같다 —
 * 규칙만 담은 모듈은 DB 환경변수 없이 테스트되어야 한다. 실제로 합쳐 두었다가
 * 계약 테스트가 MONGODB_URL 누락으로 깨졌다.
 */

export function isBudgetEnforcedProvider(provider: string) {
  return (SPEECH_BUDGET_REQUIRED_PROVIDERS as readonly string[]).includes(
    String(provider || "").trim().toLowerCase(),
  );
}

/**
 * 지출을 달 owner를 서버가 판정한다.
 *
 * 클라이언트가 보낸 값을 신뢰하지 않는다. 명시되지 않은 호출 경로는 `undefined`이며
 * 강제 대상 provider에서는 곧 차단이다 — **새 호출 경로는 owner를 선언해야 예산을 쓸 수 있다.**
 */
export function resolveSpeechBudgetOwner(billing?: ISpeechBillingContext): SpeechBudgetOwnerType | undefined {
  const declared = (billing?.meta as Record<string, unknown> | undefined)?.budgetOwner;
  if (isSpeechBudgetOwner(declared)) {
    return String(declared).trim().toLowerCase() as SpeechBudgetOwnerType;
  }
  if (billing?.routeHint === "tutors") return "tutors";
  return undefined;
}

/**
 * 소비 시점의 KST 달력 경계로 기간 키를 만든다.
 *
 * UTC로 자르면 한국 운영자가 보는 "오늘"과 집계의 "오늘"이 9시간 어긋난다.
 * 상한이 풀리는 시점이 화면과 달라지므로 KST로 고정한다.
 * provider 측 키 quota의 리셋 경계와는 별개다(EL-R18) — 두 값을 합치지 않는다.
 */
export function resolveSpeechBudgetPeriodKeys(at: Date = new Date()) {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.toISOString().slice(0, 10);
  return { day, month: day.slice(0, 7) };
}
