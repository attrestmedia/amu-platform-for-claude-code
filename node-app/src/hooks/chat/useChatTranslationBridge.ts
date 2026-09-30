"use client";

import { useEffect } from "react";

/**
 * @docHint
 * @purpose useChatTranslationBridge 훅 클라이언트 로직 캡슐화
 * @process 번역 캐시 정리(닫힘/언어·설정 변경) — 표시는 말풍선 인라인 토글이 담당
 * @domain chat-translation
 * @scope client
 */

export function useChatTranslationBridge(args: {
  open: boolean;
  enabled: boolean;

  // settings key들 (언어 변경 시 캐시 정리 목적)
  targetLanguage: string;
  autoTranslate: boolean;

  clearTranslations: () => void;
}) {
  const { open, enabled, targetLanguage, autoTranslate, clearTranslations } = args;

  // 닫힐 때 외부 translation 캐시 정리 (setState 동기 호출 없음)
  useEffect(
    function clearTranslationCacheOnClose() {
      if (!open) clearTranslations();
    },
    [open, clearTranslations],
  );

  // 언어/설정 변경 시 외부 cache reset (setState 동기 호출 없음)
  useEffect(
    function clearTranslationCacheOnSettingsChange() {
      clearTranslations();
    },
    [targetLanguage, enabled, autoTranslate, clearTranslations],
  );
}
