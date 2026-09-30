import type { BillingKeyLikeType } from "./pricing";

// 멀티모달/고정형 모두 포괄하는 사용량 타입
export interface ITokenUsageBreakdown {
  text?: { input?: number; output?: number };
  audio?: { input?: number; output?: number };
  image?: { input?: number; output?: number };
  video?: { input?: number; output?: number };
}

export interface IFixedUsage {
  seconds?: number;
  minutes?: number;
  images?: number;
  videos?: number;
  texts?: number;
  /**
   * EL-203 — TTS 문자 과금. `texts`(생성 건수)와 다른 축이다.
   * 문자 수는 문자 수로만 기록한다. "1,000자 ≈ 음성 1분" 같은 차원 간 환산을 하지 않는다(ADR-EL-001 D5).
   */
  characters?: number;
  /** provider가 credit 단위로 청구할 때. 문자/초로 자동 해석하지 않는다. */
  credits?: number;
}

export interface ICalcParams {
  billingKey: BillingKeyLikeType;
  usage?: ITokenUsageBreakdown; // 토큰 기반 과금
  fixed?: IFixedUsage; // 초/분/건당 과금
}
