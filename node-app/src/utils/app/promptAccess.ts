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
