import { studioRequest } from "./studioClient";
import type { TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain ai
 * @scope client
 */

export async function translateWithContentPrompt(
  text: string,
  targetLanguage: string,
  signal?: AbortSignal,
  opts?: { templateKey?: string; provider?: TextProviderType; modelName?: string }
): Promise<{
  success: boolean;
  originalText?: string;
  translatedText?: string;
  targetLanguage?: string;
  error?: string;
  errorCode?: string;
}> {
  const templateKey = opts?.templateKey || "realtime_translate";

  const extraPrompt = [`Target language: ${targetLanguage}`, `---`, `Text:`, text].join("\n");

  const out = await studioRequest<{ contents: string[]; coins: number; modelName?: string; provider?: string }>({
    kind: "template-content",
    signal,
    body: {
      templateKey,
      extraPrompt,
      platform: "chat_translation",
      language: targetLanguage,
      n: 1,
      temperature: 0.3,
      maxOutputTokens: 1024,
      ...(opts?.provider ? { provider: opts.provider } : {}),
      ...(opts?.modelName ? { modelName: opts.modelName } : {}),
    },
  });

  if (!out.ok) return { success: false, error: out.error, errorCode: out.errorCode };

  const translated = String(out.data.contents?.[0] || "").trim();
  if (!translated) return { success: false, error: "empty_translation", errorCode: "EMPTY_TRANSLATION" };

  return {
    success: true,
    originalText: text,
    translatedText: translated,
    targetLanguage,
  };
}
