"use client";

import { useEffect, useRef } from "react";
import type { IExtendedNpcData } from "types/game";
import type { IChatMessage, SystemCodeType, SystemCodeLikeType, IPersonaItem } from "types/ai";
import { isPersonaMoodType } from "consts/game";
import { extractMoodKey, isValidSystemCode } from "utils/ai";
import { useGameCharacterStore, useUserDataStore } from "store/game";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose useChatSystemCodeEffects 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-systemcode
 * @scope client
 */

const normalize = (c: unknown): string =>
  String(c ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

const getRowCodes = (lastMessage: Pick<IChatMessage, "systemCode">): string[] => {
  const codes = Array.isArray(lastMessage.systemCode) ? lastMessage.systemCode : [lastMessage.systemCode];
  return codes.map(normalize).filter(Boolean).slice(0, 30); // 방어적 상한
};

export function useChatSystemCodeEffects(args: {
  open: boolean;
  messages: IChatMessage[];
  character: IExtendedNpcData | null;

  universeId: string;
  isCommerceUniverse: boolean;

  showAIEndRequest: boolean;

  setCurrentSystemCodes: (v: SystemCodeLikeType[] | null) => void;

  setShowAIEndRequest: (v: boolean) => void;
  setAIEndRequestMessage: (v: string) => void;
  setIsForceEnd: (v: boolean) => void;

  // intimacy
  updateIntimacy: (
    character: IExtendedNpcData,
    codes: SystemCodeType[],
    userText: string,
    isFirst: boolean,
  ) => Promise<IPersonaItem | null>;
  setCurrentPersonaData: (v: IPersonaItem | null) => void;
}) {
  const {
    open,
    messages,
    character,
    universeId,
    showAIEndRequest,
    setCurrentSystemCodes,
    setShowAIEndRequest,
    setAIEndRequestMessage,
    setIsForceEnd,
    updateIntimacy,
    setCurrentPersonaData,
  } = args;

  const lastHandledMsgIdRef = useRef<string | null>(null);
  const lastHandledMoodKeyRef = useRef<string | null>(null);

  const incrementWarningCount = useGameCharacterStore((s) => s.incrementWarningCount);
  const getWarningStatus = useGameCharacterStore((s) => s.getWarningStatus);

  const getPersonaType = useUserDataStore((s) => s.getPersonaType);
  const setPendingPersonaMood = useUserDataStore((s) => s.setPendingPersonaMood);

  // close 또는 캐릭터 전환 시, 중복처리 ref 초기화
  useEffect(() => {
    if (!open) {
      lastHandledMsgIdRef.current = null;
      lastHandledMoodKeyRef.current = null;
      return;
    }
    // 열려있는 상태에서 캐릭터가 바뀌면(또는 pid 변경) ref 리셋
    lastHandledMsgIdRef.current = null;
    lastHandledMoodKeyRef.current = null;
  }, [open, character?.pid]);

  // systemCode 감지 + warning/intimacy/end-dialog
  useEffect(() => {
    if (!open || messages.length === 0 || !character || showAIEndRequest) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.isUser) return;
    if (lastHandledMsgIdRef.current === lastMessage.id) return;
    if (!lastMessage.systemCode) return;

    lastHandledMsgIdRef.current = lastMessage.id; // systemCode가 확인된 이후에만 "처리 완료" 마킹

    // 1) 액션 코드(SystemCodeType)
    const rawCodes = getRowCodes(lastMessage);
    const actionCodes = rawCodes.filter((v): v is SystemCodeType => isValidSystemCode(v as SystemCodeType));

    // 2) SystemCodeLikeType 코드
    const moodCodes = rawCodes.filter((v) => {
      if (!v.startsWith("mood-")) return false;
      const key = v.slice(5);
      return isPersonaMoodType(key);
    }) as SystemCodeLikeType[];

    // 3) UI 노출/상태 보관용: 액션 + 무드 합치기 (중복 제거)
    const systemCodesLike = Array.from(new Set<string>([...actionCodes, ...moodCodes])) as SystemCodeLikeType[];

    setCurrentSystemCodes(systemCodesLike.length ? systemCodesLike : null);

    // last user message
    const lastUserMessage = (() => {
      for (let i = messages.length - 2; i >= 0; i--) {
        const m = messages[i];
        if (m.isUser) return m;
      }
      return undefined;
    })();

    const userMessageText = lastUserMessage?.text || "";
    const isFirstChat = messages.filter((m) => !m.isUser).length <= 1;

    logger.log("[CharacterChat] systemCode 감지:", {
      messageId: lastMessage.id,
      systemCodesLike,
      character,
    });

    // warning
    const hasWarningCode = actionCodes.some((code: SystemCodeType) => code === "end-chat" || code === "end-force");
    if (hasWarningCode) {
      incrementWarningCount(character.pid);
      logger.log("[CharacterChat] 경고 systemCode 감지:", {
        characterId: character.pid,
        systemCodesLike,
        newWarningStatus: getWarningStatus(character.pid),
      });
    }

    // intimacy realtime update
    updateIntimacy(character, actionCodes, userMessageText, isFirstChat)
      .then((updated) => {
        setCurrentPersonaData(updated ?? null);
      })
      .catch((e) => logger.warn("[CharacterChat] updateIntimacy failed:", e));

    // end dialog
    if (actionCodes.includes("end-chat") || actionCodes.includes("end-force")) {
      setShowAIEndRequest(true);
      setAIEndRequestMessage(lastMessage.text);

      if (systemCodesLike.includes("end-force")) setIsForceEnd(true);
      else setIsForceEnd(false);
    }
  }, [
    open,
    messages,
    character,
    showAIEndRequest,
    setCurrentSystemCodes,
    setShowAIEndRequest,
    setAIEndRequestMessage,
    setIsForceEnd,
    updateIntimacy,
    setCurrentPersonaData,
    incrementWarningCount,
    getWarningStatus,
  ]);

  // mood pending patch
  useEffect(() => {
    if (!open || messages.length === 0 || !character) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.isUser || !lastMessage.systemCode) return;

    const rawCodes = getRowCodes(lastMessage);
    const newMood = extractMoodKey(rawCodes);
    if (!newMood) return;

    // 같은 assistant 메시지(+같은 mood)로 중복 호출 방지
    const moodKey = `${lastMessage.id}:${newMood}`;
    if (lastHandledMoodKeyRef.current === moodKey) return;
    lastHandledMoodKeyRef.current = moodKey;

    getPersonaType(universeId, character.pid)
      .then((loc) => {
        const type = loc || "personas";
        setPendingPersonaMood(universeId, character.pid, newMood, type);
      })
      .catch((e) => {
        // 실패 시 재시도 가능하도록 롤백
        if (lastHandledMoodKeyRef.current === moodKey) lastHandledMoodKeyRef.current = null;
        logger.warn("[CharacterChat] getPersonaType failed:", e);
      });
  }, [open, messages, character, universeId, getPersonaType, setPendingPersonaMood]);
}
