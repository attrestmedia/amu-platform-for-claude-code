import type { IntimacyLevelType } from "consts/game/gameEntities";

/**
 * @docHint
 * @purpose Play NPC 대화 종료 후 표시·공유하는 서버 정산 결과 계약
 * @process appliedGain과 최종 intimacy로 이전값 계산  서버 미지급 XP는 0 고정  UI/export 공유
 * @domain game.npc-conversation-result
 * @scope shared-dto
 */

export type NpcConversationResult = {
  npcId: string;
  npcName: string;
  intimacyBefore: number;
  intimacyAfter: number;
  intimacyGain: number;
  intimacyLevel: IntimacyLevelType;
  xpGain: 0;
};

