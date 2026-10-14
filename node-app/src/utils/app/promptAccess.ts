import type { PromptAccessLevelType } from "types/app";

export const PROMPT_ACCESS_LEVEL_OPTIONS: Array<{
  value: PromptAccessLevelType;
  label: { ko: string; en: string };
}> = [
  { value: "public", label: { ko: "공개", en: "Public" } },
  { value: "admin", label: { ko: "어드민 전용", en: "Admin only" } },
];

export const PUBLIC_PROMPT_ACCESS_LEVELS: PromptAccessLevelType[] = ["public"];
export const INTERNAL_PROMPT_ACCESS_LEVELS: PromptAccessLevelType[] = ["public", "admin"];

export function normalizePromptAccessLevel(raw?: unknown): PromptAccessLevelType {
  return String(raw || "").trim().toLowerCase() === "admin" ? "admin" : "public";
}

export const RESERVED_INTERNAL_PROMPT_KEY_PREFIX = "amu-";
export const PROMPT_KEY_RESERVED_PREFIX_ERROR_CODE = "PROMPT_KEY_RESERVED_PREFIX";

export function isReservedInternalPromptKey(key: unknown): boolean {
  return String(key || "").trim().toLowerCase().startsWith(RESERVED_INTERNAL_PROMPT_KEY_PREFIX);
}

export function createReservedPromptKeyError() {
  const err = new Error("amu- 키는 accessLevel admin 으로만 저장할 수 있습니다") as Error & {
    errorCode: string;
    status: number;
  };
  err.errorCode = PROMPT_KEY_RESERVED_PREFIX_ERROR_CODE;
  err.status = 400;
  return err;
}

/** 시스템 템플릿: amu- 키는 저장 후 accessLevel 이 admin 이어야 한다. */
export function assertSystemPromptKeyAccessLevel(key: unknown, accessLevel: PromptAccessLevelType) {
  if (isReservedInternalPromptKey(key) && accessLevel !== "admin") throw createReservedPromptKeyError();
}
