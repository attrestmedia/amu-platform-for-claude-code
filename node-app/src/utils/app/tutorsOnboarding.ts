import { DEFAULT_FANTASY_UNIVERSE, DEFAULT_WORLD_UNIVERSE } from "consts/app";
import {
  DEFAULT_TUTOR_TARGET_LANGUAGE,
  resolveDefaultTutorConversationLevelByAge,
  type TutorConversationLevel,
} from "consts/tutors";
import type { PersonaFormValuesType, PersonaType } from "types/ai";
import type { LanguageType } from "types/language";

type TutorOnboardingFocus = "speaking" | "exam" | "proofread" | "habit";
type TutorOnboardingOperationMode = "tutor" | "coach" | "proofread" | "chat";
type TutorOnboardingAnswerStyle = "short" | "balanced" | "detailed";

type LocalizedText = {
  ko: string;
  en: string;
};

type TutorOnboardingPresetPatch = {
  targetLanguage: string;
  topic: string;
  learningGoal: string;
  focus: TutorOnboardingFocus;
  conversationLevel: TutorConversationLevel;
  goalType?: "learning" | "conversation" | "coaching" | "analysis" | "creative" | "support";
  operationMode: TutorOnboardingOperationMode;
  answerStyle: TutorOnboardingAnswerStyle;
  correctionStrength: number;
  strict: boolean;
};

type TutorOnboardingPreset = {
  id: string;
  label: LocalizedText;
  description: LocalizedText;
  patch: TutorOnboardingPresetPatch;
};

const DEFAULT_TOPIC = "일상 회화";
const DEFAULT_LEARNING_GOAL = "실전에서 바로 말할 수 있도록 짧게 자주 연습하고 싶어요.";

const LOCALIZED_TUTOR_DEFAULTS: Record<
  LanguageType,
  {
    targetLanguage: string;
    topic: string;
    learningGoal: string;
  }
> = {
  ko: {
    targetLanguage: DEFAULT_TUTOR_TARGET_LANGUAGE,
    topic: DEFAULT_TOPIC,
    learningGoal: DEFAULT_LEARNING_GOAL,
  },
  en: {
    targetLanguage: DEFAULT_TUTOR_TARGET_LANGUAGE,
    topic: "Daily conversation",
    learningGoal: "I want to practice in short, frequent sessions so I can speak more naturally in real situations.",
  },
};

const FOCUS_META: Record<
  TutorOnboardingFocus,
  {
    defaultTopic: string;
    defaultGoal: string;
    nameSuffix: string;
    summaryTone: string;
    introFocus: string;
  }
> = {
  speaking: {
    defaultTopic: "일상 회화",
    defaultGoal: "짧은 문장을 바로 말하고, 대화 흐름을 끊지 않도록 반복 연습하고 싶어요.",
    nameSuffix: "Speaking Coach",
    summaryTone: "실전 대화 중심",
    introFocus: "짧은 롤플레이와 즉시 교정",
  },
  exam: {
    defaultTopic: "시험 대비",
    defaultGoal: "시험 유형별 약점을 빠르게 파악하고, 오답 패턴을 줄이고 싶어요.",
    nameSuffix: "Exam Tutor",
    summaryTone: "시험 전략 중심",
    introFocus: "개념 설명 후 바로 문제 풀이",
  },
  proofread: {
    defaultTopic: "글쓰기 교정",
    defaultGoal: "내 문장을 자연스럽게 다듬고, 왜 수정됐는지 짧게 배우고 싶어요.",
    nameSuffix: "Writing Editor",
    summaryTone: "문장 교정 중심",
    introFocus: "원문 보존형 교정과 대체 표현 제안",
  },
  habit: {
    defaultTopic: "매일 학습 루틴",
    defaultGoal: "매일 10분씩 가볍게 이어가며 학습 습관을 만들고 싶어요.",
    nameSuffix: "Study Coach",
    summaryTone: "루틴 코칭 중심",
    introFocus: "짧은 미션과 점검 질문",
  },
};

