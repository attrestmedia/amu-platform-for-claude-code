import type { TEXT_MODEL_MAP } from "consts/ai";

export const MARKETING_PROOFREAD_DEFAULT_PROVIDER = "google" as const;
export const MARKETING_PROOFREAD_DEFAULT_MODEL = "gemini-3.5-flash-lite" as const;

export const MARKETING_PROOFREAD_DEFAULT_MODEL_BY_PROVIDER = {
  google: MARKETING_PROOFREAD_DEFAULT_MODEL,
  openai: "gpt-5.6-luna",
  claude: "claude-haiku-4-5",
  deepseek: "deepseek-v4-flash",
  xai: "grok-4.7",
  zai: "glm-5.3-flash",
} as const satisfies Record<keyof typeof TEXT_MODEL_MAP, string>;
