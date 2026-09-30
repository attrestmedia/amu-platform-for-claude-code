import type { SpeechBudgetOwnerType } from "consts/system/speechRuntimeControls";
import type { AdultEligibility } from "./voiceDataConsent";

/**
 * @docHint
 * @purpose EL-002 ElevenLabs 음성 기능의 이용 대상 제한
 * @process owner로 이용자 대면 여부 판정  성인 eligibility 판정  차단 사유 반환
 * @domain speech
 * @scope shared
 *
 * ---------------------------------------------------------------------------
 * 정책 정본 (2026-09-10 사용자 확정)
 *
 *   "AMU의 ElevenLabs 기반 음성 기능은 1차적으로 성인 사용자 전용으로 제한한다.
 *    ElevenLabs Startup Grant 적용 기간에는 만 18세 이하를 대상으로 하는
 *    ElevenLabs 기반 기능을 제공하지 않는다."
 *
 * 근거가 두 층이다.
 *   - Prohibited Use Policy — 13세 미만 제공 금지, 13~18세는 보호자 동의 선행. **이용자 축**
 *   - Startup Grants — "projects for children aged 18 or under"에 Grant 미제공. **프로젝트 축**
 * ---------------------------------------------------------------------------
 *
 * **두 축을 구분한다.** 정책 문장 하나로 뭉뚱그리면 매거진 내레이션까지 막히거나
 * 반대로 Tutors 음성이 열려 버린다.
 *
 *   호출 주체가 이용자 본인인가?   →  성인 전용 게이트 적용 (tutors·play)
 *   호출 주체가 편집자·운영자인가? →  게이트 미적용. 산출물은 정적 자산이며
 *                                    ElevenLabs Services를 이용자에게 제공하는 것이 아니다
 *                                    (magazine·internal)
 *
 * 후자에도 정책 2는 그대로 적용된다 — **미성년을 대상으로 하는 기능을 만들지 않는다**는
 * 제품 방향이며, 코드가 아니라 기획 단계에서 지킨다.
 */

export const ELEVENLABS_AUDIENCE_POLICY = {
  version: "2026-09-10",
  adultOnly: true,
  /**
   * 만 19세(한국 성년). Grant의 "aged 18 or under" 배제보다 한 살 넓게 잡혀 있어
   * 두 기준을 동시에 만족한다. resolveAdultEligibility의 임계값과 같은 값이어야 한다.
   */
  minimumAgeYears: 19,
  grantPeriodMinorExclusion: true,
  source: [
    "사용자 확정 2026-09-10 (EL-002)",
    "https://elevenlabs.io/use-policy",
    "https://elevenlabs.io/startup-grants",
  ],
} as const;

/** 이용자 본인이 호출 주체인 budget owner. 여기에만 성인 전용 게이트가 걸린다. */
export const ELEVENLABS_END_USER_FACING_OWNERS: readonly SpeechBudgetOwnerType[] = ["tutors", "play"];

export const ELEVENLABS_AUDIENCE_BLOCK_REASON_CODES = [
  "audience_minor",
  "audience_age_unverified",
] as const;
export type ElevenLabsAudienceBlockReasonCodeType = (typeof ELEVENLABS_AUDIENCE_BLOCK_REASON_CODES)[number];

export function isEndUserFacingSpeechOwner(owner: unknown): boolean {
  return (ELEVENLABS_END_USER_FACING_OWNERS as readonly string[]).includes(
    String(owner || "").trim().toLowerCase(),
  );
}

/**
 * 이용자 대면 ElevenLabs 호출의 대상 제한을 판정한다.
 *
 * `declared_adult`(자기 신고)를 통과시키지 않는다 — 신고 나이를 검증된 성인으로 승격하면
 * 정책이 말하는 "성인 전용"이 사실상 무제한이 된다. voiceDataConsent와 같은 기준이다.
 *
 * 현재 `resolveAdultEligibility`는 `verified_adult`를 반환하는 경로가 없으므로,
 * 이 게이트가 걸린 owner에서는 ElevenLabs 호출이 전부 차단된다. **의도된 상태다** —
 * 연령 확인 수단이 생기기 전까지 이용자 대면 음성을 열지 않는다는 정책의 코드 표현이다.
 */
export function resolveElevenLabsAudienceBlock(args: {
  owner?: SpeechBudgetOwnerType | string;
  adultEligibility: AdultEligibility;
}): ElevenLabsAudienceBlockReasonCodeType | undefined {
  if (!ELEVENLABS_AUDIENCE_POLICY.adultOnly) return undefined;
  if (!isEndUserFacingSpeechOwner(args.owner)) return undefined;
  if (args.adultEligibility === "verified_adult") return undefined;
  if (args.adultEligibility === "declared_minor") return "audience_minor";
  return "audience_age_unverified";
}
