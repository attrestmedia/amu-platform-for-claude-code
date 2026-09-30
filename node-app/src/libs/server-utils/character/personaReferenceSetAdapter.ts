import { CHARACTER_REFERENCE_IMAGE_ROLES, type CharacterReferenceImageRoleType } from "consts/app";
import type { IPersonaProfileMap } from "types/ai/persona";

export type PersonaReferenceSlotReadResult = {
  slots: Partial<Record<CharacterReferenceImageRoleType, string>>;
  unmappedVariants: string[];
};

/** Persona profiles를 공통 레퍼런스 역할로 읽기만 하는 어댑터다. 저장 구조는 변경하지 않는다. */
export function readPersonaReferenceSlots(profiles?: IPersonaProfileMap | null): PersonaReferenceSlotReadResult {
  const slots: Partial<Record<CharacterReferenceImageRoleType, string>> = {};
  const unmappedVariants: string[] = [];

  if (!profiles || typeof profiles !== "object") return { slots, unmappedVariants };

  const defaultUrl = String(profiles.default?.[0] || "").trim();
  if (defaultUrl) slots.profile = defaultUrl;

  const knownRoles = new Set<string>(CHARACTER_REFERENCE_IMAGE_ROLES);
  for (const [variant, values] of Object.entries(profiles)) {
    if (variant === "default") continue;
    if (!knownRoles.has(variant)) {
      unmappedVariants.push(variant);
      continue;
    }

    const url = String(values?.[0] || "").trim();
    if (url) slots[variant as CharacterReferenceImageRoleType] = url;
  }

  return { slots, unmappedVariants };
}
