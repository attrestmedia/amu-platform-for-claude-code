export const DEFAULT_TUTOR_PROFILE_IMAGE_TEMPLATE_KEY = "avatar-human-portrait-v2";
export const DEFAULT_TUTOR_TARGET_LANGUAGE = "English";
export const DEFAULT_TUTOR_CONVERSATION_LEVEL = "level1";
export const DEFAULT_TUTOR_GOAL_TYPE = "learning";

export type TutorConversationLevel = "level0" | "level1" | "level2" | "level3";
export type TutorGoalType = "learning" | "conversation" | "coaching" | "analysis" | "creative" | "support";

export type TutorConversationLevelOption = {
  value: TutorConversationLevel;
  level: number;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  prompt: string;
};

export type TutorGoalTypeOption = {
  value: TutorGoalType;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  prompt: string;
};

export const TUTOR_GOAL_TYPE_OPTIONS = [
  {
    value: "learning",
    label: { ko: "학습", en: "Learning" },
    description: {
      ko: "개념 이해, 연습, 피드백을 중심으로 진행합니다.",
      en: "Focuses on concepts, practice, and feedback.",
    },
    prompt: "Teach, practice, and check understanding. Use exercises only when they fit the persona and user request.",
  },
  {
    value: "conversation",
    label: { ko: "대화", en: "Conversation" },
    description: {
      ko: "자연스러운 대화, 캐릭터성, 관점 교환을 우선합니다.",
      en: "Prioritizes natural dialogue, persona presence, and perspective exchange.",
    },
    prompt:
      "Prioritize natural conversation and persona presence. Do not force lessons, drills, or corrections unless asked.",
  },
  {
    value: "coaching",
    label: { ko: "코칭", en: "Coaching" },
    description: {
      ko: "목표 정리, 선택지 비교, 다음 행동을 돕습니다.",
      en: "Helps clarify goals, compare options, and choose next actions.",
    },
    prompt:
      "Help the user clarify goals, compare options, and choose practical next actions without taking over decisions.",
  },
  {
    value: "analysis",
    label: { ko: "분석", en: "Analysis" },
    description: {
      ko: "관찰, 비평, 근거 비교, 관점 확장을 다룹니다.",
      en: "Handles observation, critique, evidence comparison, and perspective expansion.",
    },
    prompt:
      "Analyze the subject with evidence, tradeoffs, and clear reasoning. Separate observation from interpretation.",
  },
  {
    value: "creative",
    label: { ko: "창작", en: "Creative" },
    description: {
      ko: "아이디어 발상, 세계관, 표현 개선을 지원합니다.",
      en: "Supports ideation, worldbuilding, and expression refinement.",
    },
    prompt:
      "Support ideation, variation, and refinement. Offer concrete creative options instead of generic encouragement.",
  },
  {
    value: "support",
    label: { ko: "도움", en: "Support" },
    description: {
      ko: "문제 해결, 안내, 정서적 지지를 안전하게 제공합니다.",
      en: "Provides safe problem solving, guidance, and emotional support.",
    },
    prompt:
      "Offer safe, practical support. For sensitive topics, avoid overclaiming and encourage appropriate professional help when needed.",
  },
] as const satisfies readonly TutorGoalTypeOption[];

