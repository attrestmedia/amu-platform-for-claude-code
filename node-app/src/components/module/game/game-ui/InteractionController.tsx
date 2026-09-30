"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import { useNpcActionStore, useUiControlStore, useGameStore } from "store/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import { useKeyboardNavigation } from "hooks/common";
import type { ICommerceProduct } from "types/commerce";
import { projectLogicalPosition, resolveIsometricMovementRuntime, resolveNpcIdentity } from "utils/game";
import { CharacterViewer, CharacterChat } from "../character";
import NpcActionDialog from "./NpcActionDialog";
import type { NpcDialogType } from "./NpcActionDialog";
import ProductActionDialog from "./ProductActionDialog";
import type { NpcActionType, IExtendedNpcData } from "types/game";

// NpcActionType => 일관된 IExtendedNpcData로 변환하는 헬퍼
const ensureExtendedNpcData = (target: NpcActionType): IExtendedNpcData => {
  return resolveNpcIdentity(target).persona;
};

/**
 * 통합 상호작용 컨트롤러
 * NPC와 상품 상호작용을 모두 관리합니다.
 */
const InteractionController = ({ onNpcTalkStart }: { onNpcTalkStart?: (npcId: string) => void }) => {
  // NPC 상호작용 스토어
  const { isActionOpen, actionNpc, closeNpcAction } = useNpcActionStore();

  // 상품 상호작용 스토어
  const {
    productConfirmOpen,
    pendingProduct,
    confirmOpenProduct,
    cancelOpenProduct,
    startProductCooldown,
    closeProduct,
    stageChatSpeaker,
  } = useUiControlStore();

  // gameStore에서 필요한 NPC 관련 정보 가져오기
  const npcsOnMap = useGameStore((s) => s.npcs);
  const protagonist = useGameStore((s) => s.protagonist);
  const stageRuntime = useGameStore((s) => s.stageRuntime);

  // 내부 상태
  const [dialogType, setDialogType] = useState<NpcDialogType>("message");
  const [characterViewerOpen, setCharacterViewerOpen] = useState(false);
  const [characterChatOpen, setCharacterChatOpen] = useState(false);
  const [initialChatMessage, setInitialChatMessage] = useState<string | undefined>();
  const [initialProductCodes, setInitialProductCodes] = useState<string[] | undefined>(); // 상품 코드 넘기기
  const [autoAskOnOpen, setAutoAskOnOpen] = useState(false); // 자동 응답 요청

  // NPC 다이얼로그용 버튼 참조 - 추가
  const npcChatButtonRef = useRef<HTMLButtonElement>(null);
  const npcLeaveButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * 플레이어와 가장 가까운 NPC 찾기 (폴백용)
   */
  const stageNpcCandidate = useMemo(() => {
    if (actionNpc) return null;
    const candidates = npcsOnMap || [];
    if (candidates.length === 0) return null;
    const runtime = resolveIsometricMovementRuntime(stageRuntime?.data);
    if (!runtime) return null;
    const { x: px, y: py } = protagonist || { x: 0, y: 0 };

    let best = candidates[0];
    let bestDist = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      const screen = projectLogicalPosition(c.logicalPosition, runtime);
      const dx = screen.screenX - px;
      const dy = screen.screenY - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        best = c;
        bestDist = d2;
      }
    }
    return best.info;
  }, [actionNpc, npcsOnMap, protagonist, stageRuntime?.data]);

  // 최종 챗 캐릭터: actionNpc > stageChatSpeaker > 근접 NPC(폴백)
  // GameStage가 스테이지 전환/충돌 갱신마다 화자를 골라 stageChatSpeaker에 업데이트
  // 비어있을 때만 근접 NPC 계산으로 폴백함
  const chatCharacter = useMemo(
    () => actionNpc || stageChatSpeaker || stageNpcCandidate,
    [actionNpc, stageChatSpeaker, stageNpcCandidate]
  );

  /**
   * ProductActionModal 물어보기 처리 핸들러
   */
  const handleProductAsk = useCallback(
    (p?: ICommerceProduct) => {
      if (!p) return;

      setInitialProductCodes(p.id ? [p.id] : undefined); // ProductCode 전달
      setInitialChatMessage(`${p.title ? `“${p.title}”` : "이"} 상품에 대해 알려드릴까요?`); // 초기 자동 질문 설정
      setAutoAskOnOpen(true); // 챗 진입 시 자동 질의 ON
      setCharacterChatOpen(true);

      closeProduct(); // 상품 상세 닫기 + 쿨다운
      startProductCooldown(GC.INTERACTION.COOLDOWN_MS);
    },
    [closeProduct, startProductCooldown]
  );

  /**
   * NPC 상호작용 핸들러들
   */
  const handleNpcClose = useCallback(() => {
    if (dialogType === "chat") {
      setDialogType("message");
    }
    closeNpcAction();
  }, [closeNpcAction, dialogType]);

  const handleNpcChat = useCallback((message?: string) => {
    setInitialChatMessage(message);
    setCharacterChatOpen(true);
    onNpcTalkStart?.(chatCharacter ? String(ensureExtendedNpcData(chatCharacter).pid || "") : "");
    // closeNpcAction();
  }, [chatCharacter, onNpcTalkStart]);

  const handleNpcThumbnailClick = useCallback(() => {
    setCharacterViewerOpen(true);
  }, []);

  const handleViewerOpenChange = useCallback((open: boolean) => {
    setCharacterViewerOpen(open);
  }, []);

  const handleChatOpenChange = useCallback(
    (open: boolean) => {
      setCharacterChatOpen(open);

      // 닫힐 때만 NPC 액션/프롬프트 정리
      if (!open) {
        closeNpcAction();
        if (dialogType === "chat") {
          setDialogType("message");
          setInitialChatMessage(undefined);
        }
        setInitialProductCodes(undefined); // 상품 코드 리셋
        setAutoAskOnOpen(false); // 플래그 리셋
      }
    },
    [dialogType, closeNpcAction]
  );

  /**
   * 상품 상호작용 핸들러들
   */
  const handleProductConfirm = useCallback(() => {
    confirmOpenProduct();
  }, [confirmOpenProduct]);

  const handleProductCancel = useCallback(() => {
    cancelOpenProduct();
    startProductCooldown(GC.INTERACTION.COOLDOWN_MS); // 1.5초 쿨다운
  }, [cancelOpenProduct, startProductCooldown]);

  // NPC 다이얼로그 키보드 네비게이션
  const { focusedIndex: npcFocusedIndex } = useKeyboardNavigation({
    isOpen: isActionOpen && !characterChatOpen,
    refs: [npcChatButtonRef, npcLeaveButtonRef],
    direction: "horizontal",
    onEnterActions: [handleNpcChat, handleNpcClose],
    autoFocusDelay: 100,
  });

  return (
    <>
      {/* NPC 상호작용 다이얼로그 */}
      {isActionOpen && !characterChatOpen && actionNpc && (
        <NpcActionDialog
          type={dialogType}
          npc={ensureExtendedNpcData(actionNpc)}
          onClose={handleNpcClose}
          onChatClick={handleNpcChat}
          onThumbnailClick={handleNpcThumbnailClick}
          focusedIndex={npcFocusedIndex}
          chatButtonRef={npcChatButtonRef}
          leaveButtonRef={npcLeaveButtonRef}
        />
      )}

      {/* NPC 캐릭터 뷰어 */}
      {actionNpc && (
        <CharacterViewer
          open={characterViewerOpen}
          onOpenChange={handleViewerOpenChange}
          character={ensureExtendedNpcData(actionNpc)}
          isSelectionDisabled={true}
        />
      )}

      {/* NPC 캐릭터 채팅 */}
      {chatCharacter && (
        <CharacterChat
          open={characterChatOpen}
          onOpenChange={handleChatOpenChange}
          character={ensureExtendedNpcData(chatCharacter)}
          initialMessage={initialChatMessage}
          initialProductCodes={initialProductCodes}
          autoAskOnOpen={autoAskOnOpen}
        />
      )}

      {/* 상품 확인 다이얼로그 */}
      <ProductActionDialog
        open={productConfirmOpen}
        product={pendingProduct}
        locate={characterChatOpen ? "chat" : "stage"}
        onConfirm={handleProductConfirm}
        onCancel={handleProductCancel}
        onAsk={handleProductAsk}
      />
    </>
  );
};

export default InteractionController;
