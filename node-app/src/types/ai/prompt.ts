export type RouteHintBaseType = "ai" | "commerce";
export type RouteHintType = RouteHintBaseType | "tutors";
export type SystemPromptOptionsType = {
  language?: "ko" | "en";
  allowNative?: boolean;
  addTranslation?: string | boolean; // 번역 응답 대상 언어 코드 ("en", "ko", "ja", ...)
  tutorTargetLanguage?: string; // Tutors 채팅에서 캐릭터가 사용할 강제 응답 언어
  tutorConversationLevel?: string; // Tutors 채팅에서 현재 세션에 적용할 대화 수준
  additionalInstructions?: string;
  knowledgeContext?: string;
};

export type KnowledgeContextSourceType = "wp-post" | "direct" | "external";

export interface IKnowledgeContextSource {
  id: string;
  sourceType: KnowledgeContextSourceType;
  title: string;
  content: string;
  contentHtml?: string;
  url?: string;
  sourceLabel?: string;
  wpPostId?: number;
}

// 서버 authoritative 모드 고정
export type SystemPromptModeType = "server";