export const TUTOR_CONVERSATION_LEVEL_OPTIONS = [
  {
    value: "level0",
    level: 0,
    label: { ko: "가볍게", en: "Light" },
    description: {
      ko: "핵심 1개와 아주 작은 반응부터 시작합니다.",
      en: "Starts with one core point and one tiny response.",
    },
    prompt:
      "Use one core point at a time. Give a simple example or choice before asking the user to act. Ask only one tiny question or task.",
  },
  {
    value: "level1",
    level: 1,
    label: { ko: "쉽고 간단하게", en: "Easy" },
    description: {
      ko: "짧은 예시와 한 가지 작은 응답으로 진행합니다.",
      en: "Uses a short example and one small response step.",
    },
    prompt:
      "Use approachable explanations or dialogue. Give one example before asking the user to answer or try. Address only the most important issue.",
  },
  {
    value: "level2",
    level: 2,
    label: { ko: "균형있게", en: "Balanced" },
    description: {
      ko: "맥락 설명과 간단한 피드백을 함께 진행합니다.",
      en: "Uses context, light feedback, and a follow-up step.",
    },
    prompt:
      "Use compact step-by-step guidance or natural dialogue. Add brief feedback and one follow-up question or practice task.",
  },
  {
    value: "level3",
    level: 3,
    label: { ko: "깊고 진지하게", en: "Deep" },
    description: {
      ko: "비교, 추론, 응용을 조금 더 요구합니다.",
      en: "Adds slightly harder comparison, reasoning, or application.",
    },
    prompt:
      "Increase cognitive challenge slightly. Ask the user to compare, reason, apply, or improve the answer with one harder follow-up.",
  },
] as const satisfies readonly TutorConversationLevelOption[];

export function isTutorConversationLevel(value: unknown): value is TutorConversationLevel {
  return (
    typeof value === "string" &&
    TUTOR_CONVERSATION_LEVEL_OPTIONS.some((option) => option.value === value)
  );
}

export function isTutorGoalType(value: unknown): value is TutorGoalType {
  return typeof value === "string" && TUTOR_GOAL_TYPE_OPTIONS.some((option) => option.value === value);
}

export function normalizeTutorConversationLevel(
  value: unknown,
  fallback: TutorConversationLevel = DEFAULT_TUTOR_CONVERSATION_LEVEL,
): TutorConversationLevel {
  const raw = typeof value === "string" ? value.trim() : "";
  if (isTutorConversationLevel(raw)) return raw;
  return fallback;
}

export function getTutorConversationLevelOption(value: unknown) {
  const normalized = normalizeTutorConversationLevel(value);
  return (
    TUTOR_CONVERSATION_LEVEL_OPTIONS.find((option) => option.value === normalized) ||
    TUTOR_CONVERSATION_LEVEL_OPTIONS[1]
  );
}

export function normalizeTutorGoalType(value: unknown, fallback: TutorGoalType = DEFAULT_TUTOR_GOAL_TYPE) {
  const raw = (typeof value === "string" ? value : "")
    .trim()
    .toLowerCase();
  return isTutorGoalType(raw) ? raw : fallback;
}

export function getTutorGoalTypeOption(value: unknown) {
  const normalized = normalizeTutorGoalType(value);
  return TUTOR_GOAL_TYPE_OPTIONS.find((option) => option.value === normalized) || TUTOR_GOAL_TYPE_OPTIONS[0];
}

export function resolveDefaultTutorConversationLevelByAge(age: unknown): TutorConversationLevel {
  const numericAge = Number(age);
  if (!Number.isFinite(numericAge) || numericAge <= 0) return DEFAULT_TUTOR_CONVERSATION_LEVEL;
  if (numericAge <= 12 || numericAge >= 65) return "level0";
  return "level1";
}

export type TutorLanguageOption = {
  value: string;
  code: string;
  label: { ko: string; en: string };
  nativeName: string;
  searchText: string;
};

