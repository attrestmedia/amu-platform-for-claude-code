/**
 * @docHint
 * @purpose Play NPC 대화 품질 판정과 친밀도 정산 상한 정책
 * @process 서버 저장 메시지 최소 턴/토큰 판정  세션 증가량 계산  일일 상한과 stale lock 기준 제공
 * @domain game.npc-intimacy
 * @scope policy
 */

export const NPC_INTIMACY_POLICY = Object.freeze({
  minUserMessages: 2,
  minAssistantMessages: 2,
  minTotalTokens: 60,
  baseSessionGain: 2,
  bonusTokenThreshold: 160,
  bonusTokenGain: 1,
  dailyGainLimit: 10,
  applyingStaleMs: 5 * 60 * 1000,
  maxMessagesEvaluated: 500,
});
