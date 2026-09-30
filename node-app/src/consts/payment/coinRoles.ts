// 결제 코인 기본 설정
export const COIN_PER_WON = 1; // 원 → 코인 (1원당 1코인)
export const WON_PER_COIN = 1; // 코인 → 원 (1코인당 1원)
export const SUBSCRIBER_BONUS = 5; // 보너스 설정 (% 단위)
export const COIN_CHARGE_VAT_RATE = 0.1; // 코인 충전 공급가액에 별도 적용
export const COIN_CHARGE_TAX_TREATMENT = "vat_at_charge" as const;
export const COIN_CHARGE_TAX_POLICY_VERSION = "coin-vat-v1-2026-07";
export const MIN_CUSTOM_CHARGE_SUPPLIED_AMOUNT = 1_000;
export const CUSTOM_CHARGE_SUPPLIED_AMOUNT_UNIT = 100;
export const MAX_CUSTOM_CHARGE_SUPPLIED_AMOUNT = 100_000; // 부가세 제외 공급가액 기준

// 유니버스 전용 결제 정책(v1-2026-07)
export const UNIVERSE_COIN_POLICY_VERSION = "universe-coin-v1-2026-07";
export const UNIVERSE_MEMBERSHIP_SUPPLIED_AMOUNT = 50_000;
export const UNIVERSE_COIN_BONUS_RATE = 5;
export const UNIVERSE_RENEWAL_LEAD_DAYS = 10;
export const UNIVERSE_INACTIVITY_CLOSE_MONTHS = 24;
export const UNIVERSE_INACTIVITY_NOTICE_DAYS = 30;

export const UNIVERSE_COIN_PACKS: Record<number, number> = {
  100_000: 105_000,
  300_000: 315_000,
  500_000: 525_000,
  1_000_000: 1_050_000,
};

// 코인팩(정액 충전) 공급가액 테이블: 부가세 별도, 공급가액과 코인은 기본 1:1
// | 공급가액 | 지급 코인 | 보너스 | 공급가 기준 원/코인 |
// |---------:|----------:|--------:|---------------------:|
// | 1,000원 | 1,000코인 | 0.00% | 1.0000원 |
// | 3,000원 | 3,000코인 | 0.00% | 1.0000원 |
// | 4,800원 | 5,000코인 | 4.17% | 0.9600원 |
// | 9,800원 | 10,000코인 | 2.04% | 0.9800원 |
// | 19,600원 | 20,000코인 | 2.04% | 0.9800원 |
// | 49,800원 | 52,000코인 | 4.42% | 0.9577원 |
// | 99,800원 | 105,000코인 | 5.21% | 0.9505원 |
export const COIN_PACKS: Record<number, number> = {
  1000: 1000,
  3000: 3000,
  4800: 5000,
  9800: 10000,
  19600: 20000,
  49800: 52000,
  99800: 105000,
};
