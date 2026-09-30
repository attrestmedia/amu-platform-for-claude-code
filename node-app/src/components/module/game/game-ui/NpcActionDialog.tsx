"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@amu-labs/ui";
import Image from "next/image";
import type { IExtendedNpcData } from "types/game";
import { Lang, lang } from "../../i18n";
import { Send } from "lucide-react";
import { useUniverseData } from "hooks/game/core";
import { useChat } from "hooks/ai";
import { useAuthStore } from "store/auth";
import { useUserDataStore, useUiControlStore } from "store/game";
import { useMessageStore } from "store/chat";
import { cn } from "utils/common";
import { runAfterCurrentRender } from "utils/common/typeUtils";
import { logger } from "utils/log";
import { getPersonaPortrait } from "utils/game";
import { getKorParticle } from "utils/language";

export type NpcDialogType = "message" | "chat";

// busy 시 캡처에서 가로채는 키 목록 (모듈 스코프 상수로 두어 의존성 변동 회피)
const BLOCK_KEYS_DURING_BUSY = [
  "Enter",
  " ",
  "Spacebar",
  "Tab",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];

interface NpcActionDialogProps {
  type?: NpcDialogType;
  npc: IExtendedNpcData;
  onChatClick: (initialMessage?: string) => void;
  onClose?: () => void;
  onThumbnailClick?: () => void;
  focusedIndex?: number;
  chatButtonRef?: React.RefObject<HTMLButtonElement | null>;
  leaveButtonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
  message?: string; // 커스텀 메시지 지원
  hideButtons?: boolean; // 버튼 숨김 옵션

  // 상품 전용 속성
  thumbnailUrl?: string; // 외부 썸네일(상품 이미지 등)
  primaryLabel?: string; // 기본 버튼 라벨 커스텀
  secondaryLabel?: string; // 보조 버튼 라벨 커스텀
}

