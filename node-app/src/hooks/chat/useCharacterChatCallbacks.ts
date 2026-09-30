import { useCallback } from "react";
import type { IExtendedNpcData } from "types/game";
import type { IChatMessage } from "types/ai";
import { usePromptStore } from "store/chat";
import type { NpcConversationResult } from "types/game/npc-conversation-result";

/**
 * @docHint
 * @purpose useCharacterChatCallbacks 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-ui
 * @scope client
 */

type PanelType = "info" | "settings" | null;
type KnowledgeSearchPanelRef = {
  minimize: () => void;
  maximize: () => void;
  toggle: () => void;
} | null;

interface Params {
  // refs
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
  knowledgeSearchPanelRef: React.RefObject<KnowledgeSearchPanelRef>;

  // external
  onOpenChange: (open: boolean) => void;
  character: IExtendedNpcData | null;
  messagesLength: number;
  handleConversationEnd: () => Promise<NpcConversationResult | null>;
  flushPendingPersonaPatches: () => Promise<void>;
  onConversationResult: (result: NpcConversationResult) => void;

  // local states & setters
  panelType: PanelType;
  setPanelType: React.Dispatch<React.SetStateAction<PanelType>>;
  setShowKnowledgeSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setShowChatItemBox: React.Dispatch<React.SetStateAction<boolean>>;

  setArtifactOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCloseConfirm: React.Dispatch<React.SetStateAction<boolean>>;

  setShowAIEndRequest: React.Dispatch<React.SetStateAction<boolean>>;
  setAIEndRequestMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsForceEnd: React.Dispatch<React.SetStateAction<boolean>>;

  setShowConversationHistory: React.Dispatch<React.SetStateAction<boolean>>;
  getMessages?: () => IChatMessage[]; // CharacterChat의 messages 읽기
  getLastProductCodes?: () => string[] | null;
}

export function useCharacterChatCallbacks({
  chatInputRef,
  knowledgeSearchPanelRef,
  onOpenChange,
  character,
  messagesLength,
  handleConversationEnd,
  flushPendingPersonaPatches,
  onConversationResult,
  panelType,
  setPanelType,
  setShowKnowledgeSearch,
  setShowChatItemBox,
  setArtifactOpen,
  setShowCloseConfirm,
  setShowAIEndRequest,
  setAIEndRequestMessage,
  setIsForceEnd,
  setShowConversationHistory,
}: Params) {
  // 지식 검색 패널 토글
  const handleToggleKnowledgeSearchPanel = useCallback(() => {
    setShowKnowledgeSearch((prev) => {
      if (!prev && knowledgeSearchPanelRef.current) {
        knowledgeSearchPanelRef.current.maximize();
      }
      return !prev;
    });
    setShowChatItemBox(false);
  }, [setShowKnowledgeSearch, setShowChatItemBox, knowledgeSearchPanelRef]);

  // 입력 포커스 + 아이템 박스 닫기
  const handleFocusInput = useCallback(() => {
    chatInputRef.current?.focus();
    setShowChatItemBox(false);
  }, [chatInputRef, setShowChatItemBox]);

  // 대화 기록 모달
  const handleShowConversationHistory = useCallback(() => {
    setShowConversationHistory(true);
  }, [setShowConversationHistory]);
  const handleCloseConversationHistory = useCallback(() => {
    setShowConversationHistory(false);
  }, [setShowConversationHistory]);

  // 패널 토글
  const handleToggleInfoPanel = useCallback(() => {
    setPanelType(panelType === "info" ? null : "info");
  }, [panelType, setPanelType]);

  const handleToggleSettingsPanel = useCallback(() => {
    setPanelType(panelType === "settings" ? null : "settings");
  }, [panelType, setPanelType]);

  const handleClosePanels = useCallback(() => {
    setPanelType(null);
  }, [setPanelType]);

  // 아티팩트 열기/닫기
  const handleArtifactOpen = useCallback(() => setArtifactOpen(true), [setArtifactOpen]);
  const handleArtifactClose = useCallback(() => setArtifactOpen(false), [setArtifactOpen]);

  // 닫기 플로우
  const handleCloseClick = useCallback(() => setShowCloseConfirm(true), [setShowCloseConfirm]);

  const handleConfirmClose = useCallback(async () => {
    setShowCloseConfirm(false);
    if (character && messagesLength > 0) {
      try {
        const result = await handleConversationEnd();
        if (result) {
          onConversationResult(result);
          return;
        }
      } catch {
        // 로깅은 상위에서 처리 중이므로 여기서는 조용히 실패 허용
      }
    }
    onOpenChange(false);
  }, [
    setShowCloseConfirm,
    character,
    messagesLength,
    handleConversationEnd,
    onConversationResult,
    onOpenChange,
  ]);

  const handleCancelClose = useCallback(() => setShowCloseConfirm(false), [setShowCloseConfirm]);

  // AI 종료 다이얼로그 - 종료
  const handleAIEndClose = useCallback(async () => {
    setShowAIEndRequest(false);
    setAIEndRequestMessage("");
    setIsForceEnd(false);

    if (character && messagesLength > 0) {
      try {
        const result = await handleConversationEnd();
        await flushPendingPersonaPatches();
        if (result) {
          onConversationResult(result);
          return;
        }
      } catch {
        // 조용히 실패 허용 (상위 로깅)
      }
    }
    onOpenChange(false);
  }, [
    setShowAIEndRequest,
    setAIEndRequestMessage,
    setIsForceEnd,
    character,
    messagesLength,
    handleConversationEnd,
    flushPendingPersonaPatches,
    onConversationResult,
    onOpenChange,
  ]);

  // AI 종료 다이얼로그 - 계속하기
  const handleContinueChat = useCallback(() => {
    setShowAIEndRequest(false);
    setAIEndRequestMessage("");
    setIsForceEnd(false);
    chatInputRef.current?.focus();
  }, [setShowAIEndRequest, setAIEndRequestMessage, setIsForceEnd, chatInputRef]);

  // 일시 주입 유틸
  const withEphemeralAdditional = useCallback(async <T>(additional: string, fn: () => Promise<T>): Promise<T> => {
    if (!additional) return await fn();

    const ps = usePromptStore.getState();
    const prev = ps.additionalInstructions;
    const merged = [prev, additional].filter(Boolean).join("\n\n");

    // 주입
    ps.setAdditionalInstructions(merged);
    try {
      return await fn();
    } finally {
      // 반드시 복원
      usePromptStore.getState().setAdditionalInstructions(prev);
    }
  }, []);

  return {
    handleToggleKnowledgeSearchPanel,
    handleFocusInput,
    handleShowConversationHistory,
    handleCloseConversationHistory,
    handleToggleInfoPanel,
    handleToggleSettingsPanel,
    handleClosePanels,
    handleArtifactOpen,
    handleArtifactClose,
    handleCloseClick,
    handleConfirmClose,
    handleCancelClose,
    handleAIEndClose,
    handleContinueChat,
    withEphemeralAdditional,
  };
}

export default useCharacterChatCallbacks;
