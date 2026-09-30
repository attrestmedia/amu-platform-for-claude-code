import { TUTOR_PROFILE_IMAGE_ADMIN_TEMPLATE_KEYS } from "consts/tutors";
import {
  GEN_STUDIO_REALISTIC_CHARACTER_REQUIRED_VARIABLE_KEYS,
  GEN_STUDIO_REALISTIC_CHARACTER_TYPE_VARIABLE_KEY,
} from "consts/app";
import type { IPersonaProfileMap, PersonaFormValuesType, PersonaType } from "types/ai";

export type TutorProfileImageRequiredFieldKey = "name" | "summary" | "appearance" | "personality";

export const TUTOR_PROFILE_IMAGE_REQUIRED_FIELD_KEYS = ["name", "summary", "appearance", "personality"] as const;
export const TUTOR_PROFILE_IMAGE_REQUIRED_TEMPLATE_VARIABLE_KEYS =
  GEN_STUDIO_REALISTIC_CHARACTER_REQUIRED_VARIABLE_KEYS;
export const TUTOR_PROFILE_ARTIFACT_DRAFT_PERSONA_ID_FIELD = "__profileArtifactDraftPersonaId";
export const TUTOR_PROFILE_IMAGE_ATTACHMENT_INSTRUCTION = {
  referenceOnly: "첨부 이미지를 기반으로 원본 이미지 속 피사체의 정확한 비율, 해부학적 구조, 포즈, 고유한 특징을 그대로 유지하며 이미지를 생성합니다.",
  referenceWithText:
    "첨부 이미지를 기반으로 원본 이미지 속 피사체의 정확한 비율, 해부학적 구조, 포즈, 고유한 특징과 텍스트 설명을 정확하게 반영하여 이미지를 생성합니다.",
  textOnly: "텍스트 설명을 정확하게 반영하여 이미지를 생성합니다.",
} as const;
export const TUTOR_PROFILE_IMAGE_REQUIRED_FIELD_LABELS: Record<
  TutorProfileImageRequiredFieldKey,
  { ko: string; en: string }
> = {
  name: { ko: "이름", en: "Name" },
  summary: { ko: "요약", en: "Summary" },
  appearance: { ko: "외모", en: "Appearance" },
  personality: { ko: "성격", en: "Personality" },
};

