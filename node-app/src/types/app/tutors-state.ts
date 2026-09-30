import type { TutorConversationLevel, TutorGoalType } from "consts/tutors";

export type TutorsServiceId = "tutors";

export interface ITutorsSelectedPersona {
  personaId: string; // pid
  universeId: string; // 실제 소속 유니버스
  accessKind?: "owner" | "gift";
  giftGrantId?: string;
  selectedAt: string; // ISO
  firstChatAt?: string; // ISO (대화 시작 시점)
  lockedUntil?: string; // ISO (없으면 firstChatAt 기준으로 “잠금 상태” 판단 가능)
  lockReason?: string;
  chatDates?: string[]; // KST YYYY-MM-DD, 연속 학습 미션 계산용
}

export interface ITutorsGiftGrant {
  grantId: string;
  sourcePersonaId: string;
  sourceOwnerId: string;
  status: "pending" | "accepted" | "rejected" | "revoked";
  message?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ITutorsSettings {
  operationMode?: "free" | "guided";
  correctionLevel?: "none" | "light" | "strict";
  includeKnowledgeDefault?: boolean;
  conversationLevel?: TutorConversationLevel;
  goalType?: TutorGoalType;
}

export interface ITutorsKnowledgeSource {
  id: string; // sourceId
  url: string;
  title?: string;

  enabled: boolean; // 소스 사용 여부
  active: boolean; // 현재 활성 여부

  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface ITutorsState {
  selected: ITutorsSelectedPersona[]; // 최대 5
  settings: ITutorsSettings;
  knowledgeSources: ITutorsKnowledgeSource[];
  giftGrants?: ITutorsGiftGrant[];
}
