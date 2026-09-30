import {
  TUTOR_CONVERSATION_LEVEL_OPTIONS,
  TUTOR_GOAL_TYPE_OPTIONS,
  type TutorConversationLevel,
  type TutorGoalType,
} from "consts/tutors";

export const SYSTEM_PERSONA_USAGE_VALUES = ["all", "game", "tutors"] as const;
export const SYSTEM_PERSONA_PRESET_KIND_VALUES = [
  "system-persona",
  "npc-role-profile",
  "tutor-goal-blueprint",
  "safety-overlay",
] as const;
export const SYSTEM_PERSONA_LIFECYCLE_VALUES = ["draft", "review", "published", "deprecated", "archived"] as const;
export const SYSTEM_PERSONA_SELECTABLE_SERVICE_VALUES = ["game", "tutors"] as const;
export const SYSTEM_PERSONA_TUTOR_OPERATION_MODE_VALUES = ["tutor", "coach", "proofread", "chat"] as const;
export const SYSTEM_PERSONA_TUTOR_ANSWER_STYLE_VALUES = ["short", "balanced", "detailed"] as const;
export const SYSTEM_PERSONA_USAGE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "game", label: "All My Universe" },
  { value: "tutors", label: "Tutors" },
] as const;

export type SystemPersonaUsageType = (typeof SYSTEM_PERSONA_USAGE_VALUES)[number];
export type SystemPersonaPresetKindType = (typeof SYSTEM_PERSONA_PRESET_KIND_VALUES)[number];
export type SystemPersonaLifecycleType = (typeof SYSTEM_PERSONA_LIFECYCLE_VALUES)[number];
export type SystemPersonaServiceType = (typeof SYSTEM_PERSONA_SELECTABLE_SERVICE_VALUES)[number];
export type SystemPersonaSafetyProfileType =
  | "standard"
  | "health-sensitive"
  | "mental-health-sensitive"
  | "minors-sensitive"
  | "commerce-sensitive";
export type SystemPersonaTutorOperationModeType = (typeof SYSTEM_PERSONA_TUTOR_OPERATION_MODE_VALUES)[number];
export type SystemPersonaTutorAnswerStyleType = (typeof SYSTEM_PERSONA_TUTOR_ANSWER_STYLE_VALUES)[number];
export type SystemPersonaTutorsPolicyDefaultsType = {
  operationMode?: SystemPersonaTutorOperationModeType;
  answerStyle?: SystemPersonaTutorAnswerStyleType;
  correctionStrength?: number;
  strict?: boolean;
  conversationLevel?: TutorConversationLevel;
  goalType?: TutorGoalType;
};

export interface SystemPersonaLifecycleMetadataType {
  presetKind: SystemPersonaPresetKindType;
  lifecycle: SystemPersonaLifecycleType;
  selectableServices: SystemPersonaServiceType[];
  runtimeResolvable: boolean;
  replacementKey: string;
  revision: number;
  safetyProfile: SystemPersonaSafetyProfileType;
}

const SYSTEM_PERSONA_LEGACY_CLASSIFICATION: Record<string, Partial<SystemPersonaLifecycleMetadataType>> = {
  "savvy-salesperson": {
    presetKind: "npc-role-profile",
    lifecycle: "deprecated",
    selectableServices: [],
    replacementKey: "store-host-profile",
  },
  "school-exam-strategy-tutor": {
    presetKind: "tutor-goal-blueprint",
    lifecycle: "deprecated",
    selectableServices: [],
    replacementKey: "tutor-study-strategy",
  },
  "medical-advisor": {
    presetKind: "safety-overlay",
    selectableServices: ["tutors"],
    safetyProfile: "health-sensitive",
    replacementKey: "health-literacy-guide",
  },
  "psycho-therapist": {
    presetKind: "safety-overlay",
    selectableServices: ["tutors"],
    safetyProfile: "mental-health-sensitive",
    replacementKey: "supportive-reflection-guide",
  },
};

export function classifyLegacySystemPersona(key: unknown): SystemPersonaLifecycleMetadataType {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const classified = SYSTEM_PERSONA_LEGACY_CLASSIFICATION[normalizedKey] || {};
  return {
    presetKind: classified.presetKind || "system-persona",
    lifecycle: classified.lifecycle || "published",
    selectableServices: classified.selectableServices || ["game", "tutors"],
    runtimeResolvable: classified.runtimeResolvable ?? true,
    replacementKey: classified.replacementKey || "",
    revision: classified.revision || 1,
    safetyProfile: classified.safetyProfile || "standard",
  };
}

