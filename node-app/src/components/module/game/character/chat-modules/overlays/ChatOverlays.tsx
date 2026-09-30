"use client";

import React from "react";
import { AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { IExtendedNpcData } from "types/game";
import type {
  IPersonaItem,
  IChatMessage,
  IPersonaSprite,
  IKnowledgeContextSource,
  IChatModelPolicyResult,
  TextProviderType,
} from "types/ai";
import type { ICommerceProduct } from "types/commerce";
import type { TutorConversationLevel } from "consts/tutors";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { ProductList } from "components/module/commerce";
import { KnowledgeSearchPanel } from "../../../game-ui";
import ChatControlPanel from "../controls/ChatControlPanel";
import ConversationHistoryModal from "./ConversationHistoryModal";
import AIEndRequestDialog from "./AIEndRequestDialog";
import CloseConfirmDialog from "./CloseConfirmDialog";

type KnowledgeSearchPanelHandle = {
  minimize: () => void;
  maximize: () => void;
  toggle: () => void;
};

type ChatOverlaysProps = {
  // control panel
  panelType: "info" | "settings" | null;
  currentPersonaData: IPersonaItem | null;
  character: IExtendedNpcData;
  getDisplayName: (character: IExtendedNpcData) => string;
  chatViewMode: "talk" | "visual";
  onClosePanels: () => void;
  onShowConversationHistory: () => void;
  onToggleViewMode: (mode: "talk" | "visual") => void;
  modelSelection?: {
    policy: IChatModelPolicyResult | null;
    loading: boolean;
    saving: boolean;
    onSelect: (provider: TextProviderType, modelName: string) => void | Promise<void>;
  };

  // knowledge
  knowledgeSearchPanelRef: React.RefObject<KnowledgeSearchPanelHandle | null>;
  showKnowledgeSearch: boolean;
  setShowKnowledgeSearch: React.Dispatch<React.SetStateAction<boolean>>;
  chatMode: boolean;
  hasKnowledgeContext: boolean;
  onKnowledgeAdd: (knowledge: IKnowledgeContextSource) => Promise<void>;
  onDiscuss: () => void;

  // commerce / control panel gates
  isCommerceUniverse: boolean;
  canUseTranslation?: boolean;
  voicePlaybackAvailable: boolean;
  voiceInputAvailable?: boolean;
  tutorTargetLanguage?: string;
  onTutorTargetLanguageChange?: (language: string) => void;
  tutorConversationLevel?: string;
  onTutorConversationLevelChange?: (conversationLevel: TutorConversationLevel) => void;
  conversationHintsAvailable?: boolean;
  conversationHintsEnabled?: boolean;
  onConversationHintsEnabledChange?: (enabled: boolean) => void;

  // ai end
  showAIEndRequest: boolean;
  aiEndRequestMessage: string;
  canContinue: boolean;
  onEnd: () => void;
  onContinue: () => void;

  // history
  showConversationHistory: boolean;
  onCloseConversationHistory: () => void;
  messages: IChatMessage[];
  userCharacterName: string;
  npcSprite: IPersonaSprite | null;
  userSprite: IPersonaSprite | null;
  npcPortraitSrc: string | null;
  userPortraitSrc: string | null;

  // all products
  showAllProducts: boolean;
  setShowAllProducts: React.Dispatch<React.SetStateAction<boolean>>;
  allProducts: ICommerceProduct[];
  onProductClick: (p: ICommerceProduct) => void;

  // close button + confirm
  artifactOpen: boolean;
  onCloseClick: () => void;
  showCloseConfirm: boolean;
  setShowCloseConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  onConfirmClose: () => void;
  onCancelClose: () => void;
};

export function ChatOverlays({
  panelType,
  currentPersonaData,
  character,
  getDisplayName,
  chatViewMode,
  onClosePanels,
  onShowConversationHistory,
  onToggleViewMode,
  modelSelection,

  knowledgeSearchPanelRef,
  showKnowledgeSearch,
  setShowKnowledgeSearch,
  chatMode,
  hasKnowledgeContext,
  onKnowledgeAdd,
  onDiscuss,

  isCommerceUniverse,
  canUseTranslation,
  voicePlaybackAvailable,
  voiceInputAvailable,
  tutorTargetLanguage,
  onTutorTargetLanguageChange,
  tutorConversationLevel,
  onTutorConversationLevelChange,
  conversationHintsAvailable,
  conversationHintsEnabled,
  onConversationHintsEnabledChange,

  showAIEndRequest,
  aiEndRequestMessage,
  canContinue,
  onEnd,
  onContinue,

  showConversationHistory,
  onCloseConversationHistory,
  messages,
  userCharacterName,
  npcSprite,
  userSprite,
  npcPortraitSrc,
  userPortraitSrc,

  showAllProducts,
  setShowAllProducts,
  allProducts,
  onProductClick,

  artifactOpen,
  onCloseClick,
  showCloseConfirm,
  setShowCloseConfirm,
  onConfirmClose,
  onCancelClose,
}: ChatOverlaysProps) {
  return (
    <>
      {/* 컨트롤 패널 */}
      <AnimatePresence>
        {panelType && (
          <ChatControlPanel
            personaData={currentPersonaData}
            characterName={getDisplayName(character)}
            isVisible={!!panelType}
            onToggle={onClosePanels}
            onShowConversationHistory={onShowConversationHistory}
            panelType={panelType}
            chatViewMode={chatViewMode}
            onToggleViewMode={(mode) => onToggleViewMode(mode)}
            modelSelection={modelSelection}
            canUseTranslation={canUseTranslation}
            voicePlaybackAvailable={voicePlaybackAvailable}
            voiceInputAvailable={voiceInputAvailable}
            tutorTargetLanguage={tutorTargetLanguage}
            onTutorTargetLanguageChange={onTutorTargetLanguageChange}
            tutorConversationLevel={tutorConversationLevel}
            onTutorConversationLevelChange={onTutorConversationLevelChange}
            conversationHintsAvailable={conversationHintsAvailable}
            conversationHintsEnabled={conversationHintsEnabled}
            onConversationHintsEnabledChange={onConversationHintsEnabledChange}
          />
        )}
      </AnimatePresence>

      {/* 지식 검색 패널 */}
      <KnowledgeSearchPanel
        ref={knowledgeSearchPanelRef}
        isVisible={showKnowledgeSearch && chatMode}
        onToggle={() => setShowKnowledgeSearch(!showKnowledgeSearch)}
        onKnowledgeAdd={onKnowledgeAdd}
        onDiscuss={onDiscuss}
        hasKnowledgeContext={hasKnowledgeContext}
      />

      {/* AI 종료 요청 다이얼로그 */}
      <AIEndRequestDialog
        open={showAIEndRequest}
        message={aiEndRequestMessage}
        canContinue={canContinue}
        onEnd={onEnd}
        onContinue={onContinue}
      />

      {/* 대화 기록 모달 */}
      <ConversationHistoryModal
        isOpen={showConversationHistory}
        onClose={onCloseConversationHistory}
        messages={messages}
        characterName={character.name}
        userCharacterName={userCharacterName}
        characterSprite={npcSprite}
        userSprite={userSprite}
        characterPortraitSrc={npcPortraitSrc}
        userPortraitSrc={userPortraitSrc}
      />

      {/* 전체 상품 보기 */}
      {isCommerceUniverse && showAllProducts && allProducts.length > 0 && (
        <div className="fixed inset-0 z-40 bg-white overflow-y-auto">
          <ProductList
            products={allProducts}
            maxItems={100}
            onProductClick={onProductClick}
            onProductClose={() => setShowAllProducts(false)}
            layout="grid"
            title="전체 상품"
          />
        </div>
      )}

      {/* 닫기 버튼 - chatmode가 아닌 경우에만 표시 */}
      {!chatMode && !artifactOpen && (
        <div className="absolute top-2 right-2 z-40">
          <Button
            variant="blank"
            size="icon-sm"
            rounded="full"
            className="text-white bg-[rgba(0,0,0,0.5)] hover:bg-[rgba(0,0,0,0.7)]"
            onClick={onCloseClick}
          >
            <X className="icon-xs" />
            <Lang as="span" className="sr-only" text={{ ko: "닫기", en: "Close" }} />
          </Button>
        </div>
      )}

      {/* 닫기 확인 다이얼로그 */}
      <CloseConfirmDialog
        open={showCloseConfirm}
        onOpenChange={setShowCloseConfirm}
        onConfirm={onConfirmClose}
        onCancel={onCancelClose}
      />
    </>
  );
}