function compactText(value: unknown, limit: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function getPrimaryProfileImage(profiles?: IPersonaProfileMap | null) {
  return String(profiles?.default?.[0] || "").trim();
}

/** API가 내려주는 표시 전용 URL을 우선 사용하되, 저장용 profiles는 건드리지 않는다. */
export function getTutorProfileImageForDisplay(persona?: Partial<PersonaFormValuesType> | null) {
  const transport = persona as (Partial<PersonaFormValuesType> & { profileImageDisplayUrl?: unknown }) | null | undefined;
  const hasDisplayUrl = Boolean(transport && Object.prototype.hasOwnProperty.call(transport, "profileImageDisplayUrl"));
  const displayUrl = String(transport?.profileImageDisplayUrl || "").trim();
  return hasDisplayUrl ? displayUrl : getPrimaryProfileImage(persona?.profiles);
}

export function setPrimaryProfileImage(profiles: IPersonaProfileMap | null | undefined, nextUrl: string) {
  const trimmed = String(nextUrl || "").trim();
  const base = profiles && typeof profiles === "object" ? profiles : { default: [] };
  const currentDefault = Array.isArray(base.default) ? base.default.filter((item) => String(item || "").trim()) : [];
  const tail = currentDefault.filter((item) => item !== currentDefault[0] && item !== trimmed);

  return {
    ...base,
    default: trimmed ? [trimmed, ...tail] : tail,
  } as IPersonaProfileMap;
}

export function resolveTutorProfileImageTemplateKey(personaType?: PersonaType | null) {
  return personaType === "monster"
    ? TUTOR_PROFILE_IMAGE_ADMIN_TEMPLATE_KEYS.monster
    : TUTOR_PROFILE_IMAGE_ADMIN_TEMPLATE_KEYS.human;
}

export function buildTutorProfileImageTemplateVariables(personaType?: PersonaType | null) {
  return {
    [GEN_STUDIO_REALISTIC_CHARACTER_TYPE_VARIABLE_KEY]: personaType === "monster" ? "monster" : "human",
  };
}

export function getTutorProfileImageMissingRequiredFields(persona?: Partial<PersonaFormValuesType> | null) {
  return TUTOR_PROFILE_IMAGE_REQUIRED_FIELD_KEYS.filter((fieldKey) => !compactText(persona?.[fieldKey], 320));
}

export function hasTutorProfileImageGenerationBasics(persona?: Partial<PersonaFormValuesType> | null) {
  return getTutorProfileImageMissingRequiredFields(persona).length === 0;
}

export function buildTutorProfileImageDescription(persona?: Partial<PersonaFormValuesType> | null, extraBrief?: string) {
  const policy = persona?.tutorsPolicy && typeof persona.tutorsPolicy === "object" ? persona.tutorsPolicy : null;
  const lines = [
    persona?.personaType ? `Persona type: ${compactText(persona.personaType, 20)}` : "",
    compactText(persona?.name, 80) ? `Tutor name: ${compactText(persona?.name, 80)}` : "",
    compactText(persona?.job, 120) ? `Role: ${compactText(persona?.job, 120)}` : "",
    compactText(persona?.species, 120) ? `Species: ${compactText(persona?.species, 120)}` : "",
    compactText(persona?.habitat, 160) ? `Habitat: ${compactText(persona?.habitat, 160)}` : "",
    compactText(persona?.threatLevel, 80) ? `Threat level: ${compactText(persona?.threatLevel, 80)}` : "",
    compactText(persona?.specialAbilities, 300) ? `Special abilities: ${compactText(persona?.specialAbilities, 300)}` : "",
    compactText(policy?.targetLanguage, 40) ? `Target language: ${compactText(policy?.targetLanguage, 40)}` : "",
    compactText(policy?.topic, 120) ? `Study topic: ${compactText(policy?.topic, 120)}` : "",
    compactText(policy?.learningGoal, 200) ? `Learning goal: ${compactText(policy?.learningGoal, 200)}` : "",
    compactText(persona?.appearance, 300) ? `Appearance: ${compactText(persona?.appearance, 300)}` : "",
    compactText(persona?.summary, 300) ? `Summary: ${compactText(persona?.summary, 300)}` : "",
    compactText(persona?.background, 400) ? `Background: ${compactText(persona?.background, 400)}` : "",
    compactText(persona?.personality, 300) ? `Personality: ${compactText(persona?.personality, 300)}` : "",
    compactText(persona?.tutorIntro, 240) ? `Tutor intro tone: ${compactText(persona?.tutorIntro, 240)}` : "",
    compactText(extraBrief, 500) ? `Additional image direction: ${compactText(extraBrief, 500)}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildTutorProfileImageAttachmentInstruction(args: { hasBaseImage: boolean; extraBrief?: string }) {
  const hasTextBrief = Boolean(compactText(args.extraBrief, 500));

  if (args.hasBaseImage) {
    return hasTextBrief
      ? TUTOR_PROFILE_IMAGE_ATTACHMENT_INSTRUCTION.referenceWithText
      : TUTOR_PROFILE_IMAGE_ATTACHMENT_INSTRUCTION.referenceOnly;
  }

  return TUTOR_PROFILE_IMAGE_ATTACHMENT_INSTRUCTION.textOnly;
}

export function buildTutorProfileImagePromptContext(persona?: Partial<PersonaFormValuesType> | null, extraBrief?: string) {
  const policy = persona?.tutorsPolicy && typeof persona.tutorsPolicy === "object" ? persona.tutorsPolicy : null;
  const personaType = persona?.personaType === "monster" ? "monster" : "human";

  const commonLines = [
    compactText(persona?.name, 80) ? `- 이름: ${compactText(persona?.name, 80)}` : "",
    compactText(persona?.age, 40) ? `- 나이대: ${compactText(persona?.age, 40)}` : "",
    compactText(persona?.gender, 40) ? `- 성별/젠더 표현: ${compactText(persona?.gender, 40)}` : "",
    compactText(persona?.nationality, 80) ? `- 국적/문화권: ${compactText(persona?.nationality, 80)}` : "",
    compactText(persona?.language, 80) ? `- 사용 언어: ${compactText(persona?.language, 80)}` : "",
    compactText(persona?.appearance, 320) ? `- 외모 설정: ${compactText(persona?.appearance, 320)}` : "",
    compactText(persona?.personality, 320) ? `- 성격/무드: ${compactText(persona?.personality, 320)}` : "",
    compactText(persona?.summary, 320) ? `- 한줄 요약: ${compactText(persona?.summary, 320)}` : "",
    compactText(persona?.background, 480) ? `- 배경/서사: ${compactText(persona?.background, 480)}` : "",
    compactText(persona?.values, 240) ? `- 가치관: ${compactText(persona?.values, 240)}` : "",
    compactText(persona?.preferences, 240) ? `- 선호/취향: ${compactText(persona?.preferences, 240)}` : "",
    compactText(persona?.tutorIntro, 280) ? `- 튜터 소개 톤: ${compactText(persona?.tutorIntro, 280)}` : "",
  ];

  const humanLines =
    personaType === "human"
      ? [
          compactText(persona?.job, 120) ? `- 직업/역할: ${compactText(persona?.job, 120)}` : "",
        ]
      : [];

  const monsterLines =
    personaType === "monster"
      ? [
          compactText(persona?.species, 120) ? `- 종족/크리처 타입: ${compactText(persona?.species, 120)}` : "",
          compactText(persona?.habitat, 160) ? `- 서식지/환경: ${compactText(persona?.habitat, 160)}` : "",
          compactText(persona?.threatLevel, 80) ? `- 위협 등급: ${compactText(persona?.threatLevel, 80)}` : "",
          compactText(persona?.specialAbilities, 320) ? `- 특수 능력: ${compactText(persona?.specialAbilities, 320)}` : "",
        ]
      : [];

  const policyLines = [
    compactText(policy?.targetLanguage, 40) ? `- 학습 대상 언어: ${compactText(policy?.targetLanguage, 40)}` : "",
    compactText(policy?.topic, 120) ? `- 학습 주제: ${compactText(policy?.topic, 120)}` : "",
    compactText(policy?.learningGoal, 240) ? `- 학습 목표: ${compactText(policy?.learningGoal, 240)}` : "",
    compactText(policy?.operationMode, 40) ? `- Tutors 모드: ${compactText(policy?.operationMode, 40)}` : "",
    compactText(policy?.answerStyle, 40) ? `- 답변 스타일: ${compactText(policy?.answerStyle, 40)}` : "",
    typeof policy?.correctionStrength === "number" ? `- 교정 강도: ${String(policy.correctionStrength)}` : "",
    typeof policy?.strict === "boolean" ? `- 엄격 모드: ${policy.strict ? "true" : "false"}` : "",
  ];

  const profileLines = [
    `- 페르소나 타입: ${personaType === "monster" ? "monster" : "human"}`,
    ...commonLines,
    ...humanLines,
    ...monsterLines,
    ...policyLines,
    compactText(extraBrief, 500) ? `- 추가 이미지 디렉션: ${compactText(extraBrief, 500)}` : "",
  ].filter(Boolean);

  if (profileLines.length === 0) return "";

  return [
    "아래 프로필 설정은 이번 이미지 생성에서 반드시 반영해야 하는 고정 조건입니다.",
    "설정과 충돌하는 임의의 해석, 종족 변경, 성별 변경, 분위기 변경, 직업/역할 변경은 금지합니다.",
    "참고 이미지가 있으면 참고 이미지의 정체성, 비율, 포즈, 구도, 얼굴 또는 해부학적 특징을 유지하면서 아래 설정을 반영하세요.",
    "[필수 프로필 설정]",
    ...profileLines,
  ].join("\n");
}
