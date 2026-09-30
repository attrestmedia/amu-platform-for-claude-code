"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { IPersonaItem } from "types/ai";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatBar } from "@amu-labs/ui";
import { ModelSelectField, type ModelSelectOption } from "components/module/model-select";
import { Lang, lang } from "components/module/i18n";
import {
  Heart,
  Star,
  Zap,
  Brain,
  Sparkles,
  Target,
  TrendingUp,
  Clock,
  Lightbulb,
  Lock,
  Unlock,
  Crown,
  MessageCircle,
  Settings,
  Globe,
  Languages,
  History,
  Monitor,
  User,
  Volume2,
  VolumeX,
  Mic,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { useGlobalStore } from "store/global";
import { useUiControlStore } from "store/game";
import { useTranslationStore } from "store/chat";
import {
  CHAT_HELPER_MODEL_GUIDE_BY_KEY,
  CHAT_TRANSLATION_LANGUAGE_OPTIONS,
  DEFAULT_CHAT_HELPER_MODEL,
} from "store/chat/translationStore";
import { useGenStudioModelCatalog } from "hooks/app/useGenStudioModelCatalog";
import TutorLanguageCombobox from "components/module/persona/TutorLanguageCombobox";
import { cn } from "utils/common";
import { OPENAI_DEFAULT_TTS_SPEED, OPENAI_TTS_SPEED_RANGE } from "consts/ai";
import { getElevenLabsVoiceCatalogEntry } from "consts/ai/voiceCatalog";
import { getTutorsVoicePilotSurface } from "libs/api/ai/speechClient";
import {
  TUTOR_CONVERSATION_LEVEL_OPTIONS,
  getTutorConversationLevelOption,
  normalizeTutorConversationLevel,
  type TutorConversationLevel,
} from "consts/tutors";
import { personaMoodTypeHelper, PERSONA_MOOD_COLOR_MAP, intimacyLevelHelper, INTIMACY_LEVEL_MAP } from "consts/game";
import { getCapitalized } from "utils/common";
import type { IChatModelPolicyResult, TextProviderType } from "types/ai";
import { ChatModelSelector } from "./ChatModelSelector";

const DEFAULT_CHAT_HELPER_MODEL_VALUE = `${DEFAULT_CHAT_HELPER_MODEL.provider}:${DEFAULT_CHAT_HELPER_MODEL.modelName}`;

interface ChatControlPanelProps {
  personaData: IPersonaItem | null;
  characterName: string;
  isVisible: boolean;
  onToggle?: () => void;
  className?: string;
  canUseTranslation?: boolean; // 번역 기능 사용 가능 여부
  voicePlaybackAvailable?: boolean;
  voiceInputAvailable?: boolean; // 마이크 음성 입력 사용 가능 여부
  onShowConversationHistory?: () => void;
  panelType?: "info" | "settings";
  chatViewMode?: "talk" | "visual";
  onToggleViewMode?: (mode: "talk" | "visual") => void;
  modelSelection?: {
    policy: IChatModelPolicyResult | null;
    loading: boolean;
    saving: boolean;
    onSelect: (provider: TextProviderType, modelName: string) => void | Promise<void>;
  };
  tutorTargetLanguage?: string;
  onTutorTargetLanguageChange?: (language: string) => void;
  tutorConversationLevel?: string;
  onTutorConversationLevelChange?: (conversationLevel: TutorConversationLevel) => void;
  conversationHintsAvailable?: boolean;
  conversationHintsEnabled?: boolean;
  onConversationHintsEnabledChange?: (enabled: boolean) => void;
}

const ChatControlPanel = ({
  personaData,
  characterName,
  isVisible,
  onToggle,
  className,
  canUseTranslation = false,
  voicePlaybackAvailable = false,
  voiceInputAvailable = false,
  onShowConversationHistory,
  panelType = "settings",
  chatViewMode = "visual",
  onToggleViewMode,
  modelSelection,
  tutorTargetLanguage = "",
  onTutorTargetLanguageChange,
  tutorConversationLevel = "",
  onTutorConversationLevelChange,
  conversationHintsAvailable = false,
  conversationHintsEnabled = true,
  onConversationHintsEnabledChange,
}: ChatControlPanelProps) => {
  const {
    assistantVoiceEnabled,
    assistantVoiceAutoplay,
    assistantVoiceSpeed,
    voiceAnalysisEnabled,
    toggleAssistantVoice,
    toggleAssistantVoiceAutoplay,
    setAssistantVoiceSpeed,
    setVoiceAnalysisEnabled,
  } = useUiControlStore();

  // language 변경 시 컴포넌트 리렌더링 트리거 목적의 구독 (lang() 라벨 갱신)
  const currentLanguage = useGlobalStore((state) => state.language);
  const { catalog: textModelCatalog, loading: helperModelCatalogLoading } = useGenStudioModelCatalog("text");

  // 번역 설정 상태
  const translationSettings = useTranslationStore();

  // 마운트 시점의 now 고정값: render purity 유지를 위해 state lazy initializer 사용
  const [nowMs] = useState(() => Date.now());
  // EL-603 Stream B: 서버 설정 기반 파일럿 승인 Voice. 미노출이면 빈 배열.
  const [pilotVoices, setPilotVoices] = useState<string[]>([]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const surface = await getTutorsVoicePilotSurface();
        if (!disposed) setPilotVoices(surface?.data?.exposableVoices || []);
      } catch {
        // default deny
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  // 관계 정보 계산
  const relationshipInfo = useMemo(() => {
    if (!personaData) {
      return {
        intimacyLevel: INTIMACY_LEVEL_MAP[intimacyLevelHelper(0)],
        lastMeetingDays: 0,
        isUnlocked: false,
        hasOwnership: false,
      };
    }

    const lastInteraction = personaData.lastInteraction ? new Date(personaData.lastInteraction) : null;

    const daysSinceLastMeeting = lastInteraction
      ? Math.floor((nowMs - lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      intimacyLevel: INTIMACY_LEVEL_MAP[intimacyLevelHelper(personaData.intimacy ?? 0)],
      lastMeetingDays: daysSinceLastMeeting,
      isUnlocked: personaData.isUnlocked || false,
      hasOwnership: personaData.ownership || false,
    };
  }, [personaData, nowMs]);

  const personaMood = personaData?.mood ?? null;
  const moodInfo = useMemo(() => {
    if (!personaMood) return null;
    return personaMoodTypeHelper(personaMood);
  }, [personaMood]);

  // 번역 토글 — 번역 표시는 말풍선별 토글 버튼이 담당
  const handleTranslationToggle = () => {
    translationSettings.setEnabled(!translationSettings.enabled);
    translationSettings.setAutoTranslate(false);
  };
  const dragStartYRef = useRef<number | null>(null);
  const dragClosedRef = useRef(false);
  const isConversationHintsEnabled = conversationHintsEnabled !== false;
  const normalizedTutorConversationLevel = normalizeTutorConversationLevel(tutorConversationLevel);
  const selectedConversationLevelOption = getTutorConversationLevelOption(normalizedTutorConversationLevel);

  const handleSheetHandlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    dragStartYRef.current = e.clientY;
    dragClosedRef.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handleSheetHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const startY = dragStartYRef.current;
      if (startY == null || dragClosedRef.current) return;
      if (e.clientY - startY < 56) return;

      dragClosedRef.current = true;
      dragStartYRef.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      onToggle?.();
    },
    [onToggle],
  );

  const handleSheetHandlePointerEnd = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    dragStartYRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const helperModelValue = `${translationSettings.helperModelProvider}:${translationSettings.helperModelName}`;
  const setHelperModel = translationSettings.setHelperModel;
  const assistantVoiceSpeedValue = assistantVoiceSpeed ?? OPENAI_DEFAULT_TTS_SPEED;
  const assistantVoiceSpeedLabel = `${assistantVoiceSpeedValue.toFixed(2).replace(/\.?0+$/, "")}x`;
  const canDecreaseAssistantVoiceSpeed = assistantVoiceSpeedValue > OPENAI_TTS_SPEED_RANGE.min;
  const canIncreaseAssistantVoiceSpeed = assistantVoiceSpeedValue < OPENAI_TTS_SPEED_RANGE.max;
  const adjustAssistantVoiceSpeed = (direction: -1 | 1) => {
    setAssistantVoiceSpeed(assistantVoiceSpeedValue + OPENAI_TTS_SPEED_RANGE.step * direction);
  };
  const helperModelOptions: ModelSelectOption[] = useMemo(() => {
    void currentLanguage;
    return (textModelCatalog?.text?.providers || []).flatMap((provider) =>
      (provider.models || [])
        .filter((model) => model.enabled !== false)
        .map((model) => {
          const value = `${provider.provider}:${model.name}`;
          const guide = CHAT_HELPER_MODEL_GUIDE_BY_KEY[value as keyof typeof CHAT_HELPER_MODEL_GUIDE_BY_KEY];
          return {
            value,
            title: guide
              ? `${model.displayName || model.name} (${lang(guide.label)})`
              : model.displayName || model.name,
            providerLabel: provider.provider,
            description: model.name,
            note: guide ? lang(guide.note) : undefined,
            recommended: value === DEFAULT_CHAT_HELPER_MODEL_VALUE || Boolean(model.recommendedModel),
            adminOnly: Boolean(model.adminOnly),
            deprecated: Boolean(model.deprecated),
            usageBilled: true,
          };
        }),
    );
  }, [currentLanguage, textModelCatalog?.text?.providers]);
  const helperModelOptionValues = useMemo(
    () => new Set(helperModelOptions.map((option) => option.value)),
    [helperModelOptions],
  );

  useEffect(() => {
    if (helperModelCatalogLoading || helperModelOptions.length === 0 || helperModelOptionValues.has(helperModelValue)) {
      return;
    }

    const fallback =
      helperModelOptions.find((option) => option.value === DEFAULT_CHAT_HELPER_MODEL_VALUE) ||
      helperModelOptions.find((option) => option.recommended) ||
      helperModelOptions[0];
    if (!fallback) return;

    const [provider = "", ...modelNameParts] = fallback.value.split(":");
    setHelperModel({
      provider: provider as TextProviderType,
      modelName: modelNameParts.join(":"),
    });
  }, [helperModelCatalogLoading, helperModelOptionValues, helperModelOptions, helperModelValue, setHelperModel]);

  const handleHelperModelChange = (value: unknown) => {
    const raw = Array.isArray(value) ? String(value[0] || "") : String(value || "");
    if (!helperModelOptionValues.has(raw)) return;
    const [provider = "", ...modelNameParts] = raw.split(":");
    setHelperModel({ provider: provider as TextProviderType, modelName: modelNameParts.join(":") });
  };

  const FULL_LABEL_BUTTON_CLASS_NAME =
    "flex flex-col items-start gap-1 px-4 py-3 rounded text-xs transition-colors text-left";

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "chat-control-panel",
        "fixed inset-x-0 bottom-0 top-auto z-[70] mx-auto w-full",
        "md:absolute md:inset-x-auto md:bottom-auto md:right-1 md:top-2 md:w-auto",
        "bg-black/80 backdrop-blur-sm rounded-t-2xl border border-white/10 border-b-0",
        "md:rounded-xl md:border-b",
        "p-4 min-w-0 max-w-full md:min-w-[20rem] md:max-w-[25rem]",
        "shadow-lg shadow-black/50",
        className,
      )}
      onClick={(e) => e.stopPropagation()} // 클릭 이벤트 전파 방지
    >
      <Button
        variant="blank"
        className="mx-auto mb-3 block w-16 touch-none rounded-full md:hidden"
        aria-label={lang({ ko: "설정 패널 닫기", en: "Close settings panel" })}
        onPointerDown={handleSheetHandlePointerDown}
        onPointerMove={handleSheetHandlePointerMove}
        onPointerUp={handleSheetHandlePointerEnd}
        onPointerCancel={handleSheetHandlePointerEnd}
      >
        <span className="mx-auto block h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
      </Button>

      {/* 헤더 */}
      <div className="panel-header flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          {panelType === "info" ? (
            <>
              <Heart className="icon-xs" />
              <span>
                <Lang text={{ ko: "관계 정보", en: "Relationship Info" }} />
              </span>
            </>
          ) : (
            <>
              <Settings className="icon-xs" />
              <span>
                <Lang text={{ ko: "설정", en: "Settings" }} />
              </span>
            </>
          )}
        </h3>
        {onToggle && (
          <Button
            variant="blank"
            size="icon-sm"
            onClick={onToggle}
            className="absolute top-1 right-3 text-lg text-white/50 active:text-white/80 transition-colors"
            aria-label={panelType === "info" ? "관계 정보 패널 닫기" : "설정 패널 닫기"}
          >
            <X className="icon-xs" />
            <Lang text={{ ko: "닫기", en: "Close" }} className="sr-only" />
          </Button>
        )}
      </div>

      <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto scrollbar-ghost">
        {panelType === "settings" && (
          <>
            <div className="view-mode-controls flex items-center justify-between gap-2 mb-1 p-2 bg-black/30 rounded-lg border border-white/5">
              <h4 className="text-white font-medium text-xs flex items-center gap-1">
                <Monitor className="w-3 h-3" />
                <Lang text={{ ko: "화면 모드", en: "View Mode" }} />
              </h4>

              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  onClick={() => onToggleViewMode?.("talk")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                    chatViewMode === "talk"
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30",
                  )}
                  aria-pressed={chatViewMode === "talk"}
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>Talk</span>
                </Button>

                <Button
                  onClick={() => onToggleViewMode?.("visual")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                    chatViewMode === "visual"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30",
                  )}
                  aria-pressed={chatViewMode === "visual"}
                >
                  <User className="w-4 h-4" />
                  <span>Visual</span>
                </Button>
              </div>
            </div>

            {modelSelection ? <ChatModelSelector {...modelSelection} /> : null}

            {onTutorTargetLanguageChange ? (
              <div className="mb-1 rounded-lg border border-white/5 bg-black/30 p-2">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-white">
                  <Languages className="h-3 w-3" />
                  <Lang text={{ ko: "캐릭터 대화 언어", en: "Character language" }} />
                </h4>
                <TutorLanguageCombobox
                  value={tutorTargetLanguage}
                  onChange={onTutorTargetLanguageChange}
                  triggerClassName="h-9 min-h-9 border-white/20 bg-black/40 px-3 py-2 text-xs text-white shadow-none hover:border-white/30 [&_span]:text-white"
                />
                <p className="mt-1.5 text-xxs leading-relaxed text-white/50">
                  <Lang
                    text={{
                      ko: "선택한 언어로만 캐릭터가 답변하도록 서버 정책에 반영됩니다.",
                      en: "The server policy forces the character to reply only in the selected language.",
                    }}
                  />
                </p>
              </div>
            ) : null}

            {onTutorConversationLevelChange ? (
              <div className="mb-1 rounded-lg border border-white/5 bg-black/30 p-2">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-white">
                  <Target className="h-3 w-3" />
                  <Lang text={{ ko: "대화 수준", en: "Conversation level" }} />
                </h4>
                <Select
                  value={normalizedTutorConversationLevel}
                  onValueChange={(value) => onTutorConversationLevelChange(value as TutorConversationLevel)}
                >
                  <SelectTrigger className="h-9 border-white/20 bg-black/40 px-3 py-2 text-xs text-white shadow-none hover:border-white/30 [&_span]:text-white">
                    <SelectValue placeholder={lang({ ko: "수준", en: "Level" })} />
                  </SelectTrigger>
                  <SelectContent>
                    {TUTOR_CONVERSATION_LEVEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.level}. <Lang text={option.label} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xxs leading-relaxed text-white/50">
                  <Lang text={selectedConversationLevelOption.description} />
                </p>
              </div>
            ) : null}

            {voicePlaybackAvailable && (
              <div className="voice-playback-controls mb-1 p-2 bg-black/30 rounded-lg border border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-white font-medium text-xs flex items-center gap-1">
                    {assistantVoiceEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    <Lang text={{ ko: "AI 답변 음성", en: "AI Reply Voice" }} />
                  </h4>
                  <Button
                    onClick={toggleAssistantVoice}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                      assistantVoiceEnabled
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        : "bg-gray-500/20 text-gray-400 border border-gray-500/30",
                    )}
                    aria-pressed={assistantVoiceEnabled}
                  >
                    {assistantVoiceEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    {assistantVoiceEnabled ? "ON" : "OFF"}
                  </Button>
                </div>

                {assistantVoiceEnabled && (
                  <div className="mt-2 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white text-xs">
                        <Lang text={{ ko: "답변 자동 재생", en: "Autoplay Replies" }} />
                      </span>
                      <Button
                        onClick={toggleAssistantVoiceAutoplay}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                          assistantVoiceAutoplay
                            ? "bg-green-500/20 text-green-300 border border-green-500/30"
                            : "bg-gray-500/20 text-gray-400 border border-gray-500/30",
                        )}
                        aria-pressed={assistantVoiceAutoplay}
                      >
                        {assistantVoiceAutoplay ? "ON" : "OFF"}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white text-xs">
                          <Lang text={{ ko: "말하기 속도", en: "Speaking speed" }} />
                        </span>

                        <div className="flex items-center gap-2">
                          <Button
                            size="icon-md"
                            rounded="lg"
                            onClick={() => adjustAssistantVoiceSpeed(-1)}
                            disabled={!canDecreaseAssistantVoiceSpeed}
                            className={cn(
                              "border text-white transition-colors",
                              canDecreaseAssistantVoiceSpeed
                                ? "border-blue-500/30 bg-blue-500/20 active:bg-blue-500/30"
                                : "border-gray-500/20 bg-gray-500/10 text-gray-500",
                            )}
                            aria-label={lang({ ko: "말하기 속도 낮추기", en: "Decrease speaking speed" })}
                          >
                            <Minus className="icon-xs" />
                          </Button>
                          <div className="flex w-20 h-8 items-center justify-center rounded border border-white/10 bg-black/20 px-2 text-sm font-semibold text-blue-100">
                            {assistantVoiceSpeedLabel}
                          </div>
                          <Button
                            size="icon-md"
                            rounded="lg"
                            onClick={() => adjustAssistantVoiceSpeed(1)}
                            disabled={!canIncreaseAssistantVoiceSpeed}
                            className={cn(
                              "border text-white transition-colors",
                              canIncreaseAssistantVoiceSpeed
                                ? "border-blue-500/30 bg-blue-500/20 active:bg-blue-500/30"
                                : "border-gray-500/20 bg-gray-500/10 text-gray-500",
                            )}
                            aria-label={lang({ ko: "말하기 속도 높이기", en: "Increase speaking speed" })}
                          >
                            <Plus className="icon-xs" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EL-603 파일럿 승인 Voice — 노출이 열린 경우에만 읽기 전용 목록을 보여준다. */}
            {voicePlaybackAvailable && pilotVoices.length > 0 ? (
              <div className="voice-pilot-voices mb-1 rounded-lg border border-white/5 bg-black/30 p-2">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-white">
                  <Volume2 className="h-3 w-3" />
                  <Lang text={{ ko: "파일럿 승인 Voice", en: "Pilot approved voices" }} />
                </h4>
                <ul className="flex flex-wrap gap-1.5" aria-label={lang({ ko: "파일럿 승인 Voice 목록", en: "Pilot approved voice list" })}>
                  {pilotVoices.map((voiceId) => (
                    <li
                      key={voiceId}
                      className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xxs text-white/80"
                    >
                      {getElevenLabsVoiceCatalogEntry(voiceId)?.label || voiceId}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 음성 대화하기(마이크 입력 분석 모드) 설정 */}
            {voiceInputAvailable && (
              <div className="voice-analysis-controls mb-1 p-2 bg-black/30 rounded-lg border border-white/5">
                <h4 className="text-white font-medium text-xs mb-2 flex items-center gap-1">
                  <Mic className="w-3 h-3" />
                  <Lang text={{ ko: "음성 대화하기", en: "Voice conversation" }} />
                </h4>
                <div className="grid grid-cols-1 gap-1.5">
                  <Button
                    variant="blank"
                    onClick={() => setVoiceAnalysisEnabled(false)}
                    aria-pressed={!voiceAnalysisEnabled}
                    className={cn(
                      FULL_LABEL_BUTTON_CLASS_NAME,
                      !voiceAnalysisEnabled
                        ? "bg-blue-500/20 text-blue-200 border border-blue-500/30"
                        : "bg-gray-500/10 text-gray-400 border border-gray-500/20",
                    )}
                  >
                    <span className="font-medium">
                      <Lang text={{ ko: "TTS만 사용하기", en: "Transcript only" }} />
                    </span>
                    <span className="text-xxs opacity-80">
                      <Lang
                        text={{
                          ko: "캐릭터와 대화할 수 있지만 음성은 분석할 수 없습니다.",
                          en: "You can chat, but speech is not analyzed.",
                        }}
                      />
                    </span>
                  </Button>
                  <Button
                    variant="blank"
                    onClick={() => setVoiceAnalysisEnabled(true)}
                    aria-pressed={voiceAnalysisEnabled}
                    className={cn(
                      FULL_LABEL_BUTTON_CLASS_NAME,
                      voiceAnalysisEnabled
                        ? "bg-purple-500/20 text-purple-200 border border-purple-500/30"
                        : "bg-gray-500/10 text-gray-400 border border-gray-500/20",
                    )}
                  >
                    <span className="font-medium">
                      <Lang text={{ ko: "음성 분석도 함께 사용하기", en: "Chat with speech analysis" }} />
                    </span>
                    <span className="text-xxs opacity-80">
                      <Lang
                        text={{
                          ko: "캐릭터가 음성을 분석하여 피드백을 줄 수 있습니다.",
                          en: "The character can analyze your speech and give feedback.",
                        }}
                      />
                    </span>
                  </Button>
                </div>
              </div>
            )}

            {/* 번역 설정 섹션 - PRO 이상 계정만 표시 */}
            {canUseTranslation && (
              <div className="translation-controls mb-1 p-2 bg-black/30 rounded-lg border border-white/5">
                <h4 className="text-white font-medium text-xs mb-2 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <Lang text={{ ko: "번역 설정", en: "Translation" }} />
                </h4>

                <div className="space-y-2">
                  {/* 번역 활성화 토글 */}
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs">
                      <Lang text={{ ko: "번역", en: "Translation" }} />
                    </span>
                    <Button
                      onClick={handleTranslationToggle}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                        translationSettings.enabled
                          ? "bg-green-500/20 text-green-300 border border-green-500/30"
                          : "bg-gray-500/20 text-gray-400 border border-gray-500/30",
                      )}
                    >
                      <Languages className="w-3 h-3" />
                      {translationSettings.enabled ? "ON" : "OFF"}
                    </Button>
                  </div>

                  {translationSettings.enabled && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-white text-xs block mb-1">
                        <Lang text={{ ko: "번역 언어", en: "Translation language" }} />
                      </label>
                      <Select
                        value={translationSettings.targetLanguage}
                        onValueChange={(value) =>
                          translationSettings.setTargetLanguage(Array.isArray(value) ? value[0] : value)
                        }
                        disabled={!translationSettings.enabled}
                      >
                        <SelectTrigger className="h-8 w-28 border-white/20 bg-black/40 text-xs text-white">
                          <SelectValue placeholder={lang({ ko: "언어", en: "Language" })} />
                        </SelectTrigger>
                        <SelectContent>
                          {CHAT_TRANSLATION_LANGUAGE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <Lang text={option.label} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-xs text-white">
                      <Lang text={{ ko: "보조 AI 모델", en: "Helper AI Model" }} />
                    </label>
                    <ModelSelectField
                      value={helperModelValue}
                      options={helperModelOptions}
                      onChange={handleHelperModelChange}
                      title={lang({ ko: "보조 AI 모델 선택", en: "Select Helper AI Model" })}
                      placeholder={
                        helperModelCatalogLoading
                          ? lang({ ko: "모델을 불러오는 중", en: "Loading models" })
                          : lang({ ko: "모델 선택", en: "Select a model" })
                      }
                      disabled={helperModelCatalogLoading || helperModelOptions.length === 0}
                      emptyText={
                        <Lang text={{ ko: "선택할 텍스트 모델이 없습니다.", en: "No text models are available." }} />
                      }
                      triggerClassName="min-h-12 border-white/10 bg-black/30 px-3 py-2 text-white shadow-none hover:border-white/20 [&_span]:text-white"
                    />
                  </div>

                  <p className="text-xxs leading-relaxed text-white/50 whitespace-pre-line">
                    <Lang
                      text={{
                        ko: "번역을 켜면 각 말풍선의 번역 보기 버튼으로 번역을 확인할 수 있어요.\n보조 AI 기능 사용 시 코인이 추가 사용됩니다.",
                        en: "When translation is on, use each message's show-translation button to view it.\nHelper AI features use additional coins.",
                      }}
                    />
                  </p>
                </div>
              </div>
            )}

            {conversationHintsAvailable && (
              <div className="conversation-hint-controls mb-1 p-2 bg-black/30 rounded-lg border border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-white font-medium text-xs flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" />
                    <Lang text={{ ko: "대화 힌트", en: "Conversation hints" }} />
                  </h4>
                  <Button
                    onClick={() => onConversationHintsEnabledChange?.(!isConversationHintsEnabled)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                      isConversationHintsEnabled
                        ? "bg-yellow-500/20 text-yellow-200 border border-yellow-500/30"
                        : "bg-gray-500/20 text-gray-400 border border-gray-500/30",
                    )}
                    aria-pressed={isConversationHintsEnabled}
                  >
                    {isConversationHintsEnabled ? "ON" : "OFF"}
                  </Button>
                </div>
                <p className="mt-1.5 text-xxs leading-relaxed text-white/50">
                  <Lang
                    text={{
                      ko: "캐릭터 응답에 맞는 다음 문장 예시를 입력창 위에 표시합니다.",
                      en: "Shows learner reply suggestions above the input.",
                    }}
                  />
                </p>
              </div>
            )}

            {/* 대화 기록 섹션 - 번역 설정 섹션 다음에 추가 */}
            <div className="conversation-controls mb-2 p-2 bg-black/30 rounded-lg border border-white/5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-white font-medium text-xs flex items-center gap-1">
                  <History className="w-3 h-3" />
                  <Lang text={{ ko: "대화 기록", en: "Conversation History" }} />
                </h4>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={onShowConversationHistory}
                    disabled={!onShowConversationHistory}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                      "bg-purple-500/20 text-purple-300 border border-purple-500/30",
                      "hover:bg-purple-500/30 hover:text-purple-200",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <History className="w-3 h-3" />
                    <span>
                      <Lang text={{ ko: "기록 보기", en: "View History" }} />
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {panelType === "info" && (
          <>
            {/* 관계 정보 섹션 */}
            <div className="relationship-section p-2 bg-black/30 rounded-lg border border-white/5">
              {personaData ? (
                <>
                  <h4 className="text-white font-medium text-xs mb-2 flex items-center gap-1">
                    <Heart className="icon-xxs" />
                    <Lang text={{ ko: `${characterName}와의 관계`, en: `Relationship with ${characterName}` }} />
                  </h4>

                  <div className="relationship-stats space-y-3">
                    {/* 친밀도 정보 */}
                    <div className="intimacy-section">
                      <StatBar
                        label={lang({ ko: "친밀도", en: "Intimacy" })}
                        value={Math.round(personaData.intimacy || 0)} // Math.round로 반올림
                        max={999}
                        color="bg-gradient-to-r from-pink-500 to-purple-500"
                      />
                      <div className="flex items-center justify-end mt-2">
                        <div className="flex items-center gap-1 text-xs">
                          <span className={`font-bold ${relationshipInfo.intimacyLevel.color}`}>
                            {relationshipInfo.intimacyLevel.level}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 기본 능력치 */}
                    <div className="basic-stats space-y-1">
                      <StatBar
                        label={lang({ ko: "레벨", en: "Level" })}
                        value={personaData.level}
                        max={999}
                        color="bg-gradient-to-r from-yellow-500 to-orange-500"
                        icon={<Star className="w-3 h-3" />}
                      />

                      <StatBar
                        label={lang({ ko: "경험치", en: "Experience" })}
                        value={personaData.xp}
                        max={999}
                        color="bg-gradient-to-r from-green-500 to-blue-500"
                        icon={<TrendingUp className="w-3 h-3" />}
                      />

                      <StatBar
                        label={lang({ ko: "체력", en: "Stamina" })}
                        value={personaData.hp}
                        max={200}
                        color="bg-gradient-to-r from-red-500 to-pink-500"
                        icon={<Zap className="w-3 h-3" />}
                      />

                      <StatBar
                        label={lang({ ko: "정신력", en: "Mentality" })}
                        value={personaData.mp}
                        max={200}
                        color="bg-gradient-to-r from-blue-500 to-cyan-500"
                        icon={<Brain className="w-3 h-3" />}
                      />

                      <StatBar
                        label={lang({ ko: "지성", en: "Intelligence" })}
                        value={personaData.iq}
                        max={150}
                        color="bg-gradient-to-r from-indigo-500 to-purple-500"
                        icon={<Brain className="w-3 h-3" />}
                      />

                      <StatBar
                        label={lang({ ko: "감성", en: "Emotion" })}
                        value={personaData.eq}
                        max={150}
                        color="bg-gradient-to-r from-pink-500 to-rose-500"
                        icon={<Heart className="w-3 h-3" />}
                      />
                    </div>

                    {/* 특수 정보 */}
                    <div className="special-info space-y-2 pt-2 border-t border-white/10">
                      {/* 행운 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-yellow-400" />
                          <span className="text-xs text-white/70">
                            <Lang text={{ ko: "행운", en: "Lucky" }} />
                          </span>
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            (personaData.luck || 0) > 0
                              ? "text-green-400"
                              : (personaData.luck || 0) < 0
                                ? "text-red-400"
                                : "text-gray-400"
                          }`}
                        >
                          {personaData.luck > 0 ? "+" : ""}
                          {personaData.luck || 0}
                        </span>
                      </div>

                      {/* 분위기 */}
                      {moodInfo && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-purple-400" />
                            <span className="text-xs text-white/70">
                              <Lang text={{ ko: "분위기", en: "Mood" }} />
                            </span>
                          </div>
                          <span className={cn("text-xs font-medium", `text-${PERSONA_MOOD_COLOR_MAP[moodInfo]}-400`)}>
                            {getCapitalized(moodInfo)}
                          </span>
                        </div>
                      )}

                      {/* 상호작용 횟수 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-blue-400" />
                          <span className="text-xs text-white/70">
                            <Lang text={{ ko: "대화 횟수", en: "Number of conversations" }} />
                          </span>
                        </div>
                        <span className="text-xs text-white/90">{personaData.totalInteractions || 0}</span>
                      </div>

                      {/* 마지막 만남 */}
                      {personaData.lastInteraction && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-green-400" />
                            <span className="text-xs text-white/70">
                              <Lang text={{ ko: "마지막 만남", en: "Last meeting" }} />
                            </span>
                          </div>
                          <span className="text-xs text-white/90">
                            {relationshipInfo.lastMeetingDays === 0
                              ? lang({ ko: "오늘", en: "Today" })
                              : lang({
                                  ko: `${relationshipInfo.lastMeetingDays}일 전`,
                                  en: `${relationshipInfo.lastMeetingDays} days ago`,
                                })}
                          </span>
                        </div>
                      )}

                      {/* 상태 정보 */}
                      <div className="status-info flex items-center gap-3 pt-2">
                        <div className="flex items-center gap-1">
                          {relationshipInfo.isUnlocked ? (
                            <Unlock className="w-3 h-3 text-green-400" />
                          ) : (
                            <Lock className="w-3 h-3 text-gray-400" />
                          )}
                          <span
                            className={`text-xs ${relationshipInfo.isUnlocked ? "text-green-400" : "text-gray-400"}`}
                          >
                            {relationshipInfo.isUnlocked
                              ? lang({ ko: "잠금해제", en: "Unlock" })
                              : lang({ ko: "잠금상태", en: "Locked" })}
                          </span>
                        </div>

                        {relationshipInfo.hasOwnership && (
                          <div className="flex items-center gap-1">
                            <Crown className="w-3 h-3 text-yellow-400" />
                            <span className="text-xs text-yellow-400">
                              <Lang text={{ ko: "소유", en: "Possession" }} />
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="no-data flex items-center justify-center py-4">
                  <span className="text-sm text-white/50">
                    <Lang text={{ ko: "관계 정보가 없습니다", en: "No relationship information" }} />
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ChatControlPanel;
