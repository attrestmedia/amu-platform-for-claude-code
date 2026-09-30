import { studioRequest } from "./studioClient";
import { TUTORS_CONVERSATION_HINT_TEMPLATE_KEY } from "consts/app";
import type { TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose Tutors 대화 힌트 생성 클라이언트
 * @process 대화 맥락과 목표 언어를 template-content로 전달  응답 라인 정리
 * @domain tutors
 * @scope client
 */

type ConversationHintResponse = {
  success: boolean;
  hints: string[];
  error?: string;
  errorCode?: string;
};

const MAX_CONVERSATION_HINT_LINES = 4;

function parseHintLines(raw: unknown) {
  const text = String(raw || "").replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();

  try {
    const parsed = JSON.parse(text) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { hints?: unknown }).hints)
        ? (parsed as { hints: unknown[] }).hints
        : [];
    if (values.length) {
      return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].slice(
        0,
        MAX_CONVERSATION_HINT_LINES,
      );
    }
  } catch {}

  return [
    ...new Set(
      text
        .split(/\n+/)
        .map((line) => line.replace(/^[\s\-*\d.)]+/, "").trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_CONVERSATION_HINT_LINES);
}

export async function requestConversationHints(args: {
  targetLanguage: string;
  topic?: string;
  lastAssistantMessage?: string;
  recentConversation?: string;
  excludeHints?: string[];
  provider?: TextProviderType;
  modelName?: string;
  signal?: AbortSignal;
}): Promise<ConversationHintResponse> {
  const targetLanguage = String(args.targetLanguage || "English").trim().slice(0, 24) || "English";
  const topic = String(args.topic || "").trim().slice(0, 80);
  const lastAssistantMessage = String(args.lastAssistantMessage || "").trim().slice(0, 1200);
  const recentConversation = String(args.recentConversation || "").trim().slice(0, 2400);
  const excludeHints = [...new Set((args.excludeHints || []).map((hint) => String(hint || "").trim()).filter(Boolean))]
    .slice(0, 10);
  const extraPrompt = [
    `Target language: ${targetLanguage}`,
    topic ? `Topic: ${topic}` : "",
    recentConversation ? `Recent conversation:\n${recentConversation}` : "",
    lastAssistantMessage
      ? `Tutor just said:\n${lastAssistantMessage}`
      : "This is the first learner turn in the conversation.",
    excludeHints.length ? `Existing suggestions to avoid:\n${excludeHints.map((hint) => `- ${hint}`).join("\n")}` : "",
    "---",
    `Return 3-${MAX_CONVERSATION_HINT_LINES} distinct, short, natural learner replies in ${targetLanguage}.`,
    "Every suggestion must directly answer, continue, or ask about the tutor's latest message.",
    "Do not repeat existing suggestions.",
    "Do not reuse generic clarification phrases unless the tutor's latest message genuinely requires clarification.",
    "Do not translate or explain. Return one suggestion per line.",
  ]
    .filter(Boolean)
    .join("\n");

  const out = await studioRequest<{ contents: string[]; coins?: number; modelName?: string; provider?: string }>({
    kind: "template-content",
    signal: args.signal,
    body: {
      templateKey: TUTORS_CONVERSATION_HINT_TEMPLATE_KEY,
      templateScope: "system",
      extraPrompt,
      platform: "tutors_conversation_hint",
      language: targetLanguage,
      n: 1,
      temperature: 0.75,
      maxOutputTokens: 256,
      ...(args.provider ? { provider: args.provider } : {}),
      ...(args.modelName ? { modelName: args.modelName } : {}),
    },
  });

  if (!out.ok) return { success: false, hints: [], error: out.error, errorCode: out.errorCode };

  const hints = parseHintLines(out.data.contents?.[0]);
  return { success: hints.length > 0, hints, error: hints.length ? undefined : "empty_hints" };
}