export function normalizeSystemPersonaLifecycleMetadata(raw?: unknown): SystemPersonaLifecycleMetadataType {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const legacy = classifyLegacySystemPersona(record.key);
  const usage = normalizeSystemPersonaUsageType(
    typeof record.forUniverses === "string" ? record.forUniverses : null,
  );
  const hasExplicitServices = Array.isArray(record.selectableServices);
  const explicitServices: SystemPersonaServiceType[] = hasExplicitServices
    ? (record.selectableServices as unknown[]).filter((value): value is SystemPersonaServiceType =>
        SYSTEM_PERSONA_SELECTABLE_SERVICE_VALUES.includes(value as SystemPersonaServiceType),
      )
    : [];
  const derivedServices: SystemPersonaServiceType[] =
    usage === "game" ? ["game"] : usage === "tutors" ? ["tutors"] : ["game", "tutors"];
  const hasLegacyClassification = legacy.presetKind !== "system-persona" || Boolean(legacy.replacementKey);
  const revisionRaw = Number(record.revision ?? record.version ?? legacy.revision);
  return {
    presetKind: SYSTEM_PERSONA_PRESET_KIND_VALUES.includes(record.presetKind as SystemPersonaPresetKindType)
      ? (record.presetKind as SystemPersonaPresetKindType)
      : legacy.presetKind,
    lifecycle: SYSTEM_PERSONA_LIFECYCLE_VALUES.includes(record.lifecycle as SystemPersonaLifecycleType)
      ? (record.lifecycle as SystemPersonaLifecycleType)
      : legacy.lifecycle,
    selectableServices: hasExplicitServices
      ? [...new Set(explicitServices)]
      : hasLegacyClassification
        ? legacy.selectableServices
        : derivedServices,
    runtimeResolvable: record.runtimeResolvable !== false && legacy.runtimeResolvable !== false,
    replacementKey:
      typeof record.replacementKey === "string" ? record.replacementKey.trim() : legacy.replacementKey,
    revision: Number.isInteger(revisionRaw) && revisionRaw > 0 ? revisionRaw : 1,
    safetyProfile:
      typeof record.safetyProfile === "string" && record.safetyProfile.trim()
        ? (record.safetyProfile.trim() as SystemPersonaSafetyProfileType)
        : legacy.safetyProfile,
  };
}

export function normalizeSystemPersonaUsageType(raw?: string | null): SystemPersonaUsageType {
  const value = String(raw || "")
    .trim()
    .toLowerCase();

  if (value === "all" || value === "game" || value === "tutors") return value;
  if (value === "both") return "all";
  if (value === "commerce") return "tutors";
  if (value === "amu") return "game";
  return "all";
}

export function normalizeSystemPersonaTutorOperationMode(raw?: string | null) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();

  return SYSTEM_PERSONA_TUTOR_OPERATION_MODE_VALUES.includes(value as SystemPersonaTutorOperationModeType)
    ? (value as SystemPersonaTutorOperationModeType)
    : undefined;
}

export function normalizeSystemPersonaTutorAnswerStyle(raw?: string | null) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();

  return SYSTEM_PERSONA_TUTOR_ANSWER_STYLE_VALUES.includes(value as SystemPersonaTutorAnswerStyleType)
    ? (value as SystemPersonaTutorAnswerStyleType)
    : undefined;
}

export function normalizeSystemPersonaTutorsPolicyDefaults(raw?: unknown): SystemPersonaTutorsPolicyDefaultsType {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const operationMode = normalizeSystemPersonaTutorOperationMode(
    typeof record.operationMode === "string"
      ? record.operationMode
      : typeof record.learningMode === "string"
        ? record.learningMode
        : null,
  );
  const answerStyle = normalizeSystemPersonaTutorAnswerStyle(
    typeof record.answerStyle === "string" ? record.answerStyle : null,
  );
  const correctionStrengthRaw = Number(record.correctionStrength);
  const correctionStrength = Number.isFinite(correctionStrengthRaw)
    ? Math.max(0, Math.min(3, Math.round(correctionStrengthRaw)))
    : undefined;
  const strict = typeof record.strict === "boolean" ? record.strict : undefined;
  const conversationLevel =
    typeof record.conversationLevel === "string" &&
    TUTOR_CONVERSATION_LEVEL_OPTIONS.some((option) => option.value === record.conversationLevel)
      ? (record.conversationLevel as TutorConversationLevel)
      : undefined;
  const goalType =
    typeof record.goalType === "string" && TUTOR_GOAL_TYPE_OPTIONS.some((option) => option.value === record.goalType)
      ? (record.goalType as TutorGoalType)
      : undefined;

  return {
    ...(operationMode ? { operationMode } : {}),
    ...(answerStyle ? { answerStyle } : {}),
    ...(typeof correctionStrength === "number" ? { correctionStrength } : {}),
    ...(typeof strict === "boolean" ? { strict } : {}),
    ...(conversationLevel ? { conversationLevel } : {}),
    ...(goalType ? { goalType } : {}),
  };
}
