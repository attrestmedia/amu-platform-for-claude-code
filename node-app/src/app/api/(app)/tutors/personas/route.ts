import { NextRequest, NextResponse } from "next/server";
import { CONTENT_STUDIO_NAMESPACE_KEY } from "consts/app";
import { resolvePersonaBinaryGenderValue } from "consts/ai";
import {
  TUTOR_PERSONA_CONTENT_ADMIN_TEMPLATE_KEYS,
  normalizeTutorConversationLevel,
  normalizeTutorGoalType,
} from "consts/tutors";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizePersonaVoiceProfileForGender } from "libs/server-utils/audio";
import { getModel } from "libs/database/modelCache";
import { PersonaSchema } from "models/universe";
import type { IPersonaDocument } from "models/universe";
import { normalizeProfiles, normalizeSprite, safePolicyObj } from "libs/server-utils/api/apiSafetyHelper";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { DEFAULT_FANTASY_UNIVERSE, DEFAULT_WORLD_UNIVERSE } from "consts/app";
import { logger } from "utils/log";
import { getTutorsCollectionName, getUserKey, TUTORS_SHARED_TEMPLATE_COLLECTION } from "libs/services/tutors/tutorsCollectionKey";
import {
  acceptTutorGiftGrant,
  createTutorGiftGrant,
  listGiftedTutorPersonasForRecipient,
  listTutorGiftGrantsForRecipient,
  rejectTutorGiftGrant,
  resolveTutorPersonaReadAccess,
  toTutorAccessMeta,
  toTutorGiftGrantClient,
} from "libs/services/tutors/tutorGiftGrants";
import { linkPersonaImageLibraryAssetsToProfile } from "libs/database/personaImageLibraryRepo";
import { findEntityNameConflict, releasePersonaName, reservePersonaName, resolveUniqueEntityName } from "libs/server-utils/persona/entityNameUniqueness";
import { reserveExistingPid, generateGlobalPid } from "libs/server-utils/persona/pidRegistry";
import { generateAndBillContent, resolveTextProvider } from "libs/server-utils/api/contentPipeline";
import { getContentPromptByKeyInternal } from "libs/database/lab";
import {
  resolveClientProfileImageUrl,
  resolveStaleProfileImageUrls,
} from "libs/server-utils/lab/staleProfileImageUrlRepair";
import { resolveTutorProfileReferenceBaseImagesFromUrl } from "libs/server-utils/tutors/tutorProfileReferenceImage";
import { getPersonaByKey, getSelectablePersonaByKey } from "libs/database/universe";
import {
  consumeTutorCreationPermit,
  releaseTutorCreationPermit,
  reserveTutorCreationPermit,
} from "libs/database/tutors";
import { renderContentPrompt } from "utils/lab";
import {
  escapeMongoRegex,
  getPersonaActorId,
  getPersonaAuthorProfile,
  normalizePersonaEditPolicy,
  normalizePersonaForkPolicy,
  normalizePersonaStatus,
  normalizePersonaVisibility,
} from "libs/server-utils/persona/personaPolicy";
import {
  mergeAllowedTutorsPolicy,
  mergeAllowedTutorsUi,
  resolveTutorEditRequirement,
} from "utils/app/tutorsEditPolicy";
import { TUTOR_PROFILE_ARTIFACT_DRAFT_PERSONA_ID_FIELD } from "utils/app/tutorProfileImage";
import { isUnknownRecord, toUnknownRecord, type UnknownRecord } from "utils/common";
import type { BaseImageType } from "types/app";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { normalizeSystemPersonaTutorsPolicyDefaults } from "types/ai";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth/userRoles";
import { buildTutorServicePolicy } from "libs/server-utils/tutors/tutorGenesisAdapter";

type PersonaSeedLike = UnknownRecord;
type PersonaDocLike = Partial<IPersonaDocument> & UnknownRecord;
type PersonaClientView = UnknownRecord;

/**
 * @docHint
 * @purpose API 라우트((app) / tutors / personas) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain tutors
 * @scope server_route
 */

export const runtime = "nodejs";
const TUTORS_PERSONA_ATTACHMENT_INSTRUCTION = {
  withImage:
    "첨부 이미지를 기반으로 페르소나의 모습과 분위기, 특징을 자세히 분석하고, 아래의 설정 조건을 참고하여 제시된 스키마에 맞는 매력적인 스토리텔링과 페르소나 설정을 생성합니다.",
  textOnly:
    "텍스트 설명을 정확하게 반영하고, 아래의 설정 조건을 참고하여 제시된 스키마에 맞는 매력적인 스토리텔링과 페르소나 설정을 생성합니다.",
} as const;

function safeShortText(value: unknown, limit: number) {
  return String(value || "")
    .trim()
    .slice(0, limit);
}

function normalizeCreationRequestId(value: unknown) {
  const requestId = safeShortText(value, 128);
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(requestId) ? requestId : "";
}

async function reserveCreationPermitOrResponse(body: UnknownRecord, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) {
    return { response: NextResponse.json({ success: false, error: "unauthorized_actor" }, { status: 401 }) };
  }
  const requestId = normalizeCreationRequestId(body.requestId);
  if (!requestId) {
    return {
      response: NextResponse.json(
        { success: false, error: "신규 튜터 생성에는 requestId가 필요합니다.", errorCode: "TUTORS_CREATION_REQUEST_REQUIRED" },
        { status: 400 },
      ),
    };
  }
  const isAdmin = getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
  try {
    return { permit: await reserveTutorCreationPermit({ actorId, requestId, isAdmin }) };
  } catch (error) {
    if (error instanceof Error && (error.message === "TUTORS_DAILY_CREATION_LIMIT" || (error as { code?: string }).code === "TUTORS_DAILY_CREATION_LIMIT")) {
      return {
        response: NextResponse.json(
          {
            success: false,
            error: "다음 튜터를 만들려면 유효 학습 세션을 더 완료해야 합니다.",
            errorCode: "TUTORS_DAILY_CREATION_LIMIT",
          },
          { status: 429 },
        ),
      };
    }
    throw error;
  }
}

function extractFirstJsonObject(raw: unknown) {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced.trim());
    } catch {}
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function hasPersonaSeedProfileImage(seed: PersonaSeedLike) {
  const profiles = seed?.profiles;
  if (!isUnknownRecord(profiles)) return false;

  return Object.values(profiles).some(
    (images) => Array.isArray(images) && images.some((image) => Boolean(safeShortText(image, 2000))),
  );
}

function normalizeTutorsPersonaDraftBaseImages(value: unknown): BaseImageType[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((image) => {
      const item = toUnknownRecord(image);
      const mimeType = safeShortText(item.mimeType, 80) || "image/png";
      const data = safeShortText(item.data, 12_000_000);
      if (!data) return null;
      return { mimeType, data };
    })
    .filter((image): image is BaseImageType => Boolean(image));
}

function getFirstPersonaSeedProfileImage(seed: PersonaSeedLike) {
  const profiles = seed?.profiles;
  if (!isUnknownRecord(profiles)) return "";

  for (const images of Object.values(profiles)) {
    if (!Array.isArray(images)) continue;
    const found = images.find((image) => Boolean(safeShortText(image, 2000)));
    if (found) return safeShortText(found, 2000);
  }

  return "";
}