export const TUTOR_ONBOARDING_PRESETS: TutorOnboardingPreset[] = [
  {
    id: "speaking-fast-start",
    label: { ko: "영어 회화 시작", en: "Start English speaking" },
    description: {
      ko: "일상 회화 중심으로 바로 말해보는 튜터를 만듭니다.",
      en: "Create a tutor focused on starting everyday speaking right away.",
    },
    patch: {
      targetLanguage: "English",
      topic: FOCUS_META.speaking.defaultTopic,
      learningGoal: FOCUS_META.speaking.defaultGoal,
      focus: "speaking",
      conversationLevel: "level1",
      goalType: "learning",
      operationMode: "coach",
      answerStyle: "balanced",
      correctionStrength: 2,
      strict: false,
    },
  },
  {
    id: "business-meeting-coach",
    label: { ko: "업무 미팅 코치", en: "Business meeting coach" },
    description: {
      ko: "회의 시작, 의견 제안, 짧은 보고에 강한 업무형 튜터를 만듭니다.",
      en: "Create a tutor focused on opening meetings, proposing ideas, and giving short updates.",
    },
    patch: {
      targetLanguage: "English",
      topic: "업무 미팅",
      learningGoal: "업무 미팅에서 첫 문장과 의견 제안을 자연스럽게 말하고 싶어요.",
      focus: "speaking",
      conversationLevel: "level2",
      goalType: "coaching",
      operationMode: "coach",
      answerStyle: "balanced",
      correctionStrength: 2,
      strict: true,
    },
  },
  {
    id: "exam-focus",
    label: { ko: "시험 대비", en: "Exam prep" },
    description: {
      ko: "문제 풀이와 오답 교정을 우선하는 튜터를 만듭니다.",
      en: "Create a tutor focused on solving questions and fixing mistakes.",
    },
    patch: {
      targetLanguage: "English",
      topic: FOCUS_META.exam.defaultTopic,
      learningGoal: FOCUS_META.exam.defaultGoal,
      focus: "exam",
      conversationLevel: "level2",
      goalType: "learning",
      operationMode: "tutor",
      answerStyle: "detailed",
      correctionStrength: 3,
      strict: true,
    },
  },
  {
    id: "japanese-travel-quickstart",
    label: { ko: "일본 여행 회화", en: "Japanese travel quickstart" },
    description: {
      ko: "여행지에서 바로 쓰는 자기소개, 주문, 길 묻기 표현을 빠르게 익힙니다.",
      en: "Practice introductions, ordering, and asking for directions for travel right away.",
    },
    patch: {
      targetLanguage: "Japanese",
      topic: "여행 회화",
      learningGoal: "일본 여행에서 자기소개, 주문, 길 묻기를 자연스럽게 말하고 싶어요.",
      focus: "speaking",
      conversationLevel: "level1",
      goalType: "learning",
      operationMode: "coach",
      answerStyle: "short",
      correctionStrength: 1,
      strict: false,
    },
  },
  {
    id: "writing-proofread",
    label: { ko: "글쓰기 교정", en: "Writing proofread" },
    description: {
      ko: "내 문장을 다듬고 더 자연스러운 표현을 배우는 튜터입니다.",
      en: "Create a tutor that refines your writing and teaches natural phrasing.",
    },
    patch: {
      targetLanguage: "English",
      topic: FOCUS_META.proofread.defaultTopic,
      learningGoal: FOCUS_META.proofread.defaultGoal,
      focus: "proofread",
      conversationLevel: "level2",
      goalType: "learning",
      operationMode: "proofread",
      answerStyle: "balanced",
      correctionStrength: 2,
      strict: true,
    },
  },
];

export function resolveTutorUniverseId(personaType: PersonaType) {
  return personaType === "monster" ? DEFAULT_FANTASY_UNIVERSE : DEFAULT_WORLD_UNIVERSE;
}

export function resolveTutorLocalizedDefaults(preferredUiLanguage: LanguageType = "ko") {
  return LOCALIZED_TUTOR_DEFAULTS[preferredUiLanguage] || LOCALIZED_TUTOR_DEFAULTS.ko;
}

export function makeEmptyTutor(preferredUiLanguage: LanguageType = "ko", learnerAge?: number): PersonaFormValuesType {
  const localizedDefaults = resolveTutorLocalizedDefaults(preferredUiLanguage);
  const defaultConversationLevel = resolveDefaultTutorConversationLevelByAge(learnerAge);

  return {
    personaType: "human",
    pid: "",
    universeId: resolveTutorUniverseId("human"),
    systemPersonaKey: "",
    name: "",
    age: "",
    appearance: "",
    background: "",
    personality: "",
    summary: "",
    language: localizedDefaults.targetLanguage,
    profiles: { default: [] },
    sprite: null,
    tutorIntro: "",
    tutorsPolicy: {
      operationMode: "tutor",
      correctionStrength: 2,
      answerStyle: "balanced",
      targetLanguage: localizedDefaults.targetLanguage,
      topic: localizedDefaults.topic,
      learningGoal: localizedDefaults.learningGoal,
      conversationLevel: defaultConversationLevel,
      goalType: "learning",
      includeKnowledgeDefault: true,
    },
    tutorsUi: {
      defaultViewMode: "visual",
      autoAiResponse: false,
      subtitle: { enabled: false },
      conversationHint: { enabled: true },
    },
  } as PersonaFormValuesType;
}