const NpcActionDialog = ({
  type = "message",
  npc,
  onClose,
  onChatClick,
  onThumbnailClick,
  focusedIndex,
  chatButtonRef,
  leaveButtonRef,
  className,
  message,
  hideButtons = false,
  thumbnailUrl,
}: NpcActionDialogProps) => {
  const [dialogMessage, setDialogMessage] = useState<string>("");
  const { universeId, isCommerceUniverse } = useUniverseData();

  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const addPersonaFromNPC = useUserDataStore((state) => state.addPersonaFromNPC); // 처음 만난 NPC 데이터 추가
  const updatePersonaInteraction = useUserDataStore((state) => state.updatePersonaInteraction); // NPC 상호작용 업데이트
  const checkPersonaExists = useUserDataStore((state) => state.checkPersonaExists); // npc가 존재 여부 확인

  // 자동 AI 응답 모드 상태 가져오기
  const autoAiResponse = useUiControlStore((state) => state.autoAiResponse);
  const setAutoAiResponse = useUiControlStore((state) => state.setAutoAiResponse);
  const lockInput = useUiControlStore((s) => s.lockInput);
  const unlockInput = useUiControlStore((s) => s.unlockInput);

  // useChat 훅 사용
  const { isLoading, requestGreeting } = useChat(npc);

  // 실행 중 플래그 - 비동기 컨텍스트 간 상태 유지 (ref: 동기 체크, state: 렌더 표시)
  const isRunningRef = useRef({
    addingPersona: false,
    loadingGreeting: false,
    startingChat: false, // 대화하기 중복 클릭 방지
  });
  // 렌더에서 isBusy를 도출하기 위한 미러 상태 — ref는 동기 갱신, state는 마이크로태스크로 지연해
  // effect 내부에서 호출되는 callback의 setState-in-effect cascade 경고를 회피
  const [busyFlags, setBusyFlags] = useState({ addingPersona: false, loadingGreeting: false });
  const setRunningFlag = useCallback((key: "addingPersona" | "loadingGreeting" | "startingChat", value: boolean) => {
    isRunningRef.current[key] = value;
    runAfterCurrentRender(() => {
      if (key === "addingPersona")
        setBusyFlags((prev) => (prev.addingPersona === value ? prev : { ...prev, addingPersona: value }));
      else if (key === "loadingGreeting")
        setBusyFlags((prev) => (prev.loadingGreeting === value ? prev : { ...prev, loadingGreeting: value }));
    });
  }, []);
  const greetingSeqRef = useRef(0); // 응답 방지 시퀀스
  const startNewSession = useMessageStore((s) => s.startNewSession); // 새 세션 생성
  const conversations = useMessageStore((s) => s.conversations); // 대화 기록 가져오기
  const conversationHistoryStatus = useMessageStore((s) => s.conversationHistoryStatus);

  const history = conversations[npc.pid];
  const hasHistoryLoaded = conversationHistoryStatus[npc.pid] === "ready";
  const hasHistory = hasHistoryLoaded && (history?.length ?? 0) > 0;

  const didStartSessionRef = useRef(false); // 중복 호출 방지용 ref
  const ensureMsgTimerRef = useRef<number | NodeJS.Timeout | null>(null); // 초기화 타임아웃 워치독 ref
  const isInitializing = type === "message" && !hasHistoryLoaded && !dialogMessage; // 이력 로딩 전 초기 상태도 로딩으로 간주

  // 공통 busy 플래그 - 로딩 / 첫 만남 처리 / 인사말 요청 중 (state 미러로 렌더 시 ref 접근 회피)
  const isBusy = isLoading || busyFlags.addingPersona || busyFlags.loadingGreeting || isInitializing;

  // 로딩 중일 때 Enter/Space를 상위로 전달하지 않도록 캡처에서 차단
  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isBusy) return;
      if (BLOCK_KEYS_DURING_BUSY.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [isBusy],
  );

  // busy 상태에 따라 전역 입력 잠금 토글
  useEffect(() => {
    const reason = "npc-action-busy";
    if (isBusy) {
      lockInput(reason);
    } else {
      unlockInput(reason);
    }
    // 컴포넌트 언마운트 시 안전 해제
    return () => unlockInput(reason);
  }, [isBusy, lockInput, unlockInput]);

  // 세션 시작 보장 함수
  const ensureSessionStarted = useCallback(() => {
    if (didStartSessionRef.current) return;
    startNewSession();
    didStartSessionRef.current = true;
  }, [startNewSession]);

  // NPC 이미지 경로 일원화: persona + imagePath 사용
  const portraitUrl = useMemo(() => {
    try {
      // universeId 가 없으면 persona.universeId 를 우선 사용
      const resolvedUniverseId = npc.universeId || universeId || "default";

      return getPersonaPortrait(npc, {
        universeId: resolvedUniverseId,
        type: "npc",
        isCommerceUniverse,
      });
    } catch {
      return "/assets/personas/default/profile.png"; // fallback
    }
  }, [npc, universeId, isCommerceUniverse]);

  const thumbnailSrc = thumbnailUrl ?? portraitUrl;

  // 캐릭터 만남 시 메시지 생성
  const getSimpleMeetingMessage = useCallback(() => {
    return lang({
      ko: `${getKorParticle(npc.name, "을-를")} 만났습니다. 대화를 하시겠습니까?`,
      en: `You met ${npc.name}. Would you like to talk?`,
    });
  }, [npc.name]);

  // 초기화 상태에서만 워치독 동작
  useEffect(() => {
    if (type !== "message") return;
    if (!isInitializing) return; // 초기화일 때만 워치독 가동
    if (dialogMessage) return; // 이미 메시지 있으면 불필요

    // npc 변경 등으로 들어왔을 때 이전 타이머 정리
    if (ensureMsgTimerRef.current) {
      clearTimeout(ensureMsgTimerRef.current);
      ensureMsgTimerRef.current = null;
    }

    ensureMsgTimerRef.current = setTimeout(() => {
      // 레이스 방지: 직전에 메시지가 들어왔으면 덮어쓰지 않음
      setDialogMessage((prev) => {
        if (prev) return prev;
        if (!isCommerceUniverse) setAutoAiResponse(false);
        logger.log("[NpcActionDialog] watchdog: fallback meeting message applied");
        return getSimpleMeetingMessage();
      });
    }, 1500);

    return () => {
      if (ensureMsgTimerRef.current) {
        clearTimeout(ensureMsgTimerRef.current);
        ensureMsgTimerRef.current = null;
      }
    };
  }, [type, npc.pid, isInitializing, dialogMessage, isCommerceUniverse, setAutoAiResponse, getSimpleMeetingMessage]);

  // 첫 만남 처리 함수
  const handleFirstMeeting = useCallback(async () => {
    if (!isLoggedIn || !universeId || !npc.pid || isRunningRef.current.addingPersona) return;

    try {
      setRunningFlag("addingPersona", true);

      // 이미 존재하는지 확인
      const existsCheck = await checkPersonaExists(universeId, npc.pid);

      if (existsCheck.exists) {
        logger.log(`이미 ${existsCheck.location}에 존재하는 NPC, 추가 생략:`, npc.name);

        if (existsCheck.location === "userPersonas") {
          // userPersonas에 있다면 상호작용만 업데이트
          await updatePersonaInteraction(universeId, npc.pid, "userPersonas", { silent: true });
        } else if (existsCheck.location === "personas") {
          // personas에 있다면 상호작용만 업데이트
          await updatePersonaInteraction(universeId, npc.pid, "personas", { silent: true });
        }
        return;
      }

      // 처음 만난 NPC를 personas에 추가
      await addPersonaFromNPC(universeId, npc);

      // 첫 만남 상호작용 기록
      await updatePersonaInteraction(universeId, npc.pid, "personas", { silent: true });

      logger.log(`첫 만남 처리 완료: ${npc.name}`);
    } catch (error) {
      logger.error("첫 만남 처리 실패:", error);
    } finally {
      setRunningFlag("addingPersona", false);
    }
  }, [isLoggedIn, universeId, npc, addPersonaFromNPC, updatePersonaInteraction, setRunningFlag, checkPersonaExists]);

  /**
   * 게임 타입에서 이력 유무로 모드 자동 결정 — adjusting state during render 패턴
   * - 이력 없음  : autoAiResponse = false + 기본 문구 즉시 표시
   * - 이력 있음  : autoAiResponse = true  (loadGreeting()에서 AI 인사말 요청)
   */
  const [trackedHistoryState, setTrackedHistoryState] = useState({
    isCommerce: isCommerceUniverse,
    loaded: hasHistoryLoaded,
    has: hasHistory,
  });
  if (
    trackedHistoryState.isCommerce !== isCommerceUniverse ||
    trackedHistoryState.loaded !== hasHistoryLoaded ||
    trackedHistoryState.has !== hasHistory
  ) {
    setTrackedHistoryState({ isCommerce: isCommerceUniverse, loaded: hasHistoryLoaded, has: hasHistory });
    if (!isCommerceUniverse && hasHistoryLoaded) {
      if (!hasHistory && !dialogMessage) {
        setDialogMessage(getSimpleMeetingMessage());
      }
    }
  }

  useEffect(() => {
    if (isCommerceUniverse || !hasHistoryLoaded) return;
    if (autoAiResponse !== hasHistory) setAutoAiResponse(hasHistory);
  }, [autoAiResponse, hasHistory, hasHistoryLoaded, isCommerceUniverse, setAutoAiResponse]);

  // npc.pid가 바뀌면 새 세션 시작 가능하도록 ref를 리셋 (state mirror는 진행중 loadGreeting의 finally에서 자연 동기화)
  useEffect(() => {
    didStartSessionRef.current = false;
    greetingSeqRef.current += 1;
    isRunningRef.current.loadingGreeting = false;
    isRunningRef.current.startingChat = false;
  }, [npc.pid]);

  // 첫 만남 처리
  useEffect(() => {
    if (isLoggedIn && universeId && npc.pid) {
      handleFirstMeeting();
    }
  }, [isLoggedIn, universeId, npc.pid, handleFirstMeeting]);

  // 대화하기 버튼 클릭 핸들러
  const handleChatClick = useCallback(async () => {
    if (isBusy || isRunningRef.current.loadingGreeting) return;
    if (isRunningRef.current.startingChat) return; // 중복 실행 방지
    isRunningRef.current.startingChat = true;

    try {
      ensureSessionStarted(); // 대화 시작 시 세션 생성
      await new Promise((resolve) => setTimeout(resolve, 50));
      onChatClick(dialogMessage);
    } finally {
      setTimeout(() => (isRunningRef.current.startingChat = false), 0); // 다음 tick에서 해제
    }
  }, [ensureSessionStarted, onChatClick, dialogMessage, isBusy]);

  // 커스텀 메시지 처리 — adjusting state during render 패턴
  const [trackedMessage, setTrackedMessage] = useState(message);
  if (trackedMessage !== message) {
    setTrackedMessage(message);
    if (!dialogMessage && message) {
      setDialogMessage(message);
    }
  }

  // AI 인사말 로드 함수
  const loadGreeting = useCallback(async () => {
    if (isRunningRef.current.loadingGreeting) return;

    try {
      setRunningFlag("loadingGreeting", true);
      const mySeq = ++greetingSeqRef.current;

      // 커머스가 아니고, 자동 AI 응답 모드가 비활성화된 경우 간단한 만남 메시지만 표시
      if (!isCommerceUniverse && !autoAiResponse) {
        setDialogMessage(getSimpleMeetingMessage());
        return;
      }

      // autoAiResponse가 true면 AI 인사말 요청
      ensureSessionStarted();
      const result = await requestGreeting();

      // npc가 바뀌었거나 새로운 요청이 시작된 경우 stale 응답 무시
      if (mySeq !== greetingSeqRef.current) return;

      logger.log("[NpcActionDialog] AI 인사말 요청");

      // 오류 체크를 우선 수행
      if (!result?.success) {
        setDialogMessage(
          lang({ ko: "죄송합니다. 알 수 없는 오류가 발생했습니다.", en: "Sorry, an unknown error has occurred." }),
        );
        return;
      }

      // 성공 시 응답 내용 설정
      if (result.content) {
        setDialogMessage(result.content);
      } else {
        setDialogMessage(getSimpleMeetingMessage());
        if (!isCommerceUniverse) setAutoAiResponse(false); // 커머스일 땐 끄지 않음
      }
    } catch (error) {
      logger.error("AI 인사말 가져오기 실패:", error);
      setDialogMessage(getSimpleMeetingMessage());
      if (!isCommerceUniverse) setAutoAiResponse(false);
    } finally {
      setRunningFlag("loadingGreeting", false);
    }
  }, [
    autoAiResponse,
    isCommerceUniverse,
    getSimpleMeetingMessage,
    ensureSessionStarted,
    requestGreeting,
    setRunningFlag,
    setAutoAiResponse,
  ]);

  // 비로그인 + 커머스가 아닌 경우: 단순 메시지 — adjusting state during render 패턴
  if (type === "message" && !dialogMessage && !isLoggedIn && !isCommerceUniverse) {
    setDialogMessage(getSimpleMeetingMessage());
  }

  useEffect(() => {
    if (type !== "message" || isLoggedIn || isCommerceUniverse || !autoAiResponse) return;
    setAutoAiResponse(false);
  }, [autoAiResponse, isCommerceUniverse, isLoggedIn, setAutoAiResponse, type]);

  // AI 인사말 요청
  useEffect(() => {
    if (dialogMessage || type !== "message") return;
    // 비로그인 + 커머스 아닌 케이스는 위 render-phase에서 처리되므로 effect는 패스
    if (!isLoggedIn && !isCommerceUniverse) return;

    // 히스토리 로드가 끝날 때까지 대기
    if (!hasHistoryLoaded) return;

    // 첫 만남 처리 - 커머스 유니버스(게스트 포함)는 자동 응답 플로우 계속 진행
    if (isRunningRef.current.addingPersona) {
      logger.log("[NpcActionDialog] 첫 만남 처리 중... AI 인사말 요청 지연");

      // 첫 만남 처리 완료 후 재시도
      const retryTimer = setTimeout(() => {
        if (!isRunningRef.current.addingPersona && !dialogMessage) {
          loadGreeting();
        }
      }, 200);

      return () => clearTimeout(retryTimer);
    }

    // AI 인사말 로드
    if (!isRunningRef.current.loadingGreeting) {
      loadGreeting();
    }
  }, [
    dialogMessage,
    type,
    isLoggedIn,
    isCommerceUniverse,
    npc.pid,
    hasHistoryLoaded,
    loadGreeting,
    getSimpleMeetingMessage,
  ]);

  // 채팅 모드인 경우 입력 폼 렌더링
  const renderChatInput = () => {
    if (type !== "chat") return null;

    return (
      <div className="chat-input-container flex items-center gap-2 mt-4 bg-white/10 rounded-full p-1 pl-4">
        <input
          type="text"
          className="flex-1 bg-transparent outline-none placeholder-white/50"
          placeholder={lang({ ko: "메시지를 입력하세요..." })}
        />
        <Button onClick={() => onChatClick()} className="rounded-full p-2 aspect-square" size="sm">
          <Send size={18} />
          <span className="sr-only">
            <Lang text={{ ko: "보내기", en: "Send" }} />
          </span>
        </Button>
      </div>
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && isBusy) return;
        if (!open && onClose) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "top-auto bottom-4 -translate-x-1/2 translate-y-0 min-w-80",
          "bg-gradient-to-b from-black/80 to-black/95", // 그라데이션 배경 추가
          type === "chat" ? "max-w-md" : "", // 채팅 모드일 때 더 넓게
          className,
        )}
        innerWrapClassName="max-w-sm"
        hideClose={true}
        hideOverlay={true}
        disableOutsideClick={true}
        aria-busy={isBusy}
        onKeyDownCapture={handleKeyDownCapture} // 키 입력 차단
      >
        <DialogHeader className="text-left sr-only">
          <DialogTitle>
            <Lang text={{ ko: "캐릭터와의 만남", en: "Encounter with character" }} />
          </DialogTitle>
          <DialogDescription>
            <Lang text={{ ko: "캐릭터를 만났습니다.", en: "You met an character." }} />
          </DialogDescription>
        </DialogHeader>

        {/* 로딩 및 다이얼로그 메세지 */}
        <div className="text-lg max-h-[50vh] overflow-y-auto pr-2 -mr-2" aria-live="polite">
          {isBusy ? (
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              <span className="size-2 animate-loading-dot rounded-full bg-current" />
              <span
                className="size-2 animate-loading-dot rounded-full bg-current"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="size-2 animate-loading-dot rounded-full bg-current"
                style={{ animationDelay: "300ms" }}
              />
            </span>
          ) : (
            dialogMessage
          )}
        </div>

        {/* 채팅 입력 폼 */}
        {renderChatInput()}

        {/* 대화하기/그냥가기 버튼 */}
        {!hideButtons && (
          <div className="flex justify-end gap-2 mt-4">
            {type === "message" && (
              <Button
                ref={chatButtonRef}
                onClick={handleChatClick}
                className={cn(
                  "transition-all",
                  focusedIndex === 0 && "ring-2 ring-primary animate-glow glow-purple scale-105",
                  isLoggedIn && "relative",
                )}
                disabled={(!isLoggedIn && !isCommerceUniverse) || isBusy}
                tabIndex={isBusy ? -1 : 0} // 로딩 중에는 포커스 제거 - Enter 포커스 방지
                aria-disabled={isBusy}
                autoFocus={!isBusy}
              >
                {!isLoggedIn && !isCommerceUniverse && (
                  <span
                    className={cn(
                      "pop-msg absolute -top-5 left-1 rounded-full bg-neon-pink text-xs px-4 py-1 z-10 animate-bounce",
                      "before:content-[''] before:absolute before:top-full before:left-6 before:z-[-1]",
                      "before:w-2 before:h-2 before:bg-neon-pink before:rotate-45 before:-mt-1",
                    )}
                  >
                    <Lang
                      text={{
                        ko: "로그인이 필요해요",
                        en: "You need to log in",
                      }}
                    />
                  </span>
                )}
                <Lang
                  text={{
                    ko: "대화하기",
                    en: "Talk",
                  }}
                />
              </Button>
            )}

            {onClose && (
              <Button
                ref={leaveButtonRef}
                variant="secondary"
                onClick={onClose}
                className={cn(
                  "transition-all",
                  focusedIndex === 1 && "ring-2 ring-secondary animate-glow glow-cyan scale-105",
                )}
                disabled={isBusy} // busy 동안 비활성
                tabIndex={isBusy ? -1 : 0} // 포커스 자체 제거
              >
                {isLoggedIn ? (
                  <Lang text={{ ko: "그냥가기", en: "Just go" }} />
                ) : (
                  <Lang text={{ ko: "닫기", en: "Close" }} />
                )}
              </Button>
            )}
          </div>
        )}

        <div className="npc-info-container absolute top-0 left-0 right-0">
          <div className="npc-info flex items-center gap-2 absolute -bottom-4 left-0 right-0 px-4">
            <div className="npc-info-header">
              <div
                className="npc-thumbnail relative w-20 h-20 rounded-full bg-gray-200 overflow-hidden shadow-[0_1px_3px_2px_rgba(0,0,0,0.2)] cursor-pointer transition-transform hover:scale-105 hover:ring-4 hover:ring-neon-purple"
                title={lang({ ko: "캐릭터 정보 보기", en: "View character information" })}
                onClick={() => {
                  if (isBusy) return;
                  onThumbnailClick?.();
                }}
                aria-disabled={isBusy}
              >
                {/* 썸네일 또는 프로필 */}
                <Image
                  src={thumbnailSrc}
                  alt={npc.name}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                />
              </div>
            </div>
            <div className="npc-info-body flex-1 flex items-center justify-between">
              <h3
                className="text-xl font-bold text-white"
                style={{
                  textShadow: `0 0 4px hsl(var(--neon-purple)), 0 0 4px hsl(var(--neon-purple)), 0 0 4px hsl(var(--neon-purple)), 0 0 4px hsl(var(--neon-purple))`,
                }}
              >
                {npc.name}
              </h3>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NpcActionDialog;
