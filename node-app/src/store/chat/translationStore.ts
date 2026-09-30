import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TEXT_MODEL_MAP, TEXT_PROVIDER_TYPES } from "consts/ai";
import type { TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain chat
 * @scope client
 */

interface TranslationState {
  enabled: boolean;
  autoTranslate: boolean;
  targetLanguage: string;
  showTranslations: boolean;
  helperModelProvider: TextProviderType;
  helperModelName: string;
}

interface TranslationActions {
  setEnabled: (enabled: boolean) => void;
  setAutoTranslate: (autoTranslate: boolean) => void;
  setTargetLanguage: (language: string) => void;
  setShowTranslations: (show: boolean) => void;
  setHelperModel: (model: { provider: TextProviderType; modelName: string }) => void;
  toggleTranslations: () => void;
}

export const CHAT_TRANSLATION_LANGUAGE_OPTIONS = [
  { value: "ko", label: { ko: "한국어", en: "Korean" } },
  { value: "en", label: { ko: "영어", en: "English" } },
  { value: "ja", label: { ko: "일본어", en: "Japanese" } },
  { value: "zh", label: { ko: "중국어", en: "Chinese" } },
] as const;

export const CHAT_HELPER_MODEL_GUIDE_BY_KEY = {
  "openai:gpt-5.6-luna": {
    label: { ko: "저렴한 모델", en: "Low-cost model" },
    note: { ko: "번역/힌트 초기 추천 모델", en: "Initial recommendation for translation and hints" },
  },
  "google:gemini-3.5-flash-lite": {
    label: { ko: "빠른 모델", en: "Fast model" },
    note: { ko: "짧은 보조 생성에 적합", en: "Good for short helper generations" },
  },
  "openai:gpt-5.6-terra": {
    label: { ko: "균형 모델", en: "Balanced model" },
    note: { ko: "속도와 품질 균형형", en: "Balances speed and quality" },
  },
} as const satisfies Record<string, { label: { ko: string; en: string }; note: { ko: string; en: string } }>;

export const DEFAULT_CHAT_HELPER_MODEL = {
  provider: "openai",
  modelName: "gpt-5.6-luna",
} as const satisfies { provider: TextProviderType; modelName: string };

export function normalizeChatTranslationLanguage(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "korean" || raw === "한국어") return "ko";
  if (raw === "english" || raw === "영어") return "en";
  if (raw === "japanese" || raw === "일본어") return "ja";
  if (raw === "chinese" || raw === "중국어" || raw === "zh-cn" || raw === "zh-tw") return "zh";
  return CHAT_TRANSLATION_LANGUAGE_OPTIONS.some((option) => option.value === raw) ? raw : "ko";
}

export function normalizeTutorLanguageForComparison(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "ko" || raw.includes("korean") || raw.includes("한국")) return "ko";
  if (raw === "en" || raw.includes("english") || raw.includes("영어")) return "en";
  if (raw === "ja" || raw.includes("japanese") || raw.includes("일본")) return "ja";
  if (raw === "zh" || raw.includes("chinese") || raw.includes("중국")) return "zh";
  return raw;
}

export function normalizeChatHelperModel(model: { provider?: unknown; modelName?: unknown }) {
  const provider = String(model.provider || "")
    .trim()
    .toLowerCase() as TextProviderType;
  const modelName = String(model.modelName || "").trim();
  const providerModels = (TEXT_MODEL_MAP as Record<string, readonly string[]>)[provider] || [];
  if ((TEXT_PROVIDER_TYPES as readonly string[]).includes(provider) && providerModels.includes(modelName)) {
    return { provider, modelName };
  }
  return DEFAULT_CHAT_HELPER_MODEL;
}

function asPartialTranslationState(value: unknown) {
  return value && typeof value === "object" ? (value as Partial<TranslationState>) : {};
}

// autoTranslate는 레거시 입력 중 번역 옵션이다.
// 현재 채팅 UI는 인지 부담과 불필요한 비용 발생을 줄이기 위해 전송 시 번역만 사용한다.

export const useTranslationStore = create<TranslationState & TranslationActions>()(
  persist(
    (set) => ({
      // 초기 상태
      enabled: false,
      autoTranslate: false,
      targetLanguage: "ko",
      showTranslations: false,
      helperModelProvider: DEFAULT_CHAT_HELPER_MODEL.provider,
      helperModelName: DEFAULT_CHAT_HELPER_MODEL.modelName,

      // 액션
      setEnabled: (enabled) => set({ enabled }),
      setAutoTranslate: (autoTranslate) => set({ autoTranslate }),
      setTargetLanguage: (language) => set({ targetLanguage: normalizeChatTranslationLanguage(language) }),
      setShowTranslations: (show) => set({ showTranslations: show }),
      setHelperModel: (model) => {
        const next = normalizeChatHelperModel(model);
        set({ helperModelProvider: next.provider, helperModelName: next.modelName });
      },
      toggleTranslations: () => set((state) => ({ showTranslations: !state.showTranslations })),
    }),
    {
      name: "translation-settings",
      partialize: (state) => ({
        enabled: state.enabled,
        autoTranslate: false,
        targetLanguage: normalizeChatTranslationLanguage(state.targetLanguage),
        showTranslations: state.showTranslations,
        ...(() => {
          const helperModel = normalizeChatHelperModel({
            provider: state.helperModelProvider,
            modelName: state.helperModelName,
          });
          return {
            helperModelProvider: helperModel.provider,
            helperModelName: helperModel.modelName,
          };
        })(),
      }),
      merge: (persisted, current) => {
        const saved = asPartialTranslationState(persisted);
        const helperModel = normalizeChatHelperModel({
          provider: saved.helperModelProvider,
          modelName: saved.helperModelName,
        });
        return {
          ...current,
          ...saved,
          autoTranslate: false,
          targetLanguage: normalizeChatTranslationLanguage(saved.targetLanguage),
          helperModelProvider: helperModel.provider,
          helperModelName: helperModel.modelName,
        };
      },
    },
  ),
);
