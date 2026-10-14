/**
 * # 기본 정책
 * - 기본 비용 책정은 서버/유지보수/관리 등의 비즈니스 및 인프라 유지를 고려하여,
 * - original api 토큰 보다 약 35% ~ 40% 차감 (원가 대비 약 1.54 ~ 1.67배)
 * - { input: number, output: number } => "코인 1개당" 사용 가능한 토큰 수
 * - D22 R3 사용자 결정(2026-09-29): 해당 산정의 비교 기준은 input/output 공통 provider COGS $0.000336/coin이다.
 *   AI_SELL_TOKENS_PER_COIN은 공식 USD/1M token 단가로부터 역산하고, 지정 fixed charge는 USD/$0.000336을 올림한다.
 * - 비용과 모델은 각 api 프로바이더에 따라 변동될 수 있음. 주기적으로 체크할 것
 */

/**
 * # key 규칙: `${provider}:${model}[:${variant}][:${modality}]`
 * - provider: google/openai/claude/deepseek/xai
 * - variant: short/long/720p/1024x1792 등 “같은 모델군 내 옵션”
 * - modality: text/audio/image (있으면 항상 마지막 segment)
 * - alias 내부 표준 단일 키. 업스트림 실모델ID는 modelRole.ts에서 변환
 */

import { AI_SELL_FIXED_COSTS, AI_SELL_TOKENS_PER_COIN } from "../ai/generated/modelCatalog.generated";
import type { AssertAssignable } from "../ai/catalogShapeAssertion";
type TokenPerCoin = Readonly<{ input: number; output: number }>;
type FixedCost = Readonly<{
  perSecond?: number;
  perMinute?: number;
  perImage?: number;
  perVideo?: number;
  /** EL-203 — 문자 1,000자당 코인. provider TTS 청구 단위(character)에 맞춘다. */
  perThousandCharacters?: number;
  /** EL-203 — provider credit 1개당 코인. */
  perCredit?: number;
}>;

export type PricingRolesCanonicalShape = [
  AssertAssignable<typeof AI_SELL_TOKENS_PER_COIN, Record<string, TokenPerCoin>>,
  AssertAssignable<typeof AI_SELL_FIXED_COSTS, Record<string, FixedCost>>,
];

export const SUBSCRIPTION_PLANS = [
  { tier: 1, amount: 30000 },
  { tier: 2, amount: 50000 },
  { tier: 3, amount: 100000 },
];
