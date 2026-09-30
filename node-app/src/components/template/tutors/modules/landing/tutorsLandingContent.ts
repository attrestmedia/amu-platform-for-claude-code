import { TUTOR_ONBOARDING_PRESETS } from "utils/app/tutorsOnboarding";
import tutorsHeroImage from "src/assets/tutors/tutors-hero-v1.webp";

/**
 * Tutors 비로그인 랜딩 카피·비주얼 상수.
 *
 * 정책 근거
 *  - 서비스 상태: 베타 출시(운영 중) — Marketing Charter §2, tutors/GUIDE.md
 *  - 과금 표기: 대화는 개인 지갑 코인 차감(코드 확인: libs/server-utils/api/unifiedChat.ts의
 *    assertPricingPreflightOrThrow + billing). "무료" 단독 표기 금지 — Charter §6.2
 *  - 음성 소구 보류: 동의·보존 TTL·삭제 정책 확정 전까지 텍스트 대화 중심으로 표현
 *    — Charter §11, .claude/rules/compliance-guardrails.md §3
 */

/** 승인된 AMU 서비스 프로모션 아이덴티티 자산 + 대화 경험 보조 자산 */
export const TUTORS_LANDING_IMAGES = {
  /** promo-identity-proposals/20260730/tutors-hero-v1 — 3:2, 좌측 카피 여백 */
  hero: tutorsHeroImage,
  /** asset_5ca66a19896842f79ef5d34b7e7337b1 — 3:4, 하단 대화 UI 여백 */
  conversation:
    "https://assets.allmyuniverse.com/gen-studio/users/2-da4b9237/1785315456006-gpt-image-2-8e6e1699-lgxdni.webp",
} as const;

/** 히어로 — 브랜드 + 헤드라인 1 + 보조문장 1 + CTA 1 (첫 뷰포트 One composition) */
export const TUTORS_HERO_COPY = {
  brand: "Tutors",
  status: { ko: "베타 운영 중", en: "Beta" },
  headline: {
    ko: "내가 만든 튜터와\n매일 이어지는 대화",
    en: "Daily conversations\nwith a tutor you made",
  },
  lead: {
    ko: "이름과 성격, 말투까지 직접 정한 튜터와 대화하며 배웁니다.",
    en: "Shape your tutor's name, personality, and tone — then learn by talking with them.",
  },
  cta: {
    loggedIn: { ko: "내 튜터 바로가기", en: "Go my tutor" },
    loggedOut: { ko: "내 튜터 만들기", en: "Create my tutor" },
  },
} as const;

/** 대화 경험 — 실제 대화 화면과 같은 장면을 지면에서 먼저 보여준다 */
export const TUTORS_CONVERSATION_COPY = {
  eyebrow: { ko: "대화 경험", en: "The conversation" },
  headline: {
    ko: "얼굴을 마주한 것처럼,\n한 문장씩 고쳐가며",
    en: "Face to face,\none sentence at a time",
  },
  lead: {
    ko: "튜터가 먼저 말을 걸고, 틀린 문장은 그 자리에서 다시 써줍니다.",
    en: "Your tutor starts the conversation and rewrites your sentence on the spot.",
  },
} as const;

export const TUTORS_DEMO_TURNS = [
  {
    role: "tutor" as const,
    text: "What did you do this morning?",
  },
  {
    role: "learner" as const,
    text: "I woke up and eat breakfast.",
  },
  {
    role: "correction" as const,
    text: "I woke up and ate breakfast.",
    note: {
      ko: "지난 일이라 eat 대신 ate를 씁니다.",
      en: "Past tense — use 'ate' instead of 'eat'.",
    },
  },
] as const;

/** 페르소나 — Tutors만의 차별점(튜터를 소유한다)을 필드로 보여준다 */
export const TUTORS_PERSONA_COPY = {
  eyebrow: { ko: "나만의 튜터", en: "Your own tutor" },
  headline: {
    ko: "성격까지 직접 정하는\n단 한 명의 튜터",
    en: "One tutor,\ndefined down to their personality",
  },
  lead: {
    ko: "정체성을 채워 만든 튜터는 계정에 남고, 대화를 이어갈수록 나에게 맞춰집니다.",
    en: "The tutor you define stays in your account and adapts as your conversations continue.",
  },
  fields: [
    { ko: "이름", en: "Name" },
    { ko: "나이", en: "Age" },
    { ko: "성별", en: "Gender" },
    { ko: "사용 언어", en: "Language" },
    { ko: "국적", en: "Nationality" },
    { ko: "직업", en: "Occupation" },
    { ko: "가치관", en: "Values" },
    { ko: "말투", en: "Tone" },
  ],
} as const;

/** 프리셋 — 클릭 대상이므로 카드 컨테이너 허용 */
export const TUTORS_PRESET_COPY = {
  eyebrow: { ko: "빠른 시작", en: "Quick start" },
  headline: { ko: "목표부터 고르면 됩니다", en: "Start from your goal" },
  lead: {
    ko: "프리셋을 고르면 목표에 맞춘 튜터 설정이 채워진 채로 시작합니다.",
    en: "Pick a preset and your tutor starts pre-configured for that goal.",
  },
  presets: TUTOR_ONBOARDING_PRESETS,
} as const;

/** 마감 CTA — Charter §6.2에 따라 무료 범위와 코인 차감 시점을 함께 밝힌다 */
export const TUTORS_CLOSING_COPY = {
  headline: { ko: "오늘 첫 대화를 시작하세요", en: "Start your first conversation today" },
  cta: { ko: "내 튜터 만들기", en: "Create my tutor" },
  costNote: {
    ko: "공개 튜터 템플릿과 프리셋은 무료로 둘러볼 수 있고, 대화를 시작하면 코인이 듭니다.",
    en: "Browsing public tutor templates and presets is free; starting a conversation uses coins.",
  },
} as const;
