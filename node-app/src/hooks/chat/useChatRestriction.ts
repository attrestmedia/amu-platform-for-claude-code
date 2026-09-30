"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useGameCharacterStore } from "store/game";
import { lang } from "components/module/i18n";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose useChatRestriction 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-safety
 * @scope client
 */

export function useChatRestriction(args: {
  open: boolean;
  characterPid: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  // args.X 다중 접근 시 React Compiler eslint가 args 전체를 deps로 요구하므로 상단에서 구조분해.
  const { open, characterPid, onOpenChange } = args;

  const isCharacterRestricted = useGameCharacterStore((s) => s.isCharacterRestricted);
  const getWarningStatus = useGameCharacterStore((s) => s.getWarningStatus);
  const updateRestrictionStatus = useGameCharacterStore((s) => s.updateRestrictionStatus);

  const warningStatus = useMemo(() => {
    if (!characterPid) return null;
    return getWarningStatus(characterPid);
  }, [characterPid, getWarningStatus]);

  const isRestricted = useMemo(() => {
    if (!characterPid) return false;
    return isCharacterRestricted(characterPid);
  }, [characterPid, isCharacterRestricted]);

  useEffect(() => {
    if (!open || !characterPid) return;

    updateRestrictionStatus(characterPid);

    const restricted = isCharacterRestricted(characterPid);
    const ws = getWarningStatus(characterPid);

    if (restricted && ws) {
      const remainingTime = 30 * 60 * 1000 - (Date.now() - (ws.lastRestrictionTime || 0));
      const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));

      logger.log("[CharacterChat] 대화 제한 상태:", {
        characterId: characterPid,
        warningCount: ws.warningCount,
        remainingMinutes,
      });

      toast.error(
        lang({
          ko: `부적절한 대화로 인해 ${remainingMinutes}분 후 대화가 가능합니다.`,
          en: `Due to inappropriate conversation, chat will be available in ${remainingMinutes} minutes.`,
        }),
      );

      onOpenChange(false);
    }
  }, [open, characterPid, onOpenChange, updateRestrictionStatus, isCharacterRestricted, getWarningStatus]);

  return { isRestricted, warningStatus };
}
