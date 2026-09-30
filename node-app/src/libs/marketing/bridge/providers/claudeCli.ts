import { callTextByProvider } from "libs/server-utils/api/apiHelper";

const CLAUDE_PROVIDER = "claude" as const;
const CLAUDE_MODEL = "claude-opus-5";
const CLAUDE_COMMAND_PREVIEW = `claude --model ${CLAUDE_MODEL} --output json`;

export async function runClaudeCliBridge(prompt: string, actorUser?: unknown) {
  const response = await callTextByProvider(CLAUDE_PROVIDER, CLAUDE_MODEL, prompt, {
    n: 1,
    temperature: 0.2,
    maxOutputTokens: 900,
    actorUser,
  });

  return {
    bridgeProvider: "claude" as const,
    executionProvider: CLAUDE_PROVIDER,
    executionKind: "api" as const,
    commandPreview: CLAUDE_COMMAND_PREVIEW,
    modelName: response.modelName,
    rawText: String(response.outputs?.[0] || "").trim(),
    usageTotal: response.usageTotal,
  };
}
