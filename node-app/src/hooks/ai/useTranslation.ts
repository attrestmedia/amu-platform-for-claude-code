import { useState, useCallback, useRef, useEffect } from "react";
import { useDebounceCallback } from "hooks/common";
import { logger } from "utils/log";
import { translateWithContentPrompt } from "libs/api/ai/translationClient";
import { toErrorLike, toErrorMessage } from "utils/common/typeUtils";
import type { TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose useTranslation 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain i18n
 * @scope global
 */

interface TranslationResult {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
}

interface UseTranslationProps {
  targetLanguage: string;
  provider?: TextProviderType;
  modelName?: string;
  enabled?: boolean;
  autoTranslate?: boolean;
  debounceMs?: number;
}

export function useTranslation({
  targetLanguage,
  provider,
  modelName,
  enabled = true,
  autoTranslate = false,
  debounceMs = 1000,
}: UseTranslationProps) {
  const [translations, setTranslations] = useState<Map<string, TranslationResult>>(new Map());
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationErrors, setTranslationErrors] = useState<Map<string, string>>(new Map());

  const abortControllerRef = useRef<AbortController | null>(null);

  // 이전 번역 요청 텍스트 추적
  const lastTranslatedTextRef = useRef<string>("");
  const pendingTranslationsRef = useRef<Set<string>>(new Set());

  // 번역 API 호출 함수
  const translateText = useCallback(
    async (text: string): Promise<TranslationResult | null> => {
      // 이전 요청 취소
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // 새로운 AbortController 생성
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        setIsTranslating(true);
        setTranslationErrors((prev) => {
          const newErrors = new Map(prev);
          newErrors.delete(text);
          return newErrors;
        });

        // 번역 API 함수 사용
        const result = await translateWithContentPrompt(text, targetLanguage, abortController.signal, {
          provider,
          modelName,
        });

        if (result.success && result.translatedText) {
          const translationResult: TranslationResult = {
            originalText: text,
            translatedText: result.translatedText,
            targetLanguage: result.targetLanguage || targetLanguage,
          };

          setTranslations((prev) => {
            const newTranslations = new Map(prev);
            newTranslations.set(text, translationResult);
            return newTranslations;
          });

          return translationResult;
        } else {
          throw new Error(result.error || "번역에 실패했습니다.");
        }
      } catch (error: unknown) {
        const errLike = toErrorLike(error);
        if (errLike.name !== "AbortError") {
          logger.error("번역 오류:", error);
          setTranslationErrors((prev) => {
            const newErrors = new Map(prev);
            newErrors.set(text, toErrorMessage(error, "번역 중 오류가 발생했습니다."));
            return newErrors;
          });
        }
        return null;
      } finally {
        setIsTranslating(false);
        pendingTranslationsRef.current.delete(text); // 진행 중 목록에서 제거
      }
    },
    [modelName, provider, targetLanguage],
  );

  // 디바운스된 자동 번역 함수
  const { callback: debouncedTranslateCallback, cancel: cancelPendingTranslation } = useDebounceCallback(
    translateText,
    debounceMs,
  );

  // 즉시 번역 함수 (Send 버튼 클릭 시 사용)
  const translateImmediately = useCallback(
    async (text: string) => {
      // 이미 번역된 내용이 있으면 바로 반환
      const existingTranslation = translations.get(text);
      if (existingTranslation) {
        return existingTranslation;
      }

      return await translateText(text);
    },
    [translateText, translations],
  );

  // 자동 번역 (실시간 입력 시)
  const autoTranslateText = useCallback(
    (text: string) => {
      if (!autoTranslate || !enabled) return;

      const trimmedText = text.trim();

      // 빈 텍스트이거나 너무 짧은 텍스트는 번역하지 않음
      if (!trimmedText || trimmedText.length < 3) return;

      // 이전에 번역한 텍스트와 동일한 경우 건너뛰기
      if (lastTranslatedTextRef.current === trimmedText) {
        return;
      }

      // 이미 번역된 내용이 있으면 번역하지 않음
      if (translations.has(trimmedText)) {
        lastTranslatedTextRef.current = trimmedText;
        return;
      }

      // 이미 진행 중인 번역 요청이 있으면 건너뛰기
      if (pendingTranslationsRef.current.has(trimmedText)) {
        return;
      }

      // 이전 텍스트 업데이트
      lastTranslatedTextRef.current = trimmedText;

      // 진행 중인 요청에 추가
      pendingTranslationsRef.current.add(trimmedText);

      // 디바운스된 번역 실행
      const translationPromise = debouncedTranslateCallback(trimmedText);

      // Promise인지 확인 후 finally 처리
      if (translationPromise && typeof translationPromise.then === "function") {
        translationPromise
          .finally(() => {
            // 완료 후 진행 중 목록에서 제거
            pendingTranslationsRef.current.delete(trimmedText);
          })
          .catch((error) => {
            logger.error("자동 번역 중 오류:", error);
          });
      } else {
        // Promise가 아닌 경우 즉시 정리
        pendingTranslationsRef.current.delete(trimmedText);
      }
    },
    [autoTranslate, enabled, translations, debouncedTranslateCallback],
  );

  // 실시간 번역 결과 가져오기 (UI에서 표시용)
  const getRealtimeTranslation = useCallback(
    (text: string): string | null => {
      const translation = translations.get(text);
      return translation?.translatedText || null;
    },
    [translations],
  );

  // 번역 대기 상태 확인
  const hasPendingTranslation = useCallback(
    (text: string): boolean => {
      return autoTranslate && enabled && !translations.has(text) && text.trim().length >= 3;
    },
    [autoTranslate, enabled, translations],
  );

  // 컴포넌트 언마운트 시 진행 중인 디바운스 요청 취소
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // 대기 중인 디바운스 요청 취소
      cancelPendingTranslation();
    };
  }, [cancelPendingTranslation]);

  // 번역 결과 가져오기
  const getTranslation = useCallback(
    (text: string): TranslationResult | null => {
      return translations.get(text) || null;
    },
    [translations],
  );

  // 번역 오류 가져오기
  const getTranslationError = useCallback(
    (text: string): string | null => {
      return translationErrors.get(text) || null;
    },
    [translationErrors],
  );

  // 번역 캐시 클리어
  const clearTranslations = useCallback(() => {
    setTranslations(new Map());
    setTranslationErrors(new Map());
    lastTranslatedTextRef.current = "";
    pendingTranslationsRef.current.clear();
  }, []);

  // 컴포넌트 언마운트 시 진행 중인 요청 취소
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    isTranslating,
    translations: translations,
    targetLanguage,
    translateImmediately,
    autoTranslateText,
    getTranslation,
    getTranslationError,
    clearTranslations,
    cancelPendingTranslation,
    getRealtimeTranslation,
    hasPendingTranslation,
  };
}
