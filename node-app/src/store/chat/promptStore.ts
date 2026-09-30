import { create } from "zustand";
import { useGlobalStore } from "store/global";
import { useUserDataStore, useGameStore } from "store/game";
import { normalizeChatTranslationLanguage, useTranslationStore } from "./translationStore";
import type { SystemPromptOptionsType } from "types/ai/prompt";
import type { IExtendedNpcData } from "types/game";
import { PROMPT_OPTION_CHAR_CAPS } from "consts/ai/promptCaps";
import { normalizeTutorConversationLevel, normalizeTutorTargetLanguage } from "consts/tutors";
import { promptLimitCap } from "utils/ai";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain chat
 * @scope client
 */

interface PromptState {
  currentCharacter: IExtendedNpcData | null; // 현재 선택된 NPC 캐릭터 정보
  allowNative: boolean; // NPC가 유저의 언어로 유창하게 대화할 수 있도록 허용
  additionalInstructions: string; // 유저가 추가로 전달한 규칙이나 지시사항
  archiveContext: string; // 이전 대화의 요약 내용
  knowledgeContext: string; // 캐릭터가 알고 있는 지식 정보
  addTranslation: string; // 특정 언어로 번역 응답 추가 요청
  tutorTargetLanguage: string; // Tutors 채팅에서 캐릭터가 사용할 강제 응답 언어
  tutorConversationLevel: string; // Tutors 채팅에서 현재 세션에 적용할 대화 수준
}

interface PromptActions {
  setCurrentCharacter: (character: IExtendedNpcData | null) => void;
  setAllowNative: (allow: boolean) => void;
  setAdditionalInstructions: (context: string) => void;
  setArchiveContext: (context: string) => void;
  setKnowledgeContext: (context: string) => void;
  setAddTranslation: (language: string) => void;
  setTutorTargetLanguage: (language: string) => void;
  setTutorConversationLevel: (conversationLevel: string) => void;
  getPromptOptions: () => SystemPromptOptionsType; // 서버에 전달할 옵션만 생성
}

export const usePromptStore = create<PromptState & PromptActions>((set, get) => ({
  currentCharacter: null,
  allowNative: false,
  additionalInstructions: "",
  archiveContext: "",
  knowledgeContext: "",
  addTranslation: "",
  tutorTargetLanguage: "",
  tutorConversationLevel: "",

  setAddTranslation: (language) => set({ addTranslation: language }),
  setTutorTargetLanguage: (language) => set({ tutorTargetLanguage: normalizeTutorTargetLanguage(language, "") }),
  setTutorConversationLevel: (conversationLevel) =>
    set({ tutorConversationLevel: conversationLevel ? normalizeTutorConversationLevel(conversationLevel) : "" }),

  setCurrentCharacter: (character) => {
    set({ currentCharacter: character });

    // 비대기 프리패치(캐시 채우기)
    const universeId = useGameStore.getState().universeId;
    if (universeId) {
      const uds = useUserDataStore.getState();
      uds.fetchPersonasData(universeId, "userPersonas").catch(() => {});
      uds.fetchPersonasData(universeId, "personas").catch(() => {});
    }
  },

  setAllowNative: (allow) => {
    set({ allowNative: allow });
  },

  setAdditionalInstructions: (instructions) => {
    set({ additionalInstructions: instructions });
  },

  // 아카이브 컨텍스트 설정
  setArchiveContext: (context) => {
    set({ archiveContext: context });
  },

  setKnowledgeContext: (context) => {
    set({ knowledgeContext: context });
  },

  getPromptOptions: () => {
    const {
      allowNative,
      additionalInstructions,
      knowledgeContext,
      currentCharacter,
      tutorTargetLanguage,
      tutorConversationLevel,
    } = get();
    const language = useGlobalStore.getState().language;
    const characterPolicy =
      currentCharacter?.tutorsPolicy && typeof currentCharacter.tutorsPolicy === "object"
        ? currentCharacter.tutorsPolicy
        : {};
    const fallbackTutorTargetLanguage = normalizeTutorTargetLanguage(
      characterPolicy.targetLanguage || currentCharacter?.language || "",
      "",
    );
    const resolvedTutorTargetLanguage = normalizeTutorTargetLanguage(
      tutorTargetLanguage || fallbackTutorTargetLanguage,
      "",
    );
    const resolvedTutorConversationLevel = normalizeTutorConversationLevel(
      tutorConversationLevel || characterPolicy.conversationLevel,
    );

    const translationSettings = useTranslationStore.getState();
    const shouldAddTranslation = translationSettings.enabled && translationSettings.targetLanguage;
    const addTranslation = shouldAddTranslation ? normalizeChatTranslationLanguage(translationSettings.targetLanguage) : "";

    // 서버에서 sanitize/권위 주입, 클라는 옵션만 전달
    return {
      language,
      allowNative,
      addTranslation: addTranslation || "",
      tutorTargetLanguage: resolvedTutorTargetLanguage,
      tutorConversationLevel: resolvedTutorConversationLevel,
      additionalInstructions: promptLimitCap(additionalInstructions, PROMPT_OPTION_CHAR_CAPS.additionalInstructions),
      knowledgeContext: promptLimitCap(knowledgeContext, PROMPT_OPTION_CHAR_CAPS.knowledgeContext),
    };
  },
}));
