export type PromptOptionCaps = {
  additionalInstructions: number;
  knowledgeContext: number;
};

// 클라이언트가 보내는 promptOptions의 "허용 최대 길이"
export const PROMPT_OPTION_CHAR_CAPS = { additionalInstructions: 6000, knowledgeContext: 12000 } as const;

// system prompt composer 내부에서 쓰는 “섹션 trim 상수” (매직넘버 제거)
export const SYSTEM_PROMPT_TRIM_CAPS = {
  additionalInstructionsMax: PROMPT_OPTION_CHAR_CAPS.additionalInstructions,
  knowledgeContextMax: PROMPT_OPTION_CHAR_CAPS.knowledgeContext,
  storeKnowledgeContextMax: 12000, // universeDetail 기반

  // universeDetail.metadata.customPrompts
  customPromptItemMax: 800,
  customPromptsTotalMax: 4000,
} as const;