export const TUTOR_LANGUAGE_OPTIONS = [
  {
    value: "English",
    code: "en",
    label: { ko: "영어", en: "English" },
    nativeName: "English",
    searchText: "english 영어 en",
  },
  {
    value: "Korean",
    code: "ko",
    label: { ko: "한국어", en: "Korean" },
    nativeName: "한국어",
    searchText: "korean 한국어 ko",
  },
  {
    value: "Japanese",
    code: "ja",
    label: { ko: "일본어", en: "Japanese" },
    nativeName: "日本語",
    searchText: "japanese 일본어 ja",
  },
  {
    value: "Chinese",
    code: "zh",
    label: { ko: "중국어", en: "Chinese" },
    nativeName: "中文",
    searchText: "chinese 중국어 zh",
  },
  {
    value: "Spanish",
    code: "es",
    label: { ko: "스페인어", en: "Spanish" },
    nativeName: "Español",
    searchText: "spanish 스페인어 es",
  },
  {
    value: "French",
    code: "fr",
    label: { ko: "프랑스어", en: "French" },
    nativeName: "Français",
    searchText: "french 프랑스어 fr",
  },
  {
    value: "German",
    code: "de",
    label: { ko: "독일어", en: "German" },
    nativeName: "Deutsch",
    searchText: "german 독일어 de",
  },
  {
    value: "Arabic",
    code: "ar",
    label: { ko: "아랍어", en: "Arabic" },
    nativeName: "العربية",
    searchText: "arabic 아랍어 ar",
  },
  {
    value: "Portuguese",
    code: "pt",
    label: { ko: "포르투갈어", en: "Portuguese" },
    nativeName: "Português",
    searchText: "portuguese 포르투갈어 pt",
  },
  {
    value: "Italian",
    code: "it",
    label: { ko: "이탈리아어", en: "Italian" },
    nativeName: "Italiano",
    searchText: "italian 이탈리아어 it",
  },
] as const satisfies readonly TutorLanguageOption[];

export function getTutorLanguageOption(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  return (
    TUTOR_LANGUAGE_OPTIONS.find((option) => {
      const aliases = [
        option.value,
        option.code,
        option.label.ko,
        option.label.en,
        option.nativeName,
        option.searchText,
      ]
        .join(" ")
        .toLowerCase();
      return aliases.split(/\s+/).includes(raw) || aliases.includes(raw);
    }) || null
  );
}

export function normalizeTutorTargetLanguage(value: unknown, fallback = DEFAULT_TUTOR_TARGET_LANGUAGE) {
  return getTutorLanguageOption(value)?.value || fallback;
}

export const TUTOR_PROFILE_IMAGE_TEMPLATE_PREFIX = "amu-profile-";
export const TUTOR_PROFILE_IMAGE_ADMIN_TEMPLATE_KEYS = {
  human: `${TUTOR_PROFILE_IMAGE_TEMPLATE_PREFIX}human-v1`,
  monster: `${TUTOR_PROFILE_IMAGE_TEMPLATE_PREFIX}monster-v1`,
} as const;
export const TUTOR_PERSONA_CONTENT_TEMPLATE_PREFIX = "amu-persona-";
export const TUTOR_PERSONA_CONTENT_ADMIN_TEMPLATE_KEYS = {
  human: `${TUTOR_PERSONA_CONTENT_TEMPLATE_PREFIX}human-v1`,
  monster: `${TUTOR_PERSONA_CONTENT_TEMPLATE_PREFIX}monster-v1`,
} as const;
export const TUTOR_PROFILE_IMAGE_PUBLIC_SAMPLE_LIMIT = 6;

export const TUTORS_INITIAL_CREATION_ALLOWANCE = 1;
export const TUTORS_CREATION_UNLOCK_COMPLETED_SESSIONS = 3;
export const TUTORS_SESSION_MIN_USER_MESSAGES = 5;
export const TUTORS_SESSION_MIN_ASSISTANT_MESSAGES = 5;
export const TUTORS_SESSION_MIN_DURATION_MS = 60_000;
export const TUTORS_DAILY_XP_LIMIT = 40;
export const TUTORS_DAILY_INTIMACY_LIMIT = 5;
export const TUTORS_MAX_LEVEL = 50;

export const TUTORS_MISSION_CATALOG = {
  daily_valid_session: { period: "daily", xp: 5, creationCredits: 0 },
  daily_voice_session: { period: "daily", xp: 5, creationCredits: 0 },
  weekly_three_days: { period: "weekly", xp: 0, creationCredits: 0 },
  streak_three_days: { period: "achievement", xp: 20, creationCredits: 0 },
  streak_ten_days: { period: "achievement", xp: 0, creationCredits: 0 },
} as const;