function getActorUid(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function canManageSharedTemplate(user: AuthenticatedUserType, template: PersonaDocLike | null | undefined) {
  const actorId = getPersonaActorId(user);
  const isAdmin = getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
  return isAdmin || (!!actorId && String(template?.ownerId || "") === actorId);
}

async function linkTutorProfileArtifactsAfterSave(args: {
  user: AuthenticatedUserType;
  data: PersonaDocLike;
  pid: string;
  profileImageUrl: string;
}) {
  const uid = getActorUid(args.user);
  const personaId = safeShortText(args.pid, 160);
  const profileImageUrl = safeShortText(args.profileImageUrl, 2000);
  if (!uid || !personaId || !profileImageUrl) return;

  const fromPersonaId = safeShortText(
    (args.data as UnknownRecord)?.[TUTOR_PROFILE_ARTIFACT_DRAFT_PERSONA_ID_FIELD],
    160,
  );
  await linkPersonaImageLibraryAssetsToProfile({
    uid,
    personaId,
    fromPersonaId,
    linkedProfileImageUrl: profileImageUrl,
    referenceKind: "profile_reference_sketch",
  });
}

function buildTutorsPersonaAttachmentInstruction(args: { seed: PersonaSeedLike; baseImages: BaseImageType[] }) {
  return args.baseImages.length > 0 || hasPersonaSeedProfileImage(args.seed)
    ? TUTORS_PERSONA_ATTACHMENT_INSTRUCTION.withImage
    : TUTORS_PERSONA_ATTACHMENT_INSTRUCTION.textOnly;
}

function resolveTutorPersonaContentTemplateKey(personaType: "human" | "monster") {
  return personaType === "monster"
    ? TUTOR_PERSONA_CONTENT_ADMIN_TEMPLATE_KEYS.monster
    : TUTOR_PERSONA_CONTENT_ADMIN_TEMPLATE_KEYS.human;
}

function resolveOutputLanguage(value: unknown): "ko" | "en" {
  return String(value || "")
    .trim()
    .toLowerCase() === "en"
    ? "en"
    : "ko";
}

function buildDefaultTutorTargetLanguage(_outputLanguage: "ko" | "en") {
  return "English";
}

function buildDefaultTutorTopic(outputLanguage: "ko" | "en") {
  return outputLanguage === "en" ? "Personal conversation goal" : "개인 대화 목표";
}

function buildDefaultLearningGoal(outputLanguage: "ko" | "en") {
  return outputLanguage === "en"
    ? "I want clear guidance, natural conversation, and feedback I can apply right away."
    : "자연스럽게 대화하면서 명확한 안내와 바로 적용할 수 있는 피드백을 받고 싶어요.";
}

function buildDefaultTutorName(outputLanguage: "ko" | "en") {
  return outputLanguage === "en" ? "Conversation Coach" : "대화 코치";
}

function buildDefaultTutorJob(outputLanguage: "ko" | "en") {
  return outputLanguage === "en" ? "conversation coach" : "대화 코치";
}

function normalizeOperationModeValue(value: unknown, fallback: "tutor" | "coach" | "proofread" | "chat") {
  const next = String(value || "")
    .trim()
    .toLowerCase();
  if (next === "coach" || next === "proofread" || next === "chat") return next;
  return fallback;
}

function normalizeAnswerStyleValue(value: unknown, fallback: "short" | "balanced" | "detailed") {
  const next = String(value || "")
    .trim()
    .toLowerCase();
  if (next === "short" || next === "detailed") return next;
  return fallback === "short" || fallback === "detailed" ? fallback : "balanced";
}

function normalizeCorrectionStrengthValue(value: unknown, fallback: number) {
  const next = Number(value);
  if (Number.isFinite(next)) return Math.max(0, Math.min(3, next));
  return Math.max(0, Math.min(3, fallback));
}

function normalizeStrictValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function buildDefaultTutorSummary(
  topic: string,
  learningGoal: string,
  outputLanguage: "ko" | "en",
) {
  return outputLanguage === "en"
    ? `A persona focused on ${topic}. Main goal: ${learningGoal}`
    : `${topic} 중심의 페르소나입니다. 주요 목표는 ${learningGoal}`;
}

function buildDefaultTutorBackground(topic: string, learningGoal: string, outputLanguage: "ko" | "en") {
  return outputLanguage === "en"
    ? `This persona helps the user explore ${topic} consistently and stay focused on ${learningGoal}.`
    : `이 페르소나는 ${topic}를 꾸준히 탐색하도록 돕고, ${learningGoal}에 집중할 수 있게 설계되었습니다.`;
}

function buildDefaultTutorPersonality(outputLanguage: "ko" | "en") {
  return outputLanguage === "en"
    ? "Calm, structured, encouraging, and focused on short actionable feedback."
    : "차분하고 구조적이며, 짧고 실행 가능한 피드백을 우선하는 성격입니다.";
}

function buildDefaultTutorSpeechStyle(outputLanguage: "ko" | "en") {
  return outputLanguage === "en"
    ? "Use a warm, clear tutor tone. Keep sentences concise and consistent. Do not mix casual and formal registers."
    : "친절하고 명확한 튜터 말투를 사용합니다. 문장은 간결하게 유지하고, 존댓말과 반말을 섞지 않습니다.";
}

function buildDefaultTutorIntro(name: string, topic: string, outputLanguage: "ko" | "en") {
  return outputLanguage === "en"
    ? `I'm ${name}. We'll explore ${topic} at a comfortable depth with clear feedback when needed.`
    : `저는 ${name}입니다. ${topic}를 편안한 깊이로 함께 탐색하고, 필요할 때 명확하게 피드백해드릴게요.`;
}

function buildDefaultTutorValues(outputLanguage: "ko" | "en") {
  return outputLanguage === "en"
    ? "Consistency, clarity, small wins, and practical communication."
    : "꾸준함, 명확함, 작은 성공 경험, 실전형 의사소통을 중요하게 생각합니다.";
}

function buildDefaultTutorPreferences(topic: string, outputLanguage: "ko" | "en") {
  return outputLanguage === "en"
    ? `${topic}, step-by-step feedback, short practice, self-check questions`
    : `${topic}, 단계별 피드백, 짧은 연습, 자기점검 질문`;
}

function buildTutorsPersonaDraftSeedContext(args: {
  systemPersonaKey: string;
  systemPersonaPrompt: string;
  brief: string;
  outputLanguage: "ko" | "en";
  personaType: "human" | "monster";
  fallbackTargetLanguage: string;
  defaultTopic: string;
  defaultLearningGoal: string;
  seed: PersonaSeedLike;
  baseImages: BaseImageType[];
}) {
  const seedPolicy: UnknownRecord = isUnknownRecord(args.seed?.tutorsPolicy) ? args.seed.tutorsPolicy : {};
  const profileImageUrl = getFirstPersonaSeedProfileImage(args.seed);
  const lines = [
    `- personaType: ${args.personaType}`,
    `- outputLanguage: ${args.outputLanguage === "en" ? "English" : "Korean"}`,
    args.baseImages.length > 0 ? `- referenceImageAttached: true (${args.baseImages.length})` : "",
    profileImageUrl ? `- reference profile image URL: ${profileImageUrl}` : "",
    args.seed?.name ? `- name: ${safeShortText(args.seed.name, 80)}` : "",
    args.seed?.age ? `- age: ${safeShortText(args.seed.age, 32)}` : "",
    args.seed?.gender ? `- gender: ${resolvePersonaBinaryGenderValue(args.seed.gender) || safeShortText(args.seed.gender, 32)}` : "",
    args.seed?.nationality ? `- nationality: ${safeShortText(args.seed.nationality, 80)}` : "",
    args.seed?.language ? `- language: ${safeShortText(args.seed.language, 80)}` : "",
    args.personaType === "human" && args.seed?.job ? `- job: ${safeShortText(args.seed.job, 120)}` : "",
    args.seed?.appearance ? `- appearance: ${safeShortText(args.seed.appearance, 300)}` : "",
    args.seed?.background ? `- background: ${safeShortText(args.seed.background, 400)}` : "",
    args.seed?.personality ? `- personality: ${safeShortText(args.seed.personality, 300)}` : "",
    args.seed?.speechStyle ? `- speechStyle: ${safeShortText(args.seed.speechStyle, 500)}` : "",
    args.seed?.values ? `- values: ${safeShortText(args.seed.values, 240)}` : "",
    args.seed?.preferences ? `- preferences: ${safeShortText(args.seed.preferences, 240)}` : "",
    args.seed?.summary ? `- summary: ${safeShortText(args.seed.summary, 300)}` : "",
    args.seed?.tutorIntro ? `- tutorIntro: ${safeShortText(args.seed.tutorIntro, 240)}` : "",
    args.personaType === "monster" && args.seed?.species ? `- species: ${safeShortText(args.seed.species, 120)}` : "",
    args.personaType === "monster" && args.seed?.habitat ? `- habitat: ${safeShortText(args.seed.habitat, 160)}` : "",
    args.personaType === "monster" && args.seed?.threatLevel
      ? `- threatLevel: ${safeShortText(args.seed.threatLevel, 40)}`
      : "",
    args.personaType === "monster" && args.seed?.specialAbilities
      ? `- specialAbilities: ${safeShortText(args.seed.specialAbilities, 300)}`
      : "",
    args.personaType === "monster" && args.seed?.artifact
      ? `- artifact: ${safeShortText(args.seed.artifact, 160)}`
      : "",
    `- fallback targetLanguage: ${args.fallbackTargetLanguage}`,
    `- fallback topic: ${safeShortText(seedPolicy?.topic, 80) || args.defaultTopic}`,
    `- fallback learningGoal: ${safeShortText(seedPolicy?.learningGoal, 120) || args.defaultLearningGoal}`,
    `- conversationLevel: ${normalizeTutorConversationLevel(seedPolicy?.conversationLevel)}`,
    `- goalType: ${normalizeTutorGoalType(seedPolicy?.goalType)}`,
    safeShortText(seedPolicy?.operationMode, 32) ? `- operationMode: ${safeShortText(seedPolicy?.operationMode, 32)}` : "",
    safeShortText(seedPolicy?.answerStyle, 32) ? `- answerStyle: ${safeShortText(seedPolicy?.answerStyle, 32)}` : "",
    typeof seedPolicy?.correctionStrength === "number"
      ? `- correctionStrength: ${String(seedPolicy.correctionStrength)}`
      : "",
    typeof seedPolicy?.strict === "boolean" ? `- strict: ${seedPolicy.strict ? "true" : "false"}` : "",
  ].filter(Boolean);

  return [
    `반드시 JSON만 반환하고, '${args.personaType}' personaType에 대응하는 템플릿 스키마와 gender, speechStyle 필드 외의 필드는 추가하지 마세요.`,
    "gender 필드는 반드시 남성 또는 여성 중 하나의 문자열만 사용하세요. 다른 성별 표현, 설명 문장, 빈 문자열은 사용하지 마세요.",
    args.baseImages.length > 0 &&
      "이미지 속 피사체의 종족/타입, 얼굴, 체형, 의상, 소품, 분위기와 충돌하는 이름·직업·배경·외형을 만들지 마세요.",
    args.personaType === "monster" &&
      "직업 또는 외모를 평범한 인간의 형태로 보정하지 말고, 이미지에서 보이는 '크리처'로서의 특징을 species, habitat, specialAbilities, appearance에 반영하세요.",
    args.personaType === "human" && "이미지에서 보이는 인물의 나이대, 직업/역할, 복장, 표정을 우선 근거로 삼으세요.",
    "speechStyle은 반드시 포함하세요. 페르소나의 텍스트 응답 말투이며, 성격, 이미지 분위기, personaType, 기본 시스템 페르소나와 충돌하지 않게 존댓말/반말/호칭/문장 길이/금지 표현을 구체적으로 작성하세요.",
    "아래 현재 입력값과 설정 조건을 참고해 템플릿의 JSON 스키마를 정확히 유지하세요.",
    "[현재 입력값]",
    ...lines,
    args.brief ? `[추가 요청]\n${args.brief}` : "",
    args.systemPersonaPrompt ? `[기본 시스템 페르소나] key=${args.systemPersonaKey}\n${args.systemPersonaPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function resolveTutorsPersonaTemplate(args: { personaType: "human" | "monster" }) {
  const templateKey = resolveTutorPersonaContentTemplateKey(args.personaType);
  const doc = await getContentPromptByKeyInternal(templateKey);
  const templateText = safeShortText(doc?.templateText, 50000);
  const accessLevel = safeShortText((doc as { accessLevel?: unknown } | null | undefined)?.accessLevel, 40);

  if (!templateText || accessLevel !== "admin") {
    const error = new Error("tutor_persona_template_not_found") as Error & {
      status: number;
      errorCode: string;
      templateKey: string;
    };
    error.status = 500;
    error.errorCode = "TUTOR_PERSONA_TEMPLATE_NOT_REGISTERED";
    error.templateKey = templateKey;
    throw error;
  }

  return {
    templateKey,
    templateText,
  };
}

async function resolveTutorsPersonaDraftPrompt(args: {
  systemPersonaKey: string;
  systemPersonaPrompt: string;
  brief: string;
  outputLanguage: "ko" | "en";
  personaType: "human" | "monster";
  fallbackTargetLanguage: string;
  defaultTopic: string;
  defaultLearningGoal: string;
  seed: PersonaSeedLike;
  baseImages: BaseImageType[];
}) {
  const attachmentInstruction = buildTutorsPersonaAttachmentInstruction({
    seed: args.seed,
    baseImages: args.baseImages,
  });
  const { templateText, templateKey } = await resolveTutorsPersonaTemplate({ personaType: args.personaType });
  const renderedPrompt = renderContentPrompt(undefined, templateText, {
    params: {
      output_language: args.outputLanguage === "en" ? "English" : "Korean",
    },
  });
  const seedContext = buildTutorsPersonaDraftSeedContext(args);

  return {
    templateKey,
    prompt: [attachmentInstruction, renderedPrompt, seedContext].filter(Boolean).join("\n\n"),
  };
}

async function generatePersonaDraftFromSystemPersonas(body: UnknownRecord, user: AuthenticatedUserType) {
  try {
    const seed: PersonaSeedLike = isUnknownRecord(body?.seed) ? body.seed : {};
    let baseImages = normalizeTutorsPersonaDraftBaseImages(body?.baseImages);
    // 클라이언트가 base64로 변환하지 못한 경우(private Gen Studio 이미지 등) 서버가 seed의 대표 이미지에서 직접 해석한다.
    if (baseImages.length === 0) {
      baseImages = await resolveTutorProfileReferenceBaseImagesFromUrl(getFirstPersonaSeedProfileImage(seed), user);
    }
    const systemPersonaKey = safeShortText(body?.systemPersonaKey || seed?.systemPersonaKey, 120).toLowerCase();
    const systemPersonaDoc = systemPersonaKey ? await getSelectablePersonaByKey(systemPersonaKey, "tutors") : null;
    if (systemPersonaKey && !systemPersonaDoc) {
      return NextResponse.json({ success: false, error: "system_persona_not_selectable" }, { status: 422 });
    }
    const systemPersonaRecord = toUnknownRecord(systemPersonaDoc);
    const systemPersonaPrompt = systemPersonaKey ? safeShortText(systemPersonaRecord.prompt, 8000) : "";
    const brief = safeShortText(body?.brief, 1000);
    const outputLanguage = resolveOutputLanguage(body?.outputLanguage);
    const personaType = safeShortText(seed?.personaType, 20) === "monster" ? "monster" : "human";
    const modelName = safeShortText(body?.modelName, 120);
    const seedPolicy: UnknownRecord = {
      ...normalizeSystemPersonaTutorsPolicyDefaults(systemPersonaRecord.tutorsPolicyDefaults),
      ...(isUnknownRecord(seed?.tutorsPolicy) ? seed.tutorsPolicy : {}),
    };
    const defaultTargetLanguage = buildDefaultTutorTargetLanguage(outputLanguage);
    const defaultTopic = buildDefaultTutorTopic(outputLanguage);
    const defaultLearningGoal = buildDefaultLearningGoal(outputLanguage);
    const fallbackTargetLanguage = safeShortText(seedPolicy?.targetLanguage, 24) || defaultTargetLanguage;

    const { prompt, templateKey } = await resolveTutorsPersonaDraftPrompt({
      systemPersonaKey,
      systemPersonaPrompt,
      brief,
      outputLanguage,
      personaType,
      fallbackTargetLanguage,
      defaultTopic: safeShortText(seedPolicy?.topic, 80) || defaultTopic,
      defaultLearningGoal: safeShortText(seedPolicy?.learningGoal, 120) || defaultLearningGoal,
      seed,
      baseImages,
    });

    const result = await generateAndBillContent({
      scope: "user",
      uid: String(user?.uid || user?.ID || "").trim(),
      provider: resolveTextProvider({ bodyProvider: undefined, modelName }),
      modelName,
      actorUser: user,
      prompt,
      n: 1,
      baseImages,
      metaRoute: "app/tutors/personas/generate",
      appBillingKey: CONTENT_STUDIO_NAMESPACE_KEY,
      metaExtra: {
        templateKey,
        generationMode: systemPersonaPrompt ? "single-system-persona" : "seed-only",
        systemPersonaKey,
        referenceImageCount: baseImages.length,
      },
    });

    if (!result?.ok) {
      return NextResponse.json({ success: false, error: "persona_auto_generate_failed" }, { status: 500 });
    }

    const raw = String(result?.data?.contents?.[0] || "").trim();
    const parsed = (extractFirstJsonObject(raw) || {}) as Record<string, unknown>;
    const resolvedTargetLanguage =
      safeShortText(parsed.targetLanguage || seedPolicy?.targetLanguage, 24) || defaultTargetLanguage;
    const resolvedTopic = safeShortText(parsed.topic || seedPolicy?.topic, 80) || defaultTopic;
    const resolvedLearningGoal =
      safeShortText(parsed.learningGoal || seedPolicy?.learningGoal, 120) || defaultLearningGoal;
    const resolvedConversationLevel = normalizeTutorConversationLevel(parsed.conversationLevel || seedPolicy?.conversationLevel);
    const resolvedGoalType = normalizeTutorGoalType(parsed.goalType || seedPolicy?.goalType);
    const resolvedOperationMode = normalizeOperationModeValue(
      parsed.operationMode,
      normalizeOperationModeValue(seedPolicy?.operationMode, "tutor"),
    );
    const resolvedAnswerStyle = normalizeAnswerStyleValue(
      parsed.answerStyle,
      normalizeAnswerStyleValue(seedPolicy?.answerStyle, "balanced"),
    );
    const resolvedCorrectionStrength = normalizeCorrectionStrengthValue(
      parsed.correctionStrength,
      Number(seedPolicy?.correctionStrength ?? 2),
    );
    const resolvedStrict = normalizeStrictValue(parsed.strict, Boolean(seedPolicy?.strict));
    const fallbackName = buildDefaultTutorName(outputLanguage);
    const fallbackJob = buildDefaultTutorJob(outputLanguage);
    const resolvedNameRaw = safeShortText(parsed.name || seed?.name, 80) || fallbackName;
    // AI가 생성한 이름도 사용자 본인의 튜터/캐릭터와 중복되지 않도록 보장한다.
    const resolvedName = await resolveUniqueEntityName({
      userKey: getUserKey(user),
      name: resolvedNameRaw,
      ...(seed?.pid ? { excludeEntityId: safeShortText(seed.pid, 120) } : {}),
    });
    const resolvedGender = resolvePersonaBinaryGenderValue(parsed.gender, resolvePersonaBinaryGenderValue(seed?.gender));

    const generatedBase = {
      pid: safeShortText(seed?.pid, 120),
      personaType,
      name: resolvedName,
      age: safeShortText(parsed.age || seed?.age, 32),
      summary:
        safeShortText(parsed.summary || parsed.systemPersonaSummary || seed?.summary, 300) ||
        safeShortText(buildDefaultTutorSummary(resolvedTopic, resolvedLearningGoal, outputLanguage), 300),
      appearance: safeShortText(parsed.appearance || seed?.appearance, 300),
      background:
        safeShortText(parsed.background || seed?.background, 600) ||
        safeShortText(buildDefaultTutorBackground(resolvedTopic, resolvedLearningGoal, outputLanguage), 600),
      personality:
        safeShortText(parsed.personality || seed?.personality, 300) ||
        safeShortText(buildDefaultTutorPersonality(outputLanguage), 300),
      speechStyle:
        safeShortText(parsed.speechStyle || seed?.speechStyle, 500) ||
        safeShortText(buildDefaultTutorSpeechStyle(outputLanguage), 500),
      tutorIntro:
        safeShortText(parsed.tutorIntro || seed?.tutorIntro, 240) ||
        safeShortText(buildDefaultTutorIntro(resolvedName, resolvedTopic, outputLanguage), 240),
      systemPersonaKey: systemPersonaKey || safeShortText(seed?.systemPersonaKey, 64).toLowerCase(),
      ...(systemPersonaKey && Number.isInteger(Number(systemPersonaRecord.revision))
        ? { systemPersonaRevision: Number(systemPersonaRecord.revision) }
        : {}),
      tutorsPolicy: safePolicyObj(
        {
          ...(seed?.tutorsPolicy && typeof seed.tutorsPolicy === "object" ? seed.tutorsPolicy : {}),
          targetLanguage: resolvedTargetLanguage,
          topic: resolvedTopic,
          learningGoal: resolvedLearningGoal,
          conversationLevel: resolvedConversationLevel,
          goalType: resolvedGoalType,
          operationMode: resolvedOperationMode,
          answerStyle: resolvedAnswerStyle,
          correctionStrength: resolvedCorrectionStrength,
          strict: resolvedStrict,
          ...(systemPersonaKey
            ? {
                systemPersonaMode: "preset",
                systemPersonaKey,
                systemPersonaComposeMode: "single-select",
              }
            : {}),
        },
        20000,
      ),
    };

    const generated =
      personaType === "monster"
        ? {
            ...generatedBase,
            gender: resolvedGender,
            nationality: safeShortText(parsed.nationality || seed?.nationality, 80),
            language: safeShortText(parsed.language || seed?.language, 80),
            species: safeShortText(parsed.species || seed?.species, 120),
            habitat: safeShortText(parsed.habitat || seed?.habitat, 160),
            threatLevel: safeShortText(parsed.threatLevel || seed?.threatLevel, 40),
            specialAbilities: safeShortText(parsed.specialAbilities || seed?.specialAbilities, 300),
            values:
              safeShortText(parsed.values || seed?.values, 240) ||
              safeShortText(buildDefaultTutorValues(outputLanguage), 240),
            preferences:
              safeShortText(parsed.preferences || seed?.preferences, 240) ||
              safeShortText(buildDefaultTutorPreferences(resolvedTopic, outputLanguage), 240),
            artifact: safeShortText(parsed.artifact || seed?.artifact, 160),
          }
        : {
            ...generatedBase,
            gender: resolvedGender,
            nationality: safeShortText(parsed.nationality || seed?.nationality, 80),
            job: safeShortText(parsed.job || seed?.job, 120) || fallbackJob,
            language: safeShortText(parsed.language || seed?.language, 80) || resolvedTargetLanguage,
            values:
              safeShortText(parsed.values || seed?.values, 240) ||
              safeShortText(buildDefaultTutorValues(outputLanguage), 240),
            preferences:
              safeShortText(parsed.preferences || seed?.preferences, 240) ||
              safeShortText(buildDefaultTutorPreferences(resolvedTopic, outputLanguage), 240),
          };

    return NextResponse.json({
      success: true,
      data: generated,
      billing: {
        coins: Number(result?.data?.coins || 0),
      },
    });
  } catch (error) {
    const errInfo = toUnknownRecord(error);
    const message = safeShortText(errInfo.message, 160) || "persona_auto_generate_failed";
    const errorCode = safeShortText(errInfo.errorCode, 80);
    const templateKey = safeShortText(errInfo.templateKey, 120);
    const status = typeof errInfo.status === "number" ? errInfo.status : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
        ...(errorCode ? { errorCode } : {}),
        ...(templateKey ? { templateKey } : {}),
      },
      { status },
    );
  }
}

function resolveUniverseIdByType(personaType: string) {
  return personaType === "monster" ? DEFAULT_FANTASY_UNIVERSE : DEFAULT_WORLD_UNIVERSE;
}

function toClientPersona(doc: PersonaDocLike | null | undefined, access?: ReturnType<typeof toTutorAccessMeta>) {
  if (!doc) return null;
  const base: PersonaClientView = {
    _id: doc._id ? String(doc._id) : undefined,
    pid: doc.pid,
    personaType: doc.personaType,
    name: doc.name,
    age: doc.age,
    appearance: doc.appearance,
    background: doc.background,
    personality: doc.personality,
    speechStyle: doc.speechStyle,
    summary: doc.summary,
    universeId: doc.universeId,
    systemPersonaKey: doc.systemPersonaKey,
    systemPersonaRevision:
      typeof doc.systemPersonaRevision === "number" ? doc.systemPersonaRevision : undefined,
    profiles: normalizeProfiles(doc.profiles),
    sprite: normalizeSprite(doc.sprite),
    tutorIntro: doc.tutorIntro ?? "",
    tutorsPolicy: doc.tutorsPolicy ?? null,
    tutorsUi: doc.tutorsUi ?? null,
    tutorGoalBlueprint: doc.tutorGoalBlueprint ?? null,
    tutorBehaviorAxes: doc.tutorBehaviorAxes ?? null,
    narrativeGenesis: doc.narrativeGenesis ?? null,
    ownerId: doc.ownerId ?? "",
    instanceOwnerId: doc.instanceOwnerId ?? "",
    visibility: doc.visibility ?? "private",
    editPolicy: doc.editPolicy ?? "owner-only",
    forkPolicy: doc.forkPolicy ?? "fork-on-use",
    status: doc.status ?? "active",
    version: typeof doc.version === "number" ? doc.version : 1,
    isTemplate: !!doc.isTemplate,
    sourcePersonaId: doc.sourcePersonaId ?? "",
    sourceVersion: typeof doc.sourceVersion === "number" ? doc.sourceVersion : undefined,
    sourceOwnerId: doc.sourceOwnerId ?? "",
    derivedFromSystemPersonaKey: doc.derivedFromSystemPersonaKey ?? "",
    lastSyncedAt: doc.lastSyncedAt ?? "",
    authorProfile: doc.authorProfile ?? null,
    credits: doc.credits ?? null,
    voiceProfile: doc.voiceProfile ?? null,
    tutorsAccess: access || { kind: "owner", canEdit: true, canUse: true },
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };

  if (doc.personaType === "human") {
    base.gender = doc.gender;
    base.nationality = doc.nationality;
    base.job = doc.job;
    base.values = doc.values;
    base.preferences = doc.preferences;
    base.language = doc.language;
  } else if (doc.personaType === "monster") {
    base.gender = doc.gender;
    base.species = doc.species;
    base.habitat = doc.habitat;
    base.threatLevel = doc.threatLevel;
    base.specialAbilities = doc.specialAbilities;
    base.artifact = doc.artifact;
  }

  return base;
}

function buildTutorsPersonaPayload(
  data: PersonaDocLike | null | undefined,
  meta: Partial<IPersonaDocument>,
): Partial<IPersonaDocument> {
  const personaType = String(data?.personaType || "").trim() as "human" | "monster";
  const hasVoiceProfileField =
    data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "voiceProfile");
  const projectedTutorsPolicy = buildTutorServicePolicy(data, {
    systemPersonaKey: meta.systemPersonaKey,
    systemPersonaRevision: meta.systemPersonaRevision,
    isTemplate: meta.isTemplate,
    visibility: meta.visibility,
    sourcePersonaId: meta.sourcePersonaId,
    sourceVersion: meta.sourceVersion,
  });

  const payload: Partial<IPersonaDocument> = {
    pid: meta.pid || "",
    personaType: personaType as IPersonaDocument["personaType"],
    name: String(data?.name || "").trim(),
    age: data?.age ?? "",
    appearance: data?.appearance ?? "",
    background: data?.background ?? "",
    personality: data?.personality ?? "",
    speechStyle: typeof data?.speechStyle === "string" ? data.speechStyle.slice(0, 800) : "",
    summary: data?.summary ?? "",
    universeId: meta.universeId,
    systemPersonaKey: meta.systemPersonaKey,
    systemPersonaRevision: meta.systemPersonaRevision,
    profiles: normalizeProfiles(data?.profiles),
    sprite: normalizeSprite(data?.sprite),
    tutorIntro: typeof data?.tutorIntro === "string" ? data.tutorIntro.slice(0, 240) : "",
    tutorsPolicy: safePolicyObj(projectedTutorsPolicy, 20000) ?? undefined,
    tutorsUi: safePolicyObj(data?.tutorsUi, 20000) ?? undefined,
    ownerId: meta.ownerId,
    instanceOwnerId: meta.instanceOwnerId,
    visibility: meta.visibility,
    editPolicy: meta.editPolicy,
    forkPolicy: meta.forkPolicy,
    status: meta.status,
    version: meta.version,
    isTemplate: meta.isTemplate,
    sourcePersonaId: meta.sourcePersonaId,
    sourceVersion: meta.sourceVersion,
    sourceOwnerId: meta.sourceOwnerId,
    derivedFromSystemPersonaKey: meta.derivedFromSystemPersonaKey,
    lastSyncedAt: meta.lastSyncedAt,
    authorProfile: meta.authorProfile ?? null,
    credits: meta.credits,
    voiceProfile: hasVoiceProfileField
      ? normalizePersonaVoiceProfileForGender(data?.voiceProfile, data?.gender) || undefined
      : meta.voiceProfile || undefined,
  };

  if (personaType === "human") {
    payload.gender = resolvePersonaBinaryGenderValue(data?.gender);
    payload.nationality = data?.nationality ?? "";
    payload.job = data?.job ?? "";
    payload.language = data?.language;
    payload.values = data?.values ?? "";
    payload.preferences = data?.preferences ?? "";
  } else if (personaType === "monster") {
    payload.gender = resolvePersonaBinaryGenderValue(data?.gender);
    payload.species = data?.species ?? "";
    payload.habitat = data?.habitat ?? "";
    payload.threatLevel = data?.threatLevel ?? "";
    payload.specialAbilities = data?.specialAbilities ?? "";
    payload.artifact = data?.artifact ?? "";
  }

  return payload;
}

async function getTutorsPersonaModel(collectionName: string) {
  return await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
}

async function validateTutorsPersonaUpdate(args: {
  existing: PersonaDocLike | null | undefined;
  payload: Partial<IPersonaDocument>;
}) {
  const payload = {
    ...args.payload,
    tutorsPolicy: mergeAllowedTutorsPolicy(args.existing?.tutorsPolicy, args.payload.tutorsPolicy),
    tutorsUi: mergeAllowedTutorsUi(args.existing?.tutorsUi, args.payload.tutorsUi),
  };

  const requirement = resolveTutorEditRequirement(args.existing || {}, payload as Record<string, unknown>);
  if (requirement.immutableFields.length > 0) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          success: false,
          error: "생성 후 잠긴 튜터 정체성 필드는 수정할 수 없습니다.",
          errorCode: "TUTORS_PERSONA_FIELD_LOCKED",
          lockedFields: requirement.immutableFields,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, payload, requirement };
}

async function resolveClientPersonaProfiles(
  view: PersonaClientView | null | undefined,
  user: AuthenticatedUserType,
): Promise<PersonaClientView | null> {
  if (!view) return null;
  const repairedProfiles = await resolveStaleProfileImageUrls(view.profiles);
  view.profiles = repairedProfiles;
  const primaryProfileImageUrl = String(repairedProfiles.default?.[0] || "").trim();
  view.profileImageDisplayUrl = primaryProfileImageUrl
    ? await resolveClientProfileImageUrl(primaryProfileImageUrl, user)
    : "";
  return view;
}

async function toClientPersonaForClient(
  doc: PersonaDocLike | null | undefined,
  user: AuthenticatedUserType,
  access?: ReturnType<typeof toTutorAccessMeta>,
) {
  return await resolveClientPersonaProfiles(toClientPersona(doc, access), user);
}

async function listTemplateDocs(user: AuthenticatedUserType, request: NextRequest) {
  const actorId = getPersonaActorId(user);
  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") || "").trim();
  const mine = searchParams.get("mine") === "true";
  const limit = Math.min(Number(searchParams.get("limit") || 24), 100);

  const TemplateModel = await getTutorsPersonaModel(TUTORS_SHARED_TEMPLATE_COLLECTION);
  const query: Record<string, unknown> = {
    isTemplate: true,
    status: "active",
  };

  if (mine) {
    query.ownerId = actorId;
  } else {
    query.visibility = "public";
  }

  if (q) {
    const regex = new RegExp(escapeMongoRegex(q), "i");
    query.$or = [
      { name: regex },
      { summary: regex },
      { personality: regex },
      { speechStyle: regex },
      { tutorIntro: regex },
    ];
  }

  const docs = await TemplateModel.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(limit).lean();
  const data = await Promise.all((docs || []).map((doc) => toClientPersonaForClient(doc, user)));
  return NextResponse.json({ success: true, data });
}

async function publishPersonaTemplate(body: UnknownRecord, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) {
    return NextResponse.json({ success: false, error: "unauthorized_actor" }, { status: 401 });
  }

  const pid = String(body?.pid || "").trim();
  if (!pid) {
    return NextResponse.json({ success: false, error: "pid는 필수입니다." }, { status: 400 });
  }

  const visibility = normalizePersonaVisibility(body?.visibility, "public");
  const sourceCollection = getTutorsCollectionName(user);
  const SourceModel = await getTutorsPersonaModel(sourceCollection);
  const source = await SourceModel.findOne({ pid }).lean();

  if (!source) {
    return NextResponse.json({ success: false, error: "source_not_found" }, { status: 404 });
  }

  const TemplateModel = await getTutorsPersonaModel(TUTORS_SHARED_TEMPLATE_COLLECTION);
  const existingTemplate = await TemplateModel.findOne({
    ownerId: actorId,
    sourcePersonaId: source.sourcePersonaId || source.pid,
    isTemplate: true,
  }).lean();

  let templatePid = existingTemplate?.pid ? String(existingTemplate.pid) : "";

  try {
    if (!templatePid) {
      templatePid = await generateGlobalPid(
        resolveUniverseIdByType(source.personaType),
        TUTORS_SHARED_TEMPLATE_COLLECTION,
        source.name,
      );
    } else {
      await reserveExistingPid(
        templatePid,
        resolveUniverseIdByType(source.personaType),
        TUTORS_SHARED_TEMPLATE_COLLECTION,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message === "PID_CONFLICT") {
      return NextResponse.json({ success: false, error: "PID 충돌", errorCode: "PID_CONFLICT" }, { status: 409 });
    }
    logger.error("[tutors/personas] shared template PID 처리 오류:", err);
    return NextResponse.json({ success: false, error: "pid 처리 실패", errorCode: "PID_ERROR" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const payload = buildTutorsPersonaPayload(source, {
    pid: templatePid,
    universeId: source.universeId || resolveUniverseIdByType(source.personaType),
    systemPersonaKey: source.systemPersonaKey,
    ownerId: actorId,
    instanceOwnerId: "",
    visibility,
    editPolicy: normalizePersonaEditPolicy(source.editPolicy, "owner-only"),
    forkPolicy: normalizePersonaForkPolicy(source.forkPolicy, "fork-on-use"),
    status: "active",
    version: existingTemplate ? Number(existingTemplate.version || 1) + 1 : 1,
    isTemplate: true,
    sourcePersonaId: source.sourcePersonaId || source.pid,
    sourceVersion: Number(source.sourceVersion || source.version || 1),
    sourceOwnerId: source.sourceOwnerId || source.ownerId || source.instanceOwnerId || actorId,
    derivedFromSystemPersonaKey: source.derivedFromSystemPersonaKey || source.systemPersonaKey || "",
    lastSyncedAt: nowIso,
    authorProfile: getPersonaAuthorProfile(user, existingTemplate?.authorProfile),
    credits: {
      originalName: source.name,
      originalOwnerId: source.sourceOwnerId || source.ownerId || source.instanceOwnerId || actorId,
      originalPersonaId: source.sourcePersonaId || source.pid,
    },
  });

  let saved: PersonaDocLike | null = null;
  if (existingTemplate) {
    saved = (await TemplateModel.findOneAndUpdate(
      { pid: templatePid },
      { $set: payload },
      { new: true },
    ).lean()) as unknown as PersonaDocLike | null;
  } else {
    const created = await TemplateModel.create(payload as IPersonaDocument);
    saved = created.toObject() as unknown as PersonaDocLike;
  }

  return NextResponse.json({ success: true, data: await toClientPersonaForClient(saved, user) });
}

async function updatePersonaTemplate(body: UnknownRecord, user: AuthenticatedUserType) {
  const pid = String(body?.pid || "").trim();
  if (!pid) {
    return NextResponse.json({ success: false, error: "pid는 필수입니다." }, { status: 400 });
  }

  const TemplateModel = await getTutorsPersonaModel(TUTORS_SHARED_TEMPLATE_COLLECTION);
  const existingTemplate = (await TemplateModel.findOne({
    pid,
    isTemplate: true,
  }).lean()) as unknown as PersonaDocLike | null;

  if (!existingTemplate) {
    return NextResponse.json({ success: false, error: "template_not_found" }, { status: 404 });
  }
  if (!canManageSharedTemplate(user, existingTemplate)) {
    return NextResponse.json({ success: false, error: "forbidden_template" }, { status: 403 });
  }

  const data: PersonaDocLike = isUnknownRecord(body?.data) ? body.data : {};
  const personaType = existingTemplate.personaType;
  if (personaType !== "human" && personaType !== "monster") {
    return NextResponse.json({ success: false, error: "template_persona_type_invalid" }, { status: 400 });
  }

  const name = String(data?.name || existingTemplate.name || "").trim();
  if (!name) {
    return NextResponse.json({ success: false, error: "템플릿 이름은 필수입니다." }, { status: 400 });
  }

  const visibility = normalizePersonaVisibility(data?.visibility || body?.visibility, existingTemplate.visibility);
  const nowIso = new Date().toISOString();
  const source = {
    ...existingTemplate,
    ...data,
    pid: existingTemplate.pid,
    personaType,
    systemPersonaKey: existingTemplate.systemPersonaKey,
    name,
  };
  const payload = buildTutorsPersonaPayload(source, {
    pid: existingTemplate.pid,
    universeId: existingTemplate.universeId || resolveUniverseIdByType(personaType),
    systemPersonaKey: existingTemplate.systemPersonaKey,
    ownerId: existingTemplate.ownerId,
    instanceOwnerId: "",
    visibility,
    editPolicy: normalizePersonaEditPolicy(existingTemplate.editPolicy, "owner-only"),
    forkPolicy: normalizePersonaForkPolicy(existingTemplate.forkPolicy, "fork-on-use"),
    status: normalizePersonaStatus(existingTemplate.status, "active"),
    version: Number(existingTemplate.version || 1) + 1,
    isTemplate: true,
    sourcePersonaId: existingTemplate.sourcePersonaId || existingTemplate.pid,
    sourceVersion: Number(existingTemplate.sourceVersion || existingTemplate.version || 1),
    sourceOwnerId: existingTemplate.sourceOwnerId || existingTemplate.ownerId || "",
    derivedFromSystemPersonaKey: existingTemplate.derivedFromSystemPersonaKey || existingTemplate.systemPersonaKey || "",
    lastSyncedAt: nowIso,
    authorProfile: existingTemplate.authorProfile ?? getPersonaAuthorProfile(user),
    credits: existingTemplate.credits || null,
  });

  const saved = (await TemplateModel.findOneAndUpdate(
    { pid, isTemplate: true },
    { $set: payload },
    { new: true },
  ).lean()) as unknown as PersonaDocLike | null;

  return NextResponse.json({ success: true, data: await toClientPersonaForClient(saved, user) });
}

async function forkPersonaTemplate(body: UnknownRecord, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) {
    return NextResponse.json({ success: false, error: "unauthorized_actor" }, { status: 401 });
  }

  const pid = String(body?.pid || "").trim();
  if (!pid) {
    return NextResponse.json({ success: false, error: "pid는 필수입니다." }, { status: 400 });
  }

  const TemplateModel = await getTutorsPersonaModel(TUTORS_SHARED_TEMPLATE_COLLECTION);
  const template = await TemplateModel.findOne({ pid, isTemplate: true, status: "active" }).lean();

  if (!template) {
    return NextResponse.json({ success: false, error: "template_not_found" }, { status: 404 });
  }

  const canUseTemplate =
    template.ownerId === actorId || template.visibility === "public" || template.visibility === "unlisted";
  if (!canUseTemplate) {
    return NextResponse.json({ success: false, error: "forbidden_template" }, { status: 403 });
  }

  // fork 결과가 사용자 네임스페이스에 들어오는 시점부터 이름 중복 규칙을 적용한다.
  // 공유 템플릿 자체는 레지스트리에 없으며, 여기서 검사하는 것은 fork된 사용자 소유 Persona다.
  const forkNameConflict = await findEntityNameConflict({ userKey: getUserKey(user), name: String(template.name || "") });
  if (forkNameConflict.taken) {
    return NextResponse.json(
      {
        success: false,
        error: "이미 사용 중인 이름이에요. 다른 이름을 입력해 주세요.",
        errorCode: "TUTORS_PERSONA_NAME_TAKEN",
        conflictScope: forkNameConflict.scope,
      },
      { status: 409 },
    );
  }

  const permitResult = await reserveCreationPermitOrResponse(body, user);
  if (permitResult.response) return permitResult.response;
  const permitKey = String(permitResult.permit?.permitKey || "");

  const collectionName = getTutorsCollectionName(user);
  const PersonaModel = await getTutorsPersonaModel(collectionName);
  if (permitResult.permit?.state === "consumed") {
    const consumed = await PersonaModel.findOne({ pid: permitResult.permit.personaId }).lean();
    if (consumed) {
      return NextResponse.json({
        success: true,
        data: await toClientPersonaForClient(consumed as PersonaDocLike, user),
        reused: true,
      });
    }
    return NextResponse.json(
      { success: false, error: "생성 요청의 기존 결과를 찾을 수 없습니다.", errorCode: "TUTORS_CREATION_RESULT_MISSING" },
      { status: 409 },
    );
  }
  const recoveredFork = await PersonaModel.findOne({ creationPermitKey: permitKey }).lean();
  if (recoveredFork) {
    await consumeTutorCreationPermit(permitKey, recoveredFork.pid).catch(() => null);
    return NextResponse.json({
      success: true,
      data: await toClientPersonaForClient(recoveredFork as PersonaDocLike, user),
      reused: true,
    });
  }

  let nextPid = "";
  try {
    nextPid = await generateGlobalPid(resolveUniverseIdByType(template.personaType), collectionName, template.name);
  } catch (err) {
    await releaseTutorCreationPermit(permitKey).catch(() => null);
    if (err instanceof Error && err.message === "PID_CONFLICT") {
      return NextResponse.json({ success: false, error: "PID 충돌", errorCode: "PID_CONFLICT" }, { status: 409 });
    }
    logger.error("[tutors/personas] template fork PID 처리 오류:", err);
    return NextResponse.json({ success: false, error: "pid 처리 실패", errorCode: "PID_ERROR" }, { status: 500 });
  }

  // fork 결과 이름을 레지스트리에 최종 예약한다 (authoritative).
  const userKey = getUserKey(user);
  const nameReserve = await reservePersonaName({
    userKey,
    name: String(template.name || ""),
    personaId: nextPid,
    personaType: "tutor",
  });
  if (!nameReserve.ok) {
    await releaseTutorCreationPermit(permitKey).catch(() => null);
    return NextResponse.json(
      {
        success: false,
        error: "이미 사용 중인 이름이에요. 다른 이름을 입력해 주세요.",
        errorCode: "TUTORS_PERSONA_NAME_TAKEN",
        conflictScope: nameReserve.conflict.personaType || "tutors",
      },
      { status: 409 },
    );
  }

  const payload = buildTutorsPersonaPayload(template, {
    pid: nextPid,
    universeId: template.universeId || resolveUniverseIdByType(template.personaType),
    systemPersonaKey: template.systemPersonaKey,
    ownerId: actorId,
    instanceOwnerId: actorId,
    visibility: "private",
    editPolicy: "owner-only",
    forkPolicy: "fork-on-use",
    status: "active",
    version: 1,
    isTemplate: false,
    sourcePersonaId: template.pid,
    sourceVersion: Number(template.version || 1),
    sourceOwnerId: template.ownerId || "",
    derivedFromSystemPersonaKey: template.derivedFromSystemPersonaKey || template.systemPersonaKey || "",
    lastSyncedAt: "",
    authorProfile: template.authorProfile ?? null,
    credits: {
      originalName: template.name,
      originalOwnerId: template.ownerId || "",
      originalPersonaId: template.pid,
    },
  });
  payload.creationPermitKey = permitKey;
  payload.creationRequestId = String(permitResult.permit?.requestId || "");

  try {
    const saved = await PersonaModel.create(payload as IPersonaDocument);
    await consumeTutorCreationPermit(permitKey, saved.pid);
    return NextResponse.json({
      success: true,
      data: await toClientPersonaForClient(saved.toObject() as unknown as PersonaDocLike, user),
    });
  } catch (error) {
    await releaseTutorCreationPermit(permitKey).catch(() => null);
    await releasePersonaName({ userKey, personaId: nextPid }).catch(() => null);
    throw error;
  }
}

// GET: 내 tutors 페르소나 목록
async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("scope") === "templates") {
    return await listTemplateDocs(user, request);
  }

  const collectionName = getTutorsCollectionName(user);
  const Model = await getTutorsPersonaModel(collectionName);
  const docs = await Model.find({ isTemplate: { $ne: true }, status: { $ne: "blocked" } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  const gifted = await listGiftedTutorPersonasForRecipient(user, ["accepted", "pending"]);
  const pendingGrants = await listTutorGiftGrantsForRecipient(user, ["pending"]);

  const [ownResolved, giftedResolved] = await Promise.all([
    Promise.all(
      (docs || []).map((doc) =>
        toClientPersonaForClient(doc, user, { kind: "owner", canEdit: true, canUse: true }),
      ),
    ),
    Promise.all(
      gifted.map((entry) =>
        toClientPersonaForClient(
          entry.persona as unknown as PersonaDocLike,
          user,
          toTutorAccessMeta(entry.access),
        ),
      ),
    ),
  ]);

  return NextResponse.json({
    success: true,
    data: [...ownResolved, ...giftedResolved],
    gifts: pendingGrants.map(toTutorGiftGrantClient),
  });
}
export const GET = withAuth(handleGET, undefined, "tutors/personas:get");

// POST: tutors 페르소나 저장/업데이트 (universeId는 personaType에 따라 서버에서 자동 지정)
async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest) {
  const action = String(body?.action || "")
    .trim()
    .toLowerCase();
  if (action === "publish_template") {
    return await publishPersonaTemplate(body, user);
  }
  if (action === "update_template") {
    return await updatePersonaTemplate(body, user);
  }
  if (action === "fork_template") {
    return await forkPersonaTemplate(body, user);
  }
  if (action === "generate_ai_draft") {
    return await generatePersonaDraftFromSystemPersonas(body, user);
  }
  if (action === "gift_tutor") {
    return await createTutorGiftGrant(body, user);
  }
  if (action === "accept_gift") {
    return await acceptTutorGiftGrant(body, user);
  }
  if (action === "reject_gift") {
    return await rejectTutorGiftGrant(body, user);
  }

  const collectionName = getTutorsCollectionName(user);
  const actorId = getPersonaActorId(user);
  const Model = await getTutorsPersonaModel(collectionName);

  const data: PersonaDocLike = isUnknownRecord(body?.data) ? body.data : (body as PersonaDocLike);
  const personaType = String(data?.personaType || "").trim();
  const name = String(data?.name || "").trim();

  if (!personaType || !name) {
    return NextResponse.json({ success: false, error: "personaType, name은 필수입니다." }, { status: 400 });
  }
  if (personaType !== "human" && personaType !== "monster") {
    return NextResponse.json({ success: false, error: "personaType이 올바르지 않습니다." }, { status: 400 });
  }

  // tutors 정책: 타입에 따라 universeId 자동 지정 (서버 권위)
  const universeId = resolveUniverseIdByType(personaType);

  const systemPersonaKey =
    typeof data?.systemPersonaKey === "string" ? data.systemPersonaKey.trim().toLowerCase().slice(0, 64) : undefined;

  // pid 업데이트는 "내 컬렉션에 존재하는 pid"만 허용 (임의 pid 주입 방지)
  const inputPid = typeof data?.pid === "string" ? data.pid.trim() : "";
  const existing = inputPid ? await Model.findOne({ pid: inputPid }).lean() : null;
  const systemPersonaForPin = systemPersonaKey
    ? await (existing && existing.systemPersonaKey === systemPersonaKey
        ? getPersonaByKey(systemPersonaKey)
        : getSelectablePersonaByKey(systemPersonaKey, "tutors"))
    : null;
  if (systemPersonaKey && !systemPersonaForPin) {
    return NextResponse.json({ success: false, error: "system_persona_not_selectable" }, { status: 422 });
  }
  const systemPersonaRevision =
    typeof existing?.systemPersonaRevision === "number"
      ? existing.systemPersonaRevision
      : typeof data?.systemPersonaRevision === "number"
        ? data.systemPersonaRevision
        : typeof toUnknownRecord(systemPersonaForPin).revision === "number"
          ? Number(toUnknownRecord(systemPersonaForPin).revision)
          : undefined;
  if (inputPid && !existing) {
    const resolved = await resolveTutorPersonaReadAccess(user, inputPid);
    if (resolved.access?.kind === "gift") {
      return NextResponse.json(
        { success: false, error: "선물받은 튜터는 편집할 수 없습니다.", errorCode: "TUTORS_GIFT_READ_ONLY" },
        { status: 403 },
      );
    }
  }

  // 이름 중복 검증(사전): 사용자 네임스페이스에서 이미 사용 중인 이름인지 빠르게 확인한다.
  // 실제 저장 시 reservePersonaName이 DB unique(userKey, normalizedName)로 최종 보장한다.
  const nameConflict = await findEntityNameConflict({
    userKey: getUserKey(user),
    name,
    ...(existing ? { excludeEntityId: String(existing.pid || "") } : {}),
  });
  if (nameConflict.taken) {
    return NextResponse.json(
      {
        success: false,
        error: "이미 사용 중인 이름입니다.",
        errorCode: "TUTORS_PERSONA_NAME_TAKEN",
        conflictScope: nameConflict.scope,
      },
      { status: 409 },
    );
  }

  const permitResult = existing ? null : await reserveCreationPermitOrResponse(body, user);
  if (permitResult?.response) return permitResult.response;
  const creationPermitKey = String(permitResult?.permit?.permitKey || "");
  if (permitResult?.permit?.state === "consumed") {
    const consumed = await Model.findOne({ pid: permitResult.permit.personaId }).lean();
    if (consumed) {
      return NextResponse.json({
        success: true,
        data: await toClientPersonaForClient(consumed as PersonaDocLike, user),
        reused: true,
      });
    }
    return NextResponse.json(
      { success: false, error: "생성 요청의 기존 결과를 찾을 수 없습니다.", errorCode: "TUTORS_CREATION_RESULT_MISSING" },
      { status: 409 },
    );
  }
  if (creationPermitKey) {
    const recovered = await Model.findOne({ creationPermitKey }).lean();
    if (recovered) {
      await consumeTutorCreationPermit(creationPermitKey, recovered.pid).catch(() => null);
      return NextResponse.json({
        success: true,
        data: await toClientPersonaForClient(recovered as PersonaDocLike, user),
        reused: true,
      });
    }
  }
  let pid = existing ? inputPid : "";

  try {
    if (!pid) {
      pid = await generateGlobalPid(universeId, collectionName, name);
    } else {
      await reserveExistingPid(pid, universeId, collectionName);
    }
  } catch (err) {
    if (creationPermitKey) await releaseTutorCreationPermit(creationPermitKey).catch(() => null);
    if (err instanceof Error && err.message === "PID_CONFLICT") {
      return NextResponse.json({ success: false, error: "PID 충돌", errorCode: "PID_CONFLICT" }, { status: 409 });
    }
    logger.error("[tutors/personas] PID 처리 오류:", err);
    return NextResponse.json({ success: false, error: "pid 처리 실패", errorCode: "PID_ERROR" }, { status: 500 });
  }

  // 이름 레지스트리 최종 예약 (authoritative): DB unique(userKey, normalizedName)로 race까지 방지한다.
  const userKey = getUserKey(user);
  if (!existing) {
    const nameReserve = await reservePersonaName({
      userKey,
      name,
      personaId: pid,
      personaType: "tutor",
    });
    if (!nameReserve.ok) {
      if (creationPermitKey) await releaseTutorCreationPermit(creationPermitKey).catch(() => null);
      return NextResponse.json(
        {
          success: false,
          error: "이미 사용 중인 이름입니다.",
          errorCode: "TUTORS_PERSONA_NAME_TAKEN",
          conflictScope: nameReserve.conflict.personaType || "tutors",
        },
        { status: 409 },
      );
    }
  }

  let payload = buildTutorsPersonaPayload(data, {
    pid,
    universeId,
    systemPersonaKey: existing?.systemPersonaKey || systemPersonaKey,
    systemPersonaRevision,
    ownerId: existing?.ownerId || actorId,
    instanceOwnerId: existing?.instanceOwnerId || actorId,
    visibility: "private",
    editPolicy: normalizePersonaEditPolicy(existing?.editPolicy, "owner-only"),
    forkPolicy: normalizePersonaForkPolicy(existing?.forkPolicy, "fork-on-use"),
    status: normalizePersonaStatus(existing?.status, "active"),
    version: existing ? Number(existing.version || 1) + 1 : 1,
    isTemplate: false,
    sourcePersonaId: existing?.sourcePersonaId || "",
    sourceVersion: existing?.sourceVersion,
    sourceOwnerId: existing?.sourceOwnerId || "",
    derivedFromSystemPersonaKey: existing?.derivedFromSystemPersonaKey || systemPersonaKey || "",
    lastSyncedAt: existing?.lastSyncedAt || "",
    authorProfile: existing?.authorProfile ?? null,
    credits: existing?.credits || null,
  });
  if (!existing && creationPermitKey) {
    payload.creationPermitKey = creationPermitKey;
    payload.creationRequestId = String(permitResult?.permit?.requestId || "");
  }

  if (existing) {
    const editValidation = await validateTutorsPersonaUpdate({ existing, payload });
    if (!editValidation.ok) return editValidation.response;
    payload = editValidation.payload;
  }

  let saved: PersonaDocLike | null = null;
  if (existing) {
    saved = (await Model.findOneAndUpdate(
      { pid },
      { $set: payload },
      { new: true },
    ).lean()) as unknown as PersonaDocLike | null;
  } else {
    try {
      const created = await Model.create(payload as IPersonaDocument);
      saved = created.toObject() as unknown as PersonaDocLike;
      await consumeTutorCreationPermit(creationPermitKey, created.pid);
    } catch (error) {
      await releaseTutorCreationPermit(creationPermitKey).catch(() => null);
      await releasePersonaName({ userKey, personaId: pid }).catch(() => null);
      throw error;
    }
  }

  await linkTutorProfileArtifactsAfterSave({
    user,
    data,
    pid,
    profileImageUrl: getFirstPersonaSeedProfileImage(payload as PersonaSeedLike),
  }).catch((error) => {
    logger.warn("[tutors/personas] profile artifact link skipped:", error);
  });

  return NextResponse.json({ success: true, data: await toClientPersonaForClient(saved, user) });
}
export const POST = withAuth(handlePOST, undefined, "tutors/personas:write", { bodyParser: "json" });
