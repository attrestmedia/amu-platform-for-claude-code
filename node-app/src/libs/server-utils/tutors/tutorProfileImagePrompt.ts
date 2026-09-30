import "server-only";
import { getImagePromptByKeyInternal } from "libs/database/lab";
import { filterImagePromptVariableDefaults, renderImagePrompt } from "utils/lab";
import {
  buildTutorProfileImageAttachmentInstruction,
  buildTutorProfileImageDescription,
  buildTutorProfileImagePromptContext,
  resolveTutorProfileImageTemplateKey,
} from "utils/app/tutorProfileImage";
import type { AvatarInputMode, PersonaFormValuesType, TutorProfileImageGenerateRequest } from "types/ai";
import { toUnknownRecord } from "utils/common/typeUtils";

function safeText(value: unknown, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function resolveTutorProfileTemplateKey(raw: unknown, persona?: Partial<PersonaFormValuesType>) {
  const requested = safeText(raw, 120);
  const fixedKey = resolveTutorProfileImageTemplateKey(persona?.personaType);
  return requested === fixedKey ? requested : fixedKey;
}

function resolveTutorProfileInputMode(body: TutorProfileImageGenerateRequest, inputModeOverride?: AvatarInputMode) {
  if (inputModeOverride === "reference") return "reference" as const;
  if (inputModeOverride === "text") return "text" as const;
  const baseImages = Array.isArray(body?.baseImages) ? body.baseImages.filter((item) => Boolean(item?.data)) : [];
  return baseImages.length > 0 ? ("reference" as const) : ("text" as const);
}

function buildTutorProfileImagePromptParams(args: {
  description: string;
  inputMode: AvatarInputMode;
  displayName?: string;
  presetPrompt?: string;
  personaHints?: Partial<PersonaFormValuesType>;
  personaType?: "human" | "monster";
}) {
  const hints = toUnknownRecord(args.personaHints);
  return {
    display_name: safeText(args.displayName),
    description: safeText(args.description, 2000),
    persona_type: safeText(args.personaType || "human"),
    preset_prompt: safeText(args.presetPrompt, 8000),
    appearance_hint: safeText(hints.appearance, 800),
    job_hint: safeText(args.personaHints?.job, 400),
    personality_hint: safeText(hints.personality, 800),
    reference_rule:
      args.inputMode === "reference"
        ? "If a reference image is attached, preserve the core face shape, styling direction, and identity cues."
        : "Design the character purely from the text brief while keeping the silhouette readable and distinctive.",
  };
}

export async function buildTutorProfileImagePromptPayload(args: {
  body: TutorProfileImageGenerateRequest;
  inputModeOverride?: AvatarInputMode;
}) {
  const body = args.body || {};
  const persona = body?.persona || {};
  const inputMode = resolveTutorProfileInputMode(body, args.inputModeOverride);
  const personaType = persona?.personaType === "monster" ? "monster" : "human";
  const templateKey = resolveTutorProfileTemplateKey(body?.templateKey, persona);
  const description = buildTutorProfileImageDescription(persona, body?.brief);
  const profileContext = buildTutorProfileImagePromptContext(persona, body?.brief);
  const attachmentInstruction = buildTutorProfileImageAttachmentInstruction({
    hasBaseImage: Array.isArray(body?.baseImages) && body.baseImages.some((item) => Boolean(item?.data)),
    extraBrief: body?.brief,
  });

  if (!description) {
    const error = new Error("persona_or_brief_required") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const doc = await getImagePromptByKeyInternal(templateKey);
  const docRec = toUnknownRecord(doc);
  const templateText = String(doc?.templateText || "").trim();
  const accessLevel = String(docRec.accessLevel || "").trim();

  if (!templateText || accessLevel !== "admin") {
    const error = new Error("tutor_profile_template_not_found") as Error & {
      status?: number;
      errorCode?: string;
      templateKey?: string;
      accessLevel?: string;
    };
    error.status = 500;
    error.errorCode = "TUTOR_PROFILE_TEMPLATE_NOT_REGISTERED";
    error.templateKey = templateKey;
    error.accessLevel = accessLevel;
    throw error;
  }

  const defaultVariables = filterImagePromptVariableDefaults(toUnknownRecord(docRec.defaultParams));
  const tutorsPolicy = toUnknownRecord(persona?.tutorsPolicy);
  const profileImagePromptParams = buildTutorProfileImagePromptParams({
    description,
    inputMode,
    displayName: safeText(persona?.name, 80),
    presetPrompt: safeText(tutorsPolicy.systemPersonaPrompt, 8000),
    personaHints: persona,
    personaType,
  });
  const renderedTemplate = renderImagePrompt(undefined, templateText, {
    params: {
      ...defaultVariables,
      ...(body?.variables || {}),
      ...profileImagePromptParams,
    },
  });
  const prompt = [profileContext, attachmentInstruction, renderedTemplate].filter(Boolean).join("\n\n");

  return {
    prompt,
    profileContext,
    renderedTemplate,
    templateKey,
    templateTitle: String(doc?.title || templateKey).trim(),
    inputMode,
    personaType,
    description,
  };
}
