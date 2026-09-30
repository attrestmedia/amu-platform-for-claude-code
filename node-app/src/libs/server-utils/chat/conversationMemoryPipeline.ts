import "server-only";
import {
  getConversationArchiveModel,
  getConversationMessageModel,
  getConversationModel,
  getConversationRawBackupModel,
  getConversationSessionModel,
} from "libs/database/conversations";
import { callTextByProvider } from "libs/server-utils/api/apiHelper";
import {
  assertAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
  billAIUsageOrThrow,
} from "libs/services/aiUsageBilling";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import { capHistoryByTokenBudget, estimateTokens } from "utils/ai";
import { createTextHash } from "utils/common";
import { logger } from "utils/log";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import type { AiMessageType, IMessage } from "types/ai";

// 대화 컬렉션은 사용자별로 동적 생성되며 일관된 스키마가 없어 unknown 도큐먼트로 처리
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMongoModel = import("mongoose").Model<any>;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SESSION_SUMMARY_INTERVAL = 24;
const SESSION_INPUT_MESSAGE_BUDGET = 6000;
const SESSION_FORCE_MESSAGE_LIMIT = 48;
const MEMORY_INJECTION_TOKEN_BUDGET = 1200;
const RAW_RETENTION_MONTHS = 6;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LITE_MODEL_CANDIDATES = [
  { provider: "google" as const, model: "gemini-3.5-flash-lite" },
  { provider: "openai" as const, model: "gpt-5.6-luna" },
];
const FACT_CATEGORY_VALUES = ["profile", "goal", "preference", "taboo", "relationship", "learning"] as const;

type IdentityArgs = {
  serverUserId: string;
  personaId: string;
  userPersonaId?: string;
  universeId?: string;
};

type RefreshArgs = IdentityArgs & {
  sessionId: string;
  role: "user" | "assistant";
  messageInserted: boolean;
  systemCode?: string[];
};

type MemoryBillingContext = {
  uid: string;
  operationPrefix: string;
  meta?: Record<string, unknown>;
};

type SessionSummaryResult = {
  summary: string;
  keyTopics: string[];
  importance: number;
  importantFacts: ConversationFact[];
  modelName: string;
};

type PeriodSummaryResult = {
  summary: string;
  keyTopics: string[];
  importance: number;
  modelName: string;
};

type ConversationFact = {
  category: (typeof FACT_CATEGORY_VALUES)[number];
  key: string;
  value: string;
  confidence: number;
  importance: number;
  updatedAt: Date;
  sourcePeriod: "session" | "daily" | "weekly" | "monthly" | "yearly";
  sourceRef: string;
};

function safeTrim(v: unknown, max = 320) {
  const text = typeof v === "string" ? v : v == null ? "" : String(v);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function clampInt(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clampFloat(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toKstShifted(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function fromKstShifted(date: Date) {
  return new Date(date.getTime() - KST_OFFSET_MS);
}

function formatKstDateKey(date: Date) {
  const shifted = toKstShifted(date);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate(),
  ).padStart(2, "0")}`;
}

function getKstDayStart(date: Date) {
  const shifted = toKstShifted(date);
  shifted.setUTCHours(0, 0, 0, 0);
  return fromKstShifted(shifted);
}

function getKstDateRange(dateKey: string) {
  return {
    start: new Date(`${dateKey}T00:00:00.000+09:00`),
    end: new Date(`${dateKey}T23:59:59.999+09:00`),
  };
}

function getWeekRangeFromDateKey(dateKey: string) {
  const base = new Date(`${dateKey}T00:00:00.000+09:00`);
  const shifted = toKstShifted(base);
  const weekdayIndex = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - weekdayIndex);
  shifted.setUTCHours(0, 0, 0, 0);
  const end = new Date(shifted);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return {
    periodKey: formatKstDateKey(fromKstShifted(shifted)),
    startDate: formatKstDateKey(fromKstShifted(shifted)),
    endDate: formatKstDateKey(fromKstShifted(end)),
  };
}

function getMonthRangeFromDateKey(dateKey: string) {
  const [year, month] = dateKey.split("-").map((v) => Number(v));
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00.000+09:00`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000+09:00`);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return {
    periodKey: `${year}-${String(month).padStart(2, "0")}`,
    startDate: formatKstDateKey(start),
    endDate: formatKstDateKey(end),
  };
}

function getYearRangeFromMonthKey(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  return {
    periodKey: String(year),
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function isClosedDateKey(dateKey: string, currentDateKey: string) {
  return dateKey < currentDateKey;
}

function isClosedWeek(endDateKey: string, currentDateKey: string) {
  return endDateKey < currentDateKey;
}

function isClosedMonth(periodKey: string, currentMonthKey: string) {
  return periodKey < currentMonthKey;
}

function isClosedYear(periodKey: string, currentYearKey: string) {
  return periodKey < currentYearKey;
}

function extractJsonObject(raw: string) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  const cleaned = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) return null;

  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

function toMemoryOperationSegment(value: unknown, max = 72) {
  return String(value || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, max) || "unknown";
}

function classifyMemoryProviderOperationFailure(context: { dispatchStarted: boolean; providerResponseReceived: boolean; error: unknown }): "release" | "dispatch_uncertain" | "post_response_failure" {
  const { dispatchStarted, providerResponseReceived, error } = context;
  const errorRecord = error && typeof error === "object" ? error : null;
  const errorCode = errorRecord && "errorCode" in errorRecord ? errorRecord.errorCode : undefined;
  if (errorCode === "PROVIDER_OPERATION_UNRESOLVED" || errorCode === "PROVIDER_OPERATION_IN_PROGRESS") {
    return "dispatch_uncertain";
  }
  if (!dispatchStarted) return "release";
  if (providerResponseReceived) return "post_response_failure";

  const status = errorRecord && "status" in errorRecord ? errorRecord.status : undefined;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500
    ? "release"
    : "dispatch_uncertain";
}

function scopeMemoryBilling(billing: MemoryBillingContext, ...parts: unknown[]) {
  return {
    ...billing,
    operationPrefix: [billing.operationPrefix, ...parts.map((part) => toMemoryOperationSegment(part))].join(":"),
  };
}

async function runLiteStructuredPrompt<T>(prompt: string, fallback: T, billing: MemoryBillingContext) {
  for (const candidate of LITE_MODEL_CANDIDATES) {
    const operationId = `${toMemoryOperationSegment(billing.operationPrefix, 190)}:${candidate.provider}:${candidate.model}`;
    let providerDispatchStarted = false;
    let providerResponseReceived = false;
    let operation: Awaited<ReturnType<typeof claimProviderOperationOrThrow>> | null = null;
    try {
      operation = await claimProviderOperationOrThrow(operationId);
      let result: Awaited<ReturnType<typeof callTextByProvider>>;
      if (operation.kind === "replay") {
        result = operation.result as Awaited<ReturnType<typeof callTextByProvider>>;
      } else {
        await assertPricingPreflightOrThrow({
          provider: candidate.provider,
          modelName: candidate.model,
          modality: "text",
          kind: "token",
          variants: [undefined],
        });
        await assertAIUsageBalanceOrThrow({
          uid: billing.uid,
          app: "ai_conversation_memory",
          provider: candidate.provider,
          modelName: candidate.model,
          usage: {
            text: {
              input: Math.max(1, estimateTokens(prompt)),
              output: 1200,
            },
          },
          modality: "text",
          meta: {
            ...billing.meta,
            route: "conversation-memory/lite-preflight",
            operationId,
          },
        });
        providerDispatchStarted = true;
        result = await callTextByProvider(candidate.provider, candidate.model, prompt, {
          n: 1,
          temperature: 0.2,
          maxOutputTokens: 1200,
        });
        providerResponseReceived = true;
        const inputTokens = Math.max(1, Number(result.usageTotal?.input || estimateTokens(prompt)));
        const outputTokens = Math.max(1, Number(result.usageTotal?.output || estimateTokens(String(result.outputs?.[0] || ""))));
        await billAIUsageOrThrow({
          uid: billing.uid,
          app: "ai_conversation_memory",
          provider: candidate.provider,
          modelName: result.modelName || candidate.model,
          usage: { text: { input: inputTokens, output: outputTokens } },
          modality: "text",
          meta: {
            ...billing.meta,
            route: "conversation-memory/lite",
            operationId,
          },
        });
        await operation.complete(result);
      }
      const parsed = extractJsonObject(result?.outputs?.[0] || "");
      if (parsed && typeof parsed === "object") {
        return { data: parsed as T, modelName: `${candidate.provider}:${candidate.model}` };
      }
      return { data: fallback, modelName: `${candidate.provider}:${candidate.model}` };
    } catch (error) {
      const disposition = classifyMemoryProviderOperationFailure({
        dispatchStarted: providerDispatchStarted,
        providerResponseReceived,
        error,
      });
      if (operation?.kind === "reserved" && !operation.isTerminal()) {
        if (disposition === "release") await operation.release();
        else await operation.markUnresolved(disposition);
      }
      if (disposition !== "release") throw error;
      logger.warn("대화 memory lite 요약 모델 호출 실패:", {
        provider: candidate.provider,
        model: candidate.model,
        error: String(toErrorLike(error).message || error),
      });
    }
  }

  return { data: fallback, modelName: "fallback" };
}

function normalizeTopics(items: unknown, fallbackText = "") {
  const fallback = fallbackText
    .split(/[,\n/]/)
    .map((item) => safeTrim(item, 40))
    .filter(Boolean)
    .slice(0, 6);

  if (!Array.isArray(items)) return fallback;

  const normalized = items
    .map((item) => safeTrim(item, 40))
    .filter(Boolean)
    .slice(0, 6);

  return normalized.length ? normalized : fallback;
}

function normalizeFactCategory(v: unknown): ConversationFact["category"] | null {
  const value = String(v || "")
    .trim()
    .toLowerCase();
  return (FACT_CATEGORY_VALUES as readonly string[]).includes(value) ? (value as ConversationFact["category"]) : null;
}

function normalizeImportantFacts(items: unknown, sourceRef: string): ConversationFact[] {
  if (!Array.isArray(items)) return [];

  const normalized = items
    .map((item) => {
      const it = toUnknownRecord(item);
      const category = normalizeFactCategory(it.category);
      const key = safeTrim(it.key, 80)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const value = safeTrim(it.value, 220);
      if (!category || !key || !value) return null;

      return {
        category,
        key,
        value,
        confidence: clampFloat(it.confidence, 0.4, 1),
        importance: clampInt(it.importance, 1, 10),
        updatedAt: new Date(),
        sourcePeriod: "session" as const,
        sourceRef,
      };
    })
    .filter(Boolean);

  return normalized as ConversationFact[];
}

function buildSessionPrompt(args: {
  personaId: string;
  sessionId: string;
  previousSummary: string;
  messages: Array<{ role: string; content: string }>;
}) {
  const history = args.messages
    .map((message) => `${message.role.toUpperCase()}: ${safeTrim(message.content, 800)}`)
    .join("\n");

  return `
당신은 장기 대화 memory를 위해 세션 요약과 중요한 사실을 구조화하는 엔진이다.
아래 조건을 엄격히 지켜라.

1. 응답은 JSON 객체 하나만 반환한다.
2. summary는 3줄 이하, 최대 240자.
3. keyTopics는 2~6개.
4. importantFacts는 "명시적이고 장기적으로 의미 있는 사실"만 반환한다.
5. 일시적 잡담, 순간 감탄, 짧은 농담, 추측은 importantFacts에 넣지 않는다.
6. importantFacts.category는 profile|goal|preference|taboo|relationship|learning 중 하나만 사용한다.
7. importantFacts.key는 snake_case로 짧고 안정적으로 만든다.

반환 형식:
{
  "summary": "string",
  "keyTopics": ["string"],
  "importance": 1,
  "importantFacts": [
    {
      "category": "goal",
      "key": "current_goal",
      "value": "string",
      "confidence": 0.0,
      "importance": 1
    }
  ]
}

sessionId: ${args.sessionId}
personaId: ${args.personaId}
previousSummary:
${args.previousSummary || "(none)"}

newMessages:
${history}
`.trim();
}

function buildPeriodPrompt(args: {
  periodType: "daily" | "weekly" | "monthly" | "yearly";
  periodKey: string;
  sourceSummaries: string[];
}) {
  return `
당신은 장기 대화 memory를 위해 기간 요약을 만드는 엔진이다.
아래 조건을 엄격히 지켜라.

1. 응답은 JSON 객체 하나만 반환한다.
2. summary는 최대 280자.
3. keyTopics는 2~6개.
4. importance는 1~10 정수.
5. source summary에 없는 사실을 새로 만들지 않는다.

반환 형식:
{
  "summary": "string",
  "keyTopics": ["string"],
  "importance": 1
}

periodType: ${args.periodType}
periodKey: ${args.periodKey}
sourceSummaries:
${args.sourceSummaries.map((item, index) => `${index + 1}. ${safeTrim(item, 500)}`).join("\n")}
`.trim();
}

function buildFallbackSessionSummary(messages: Array<{ role: string; content: string }>): SessionSummaryResult {
  const tail = messages
    .slice(-3)
    .map((message) => `${message.role === "assistant" ? "피드백" : "질문"}: ${safeTrim(message.content, 100)}`);
  const joined = tail.join(" / ") || "최근 대화 흐름 이어가기";
  return {
    summary: safeTrim(joined, 220),
    keyTopics: normalizeTopics(joined, joined),
    importance: Math.max(3, Math.min(9, 3 + Math.floor(messages.length / 4))),
    importantFacts: [],
    modelName: "fallback",
  };
}

function buildFallbackPeriodSummary(sourceSummaries: string[]): PeriodSummaryResult {
  const joined =
    sourceSummaries
      .map((item) => safeTrim(item, 90))
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ") || "누적 대화 흐름 유지";
  return {
    summary: safeTrim(joined, 260),
    keyTopics: normalizeTopics(joined, joined),
    importance: Math.max(3, Math.min(9, 3 + sourceSummaries.length)),
    modelName: "fallback",
  };
}

function buildSourceFingerprint(parts: Array<string | number | Date | undefined | null>) {
  return createTextHash(
    parts
      .map((part) => {
        if (part instanceof Date) return part.toISOString();
        return String(part ?? "");
      })
      .join("|"),
  );
}

function detectEmotionalToneFromCodes(codes: string[]) {
  const positive = codes.filter((code) => code === "positive" || code === "good").length;
  const negative = codes.filter((code) => code === "negative" || code === "end-chat" || code === "end-force").length;
  if (negative > positive) return "negative" as const;
  if (positive > negative) return "positive" as const;
  return "neutral" as const;
}

async function summarizeSession(args: {
  SessionModel: AnyMongoModel;
  MessageModel: AnyMongoModel;
  personaId: string;
  session: UnknownRecord;
  match: Record<string, string>;
  force: boolean;
  billing: MemoryBillingContext;
}) {
  const previousCount = clampInt(args.session?.summarySourceMessageCount, 0, 1_000_000);
  const currentCount = clampInt(args.session?.messageCount, 0, 1_000_000);
  const shouldSkip = !args.force && args.session?.summary && currentCount - previousCount < SESSION_SUMMARY_INTERVAL;
  if (shouldSkip) return null;

  const query = args.MessageModel.find({ ...args.match, sessionId: args.session.sessionId }).sort({ timestamp: 1 });
  if (args.force && currentCount > SESSION_FORCE_MESSAGE_LIMIT) {
    query.skip(Math.max(0, currentCount - SESSION_FORCE_MESSAGE_LIMIT));
  } else if (previousCount > 0 && currentCount > previousCount) {
    query.skip(Math.max(0, previousCount - 2));
  }

  const rawMessages = await query.select({ role: 1, content: 1, systemCode: 1, timestamp: 1, clientId: 1 }).lean();

  if (!rawMessages.length) return null;

  const cappedMessages = capHistoryByTokenBudget(
    rawMessages.map(
      (message: UnknownRecord): IMessage => ({
        role: String(message.role) as AiMessageType,
        content: safeTrim(message.content, 1200),
      }),
    ),
    SESSION_INPUT_MESSAGE_BUDGET,
  );

  const fallback = buildFallbackSessionSummary(cappedMessages as Array<{ role: string; content: string }>);
  const prompt = buildSessionPrompt({
    personaId: args.personaId,
    sessionId: String(args.session.sessionId),
    previousSummary: safeTrim(args.session?.summary, 280),
    messages: cappedMessages as Array<{ role: string; content: string }>,
  });
  const result = await runLiteStructuredPrompt<UnknownRecord>(prompt, fallback as unknown as UnknownRecord, args.billing);

  const sourceRef = `${args.session.sessionId}:${currentCount}`;
  const normalized: SessionSummaryResult = {
    summary: safeTrim(result.data?.summary, 260) || fallback.summary,
    keyTopics: normalizeTopics(result.data?.keyTopics, fallback.summary),
    importance: clampInt(result.data?.importance, 1, 10) || fallback.importance,
    importantFacts: normalizeImportantFacts(result.data?.importantFacts, sourceRef),
    modelName: result.modelName,
  };

  await args.SessionModel.updateOne(
    { ...args.match, sessionId: args.session.sessionId },
    {
      $set: {
        summary: normalized.summary,
        summaryUpdatedAt: new Date(),
        summarySourceMessageCount: currentCount,
        summaryModel: normalized.modelName,
      },
    },
  );

  return normalized;
}

async function summarizePeriod(args: {
  periodType: "daily" | "weekly" | "monthly" | "yearly";
  periodKey: string;
  sourceSummaries: string[];
  billing: MemoryBillingContext;
}) {
  const fallback = buildFallbackPeriodSummary(args.sourceSummaries);
  const prompt = buildPeriodPrompt(args);
  const result = await runLiteStructuredPrompt<UnknownRecord>(prompt, fallback as unknown as UnknownRecord, args.billing);

  return {
    summary: safeTrim(result.data?.summary, 320) || fallback.summary,
    keyTopics: normalizeTopics(result.data?.keyTopics, fallback.summary),
    importance: clampInt(result.data?.importance, 1, 10) || fallback.importance,
    modelName: result.modelName,
  } satisfies PeriodSummaryResult;
}

function mergeImportantFacts(
  existingFacts: ReadonlyArray<ConversationFact | UnknownRecord> | undefined | null,
  newFacts: ConversationFact[],
) {
  const map = new Map<string, ConversationFact>();

  for (const factRaw of existingFacts || []) {
    const fact = factRaw as UnknownRecord;
    const category = normalizeFactCategory(fact.category);
    if (!category) continue;
    const factKey = String(fact.key || "");
    const value = String(fact.value || "");
    if (!factKey || !value) continue;
    const key = `${category}:${factKey}`;
    map.set(key, {
      category,
      key: factKey,
      value,
      confidence: clampFloat(fact.confidence, 0.4, 1),
      importance: clampInt(fact.importance, 1, 10),
      updatedAt: fact.updatedAt ? new Date(fact.updatedAt as string | number | Date) : new Date(),
      sourcePeriod: (typeof fact.sourcePeriod === "string"
        ? fact.sourcePeriod
        : "session") as ConversationFact["sourcePeriod"],
      sourceRef: String(fact.sourceRef || ""),
    });
  }

  for (const fact of newFacts) {
    const key = `${fact.category}:${fact.key}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, fact);
      continue;
    }

    const sameValue = safeTrim(prev.value, 240) === safeTrim(fact.value, 240);
    if (sameValue) {
      map.set(key, {
        ...prev,
        confidence: Math.max(prev.confidence, fact.confidence),
        importance: Math.max(prev.importance, fact.importance),
        updatedAt: fact.updatedAt,
        sourcePeriod: fact.sourcePeriod,
        sourceRef: fact.sourceRef,
      });
      continue;
    }

    const shouldReplace =
      fact.importance > prev.importance ||
      fact.confidence > prev.confidence ||
      fact.updatedAt.getTime() >= prev.updatedAt.getTime();
    if (shouldReplace) map.set(key, fact);
  }

  return [...map.values()]
    .sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, 32);
}

async function computeDayIntimacyChange(
  ConversationModel: AnyMongoModel,
  match: Record<string, string>,
  dateKey: string,
) {
  const doc = await ConversationModel.findOne(match).select({ "relationship.intimacyHistory": 1 }).lean();
  const relationship = toUnknownRecord(toUnknownRecord(doc).relationship);
  const history: UnknownRecord[] = Array.isArray(relationship.intimacyHistory)
    ? (relationship.intimacyHistory as UnknownRecord[])
    : [];
  return history
    .filter(
      (item) => item?.timestamp && formatKstDateKey(new Date(item.timestamp as string | number | Date)) === dateKey,
    )
    .reduce((sum: number, item) => sum + Number(item?.change || 0), 0);
}

async function computeDayTone(MessageModel: AnyMongoModel, match: Record<string, string>, sessionIds: string[]) {
  if (!sessionIds.length) return "neutral" as const;
  const assistantMessages = await MessageModel.find({
    ...match,
    sessionId: { $in: sessionIds },
    role: "assistant",
  })
    .select({ systemCode: 1 })
    .lean();

  const codes = (assistantMessages as UnknownRecord[]).flatMap((message) =>
    Array.isArray(message?.systemCode) ? (message.systemCode as string[]) : [],
  );
  return detectEmotionalToneFromCodes(codes);
}

function trimMemoryBlock(text: string) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  let acc = "";
  for (const line of lines) {
    const next = acc ? `${acc}\n${line}` : line;
    if (estimateTokens(next) > MEMORY_INJECTION_TOKEN_BUDGET) break;
    acc = next;
  }

  return acc.trim();
}

function subtractMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() - months);
  return next;
}

async function pruneRawMessagesIfNeeded(args: {
  ArchiveModel: AnyMongoModel;
  RawBackupModel: AnyMongoModel;
  SessionModel: AnyMongoModel;
  MessageModel: AnyMongoModel;
  archiveMatch: Record<string, string>;
  archiveDoc: UnknownRecord | null;
  match: Record<string, string>;
  now: Date;
}) {
  const rollupState = toUnknownRecord(args.archiveDoc?.rollupState);
  const lastPrunedAt = rollupState.lastRawPrunedAt
    ? new Date(rollupState.lastRawPrunedAt as string | number | Date)
    : null;
  if (lastPrunedAt && args.now.getTime() - lastPrunedAt.getTime() < PRUNE_INTERVAL_MS) return args.archiveDoc;

  const cutoff = subtractMonths(args.now, RAW_RETENTION_MONTHS);
  const oldSessions = await args.SessionModel.find({
    ...args.match,
    lastMessageAt: { $lt: cutoff },
  })
    .sort({ lastMessageAt: 1 })
    .limit(20)
    .lean();

  for (const session of oldSessions) {
    const messages = await args.MessageModel.find({ ...args.match, sessionId: session.sessionId })
      .sort({ timestamp: 1 })
      .select({ role: 1, content: 1, timestamp: 1, clientId: 1, translation: 1, systemCode: 1, productCode: 1 })
      .lean();
    if (!messages.length) {
      await args.SessionModel.deleteOne({ _id: session._id });
      continue;
    }

    await args.RawBackupModel.updateOne(
      { ...args.match, sessionId: session.sessionId },
      {
        $setOnInsert: {
          ...args.match,
          sessionId: session.sessionId,
        },
        $set: {
          sessionDate: session.date,
          sessionFirstMessageAt: session.firstMessageAt,
          sessionLastMessageAt: session.lastMessageAt,
          sessionLocation: session.location || "unknown",
          sessionSummary: session.summary || "",
          sessionMessageCount: Number(session.messageCount || messages.length),
          backupReason: "retention_prune",
          backedUpAt: args.now,
          messages,
        },
      },
      { upsert: true },
    );

    await args.MessageModel.deleteMany({ ...args.match, sessionId: session.sessionId });
    await args.SessionModel.deleteOne({ _id: session._id });
  }

  const nextArchive = {
    ...(args.archiveDoc || {}),
    rollupState: {
      ...rollupState,
      lastRawPrunedAt: args.now,
    },
  };

  await args.ArchiveModel.updateOne(
    args.archiveMatch,
    {
      $setOnInsert: args.archiveMatch,
      $set: {
        rollupState: nextArchive.rollupState,
        lastProcessedDate: args.now,
      },
    },
    { upsert: true },
  );

  return nextArchive;
}

export function buildConversationIdentityMatch(args: IdentityArgs) {
  const userPersonaId = String(args.userPersonaId || "").trim();
  const universeId = String(args.universeId || "").trim();
  return {
    userId: String(args.serverUserId || "").trim(),
    personaId: String(args.personaId || "").trim(),
    ...(userPersonaId ? { userPersonaId } : universeId ? { universeId } : {}),
  };
}

export async function refreshConversationMemoryPipeline(args: RefreshArgs) {
  if (!args.messageInserted || args.role !== "assistant") return;

  const serverUserId = String(args.serverUserId || "").trim();
  const personaId = String(args.personaId || "").trim();
  if (!serverUserId || !personaId) return;
  // 게스트 세션은 지갑 귀속이 없으므로 대화 메모리의 외부 AI 호출도 실행하지 않는다.
  if (serverUserId.startsWith("guest:")) return;

  const memoryBilling: MemoryBillingContext = {
    uid: serverUserId,
    operationPrefix: `memory:${toMemoryOperationSegment(serverUserId)}:${toMemoryOperationSegment(personaId)}`,
    meta: {
      route: "conversation-memory",
      personaId,
      ...(args.userPersonaId ? { userPersonaId: args.userPersonaId } : {}),
      ...(args.universeId ? { universeId: args.universeId } : {}),
    },
  };

  const match = buildConversationIdentityMatch(args);
  const archiveMatch = buildConversationIdentityMatch({
    serverUserId,
    personaId,
    userPersonaId: args.userPersonaId,
    universeId: args.universeId,
  });

  const now = new Date();
  const currentDateKey = formatKstDateKey(now);
  const currentMonthKey = currentDateKey.slice(0, 7);
  const currentYearKey = currentDateKey.slice(0, 4);
  const SessionModel = await getConversationSessionModel(serverUserId);
  const MessageModel = await getConversationMessageModel(serverUserId);
  const ConversationModel = await getConversationModel(serverUserId);
  const ArchiveModel = await getConversationArchiveModel(serverUserId);
  const RawBackupModel = await getConversationRawBackupModel(serverUserId);

  const currentSession = (await SessionModel.findOne({
    ...match,
    sessionId: args.sessionId,
  }).lean()) as UnknownRecord | null;
  if (!currentSession) return;

  let archiveDoc: UnknownRecord | null =
    ((await ArchiveModel.findOne(archiveMatch).lean()) as UnknownRecord | null) || null;
  const shouldForceCurrentSessionSummary =
    !currentSession.summary ||
    Number(currentSession.messageCount || 0) - Number(currentSession.summarySourceMessageCount || 0) >=
      SESSION_SUMMARY_INTERVAL ||
    (Array.isArray(args.systemCode) && args.systemCode.some((code) => code === "end-chat" || code === "end-force"));

  if (shouldForceCurrentSessionSummary) {
    const currentSessionSummary = await summarizeSession({
      SessionModel,
      MessageModel,
      personaId,
      session: currentSession,
      match,
      force: Boolean(currentSession.summary),
      billing: scopeMemoryBilling(memoryBilling, "session", currentSession.sessionId, currentSession.messageCount),
    });

    if (currentSessionSummary && args.userPersonaId) {
      const existingFacts = Array.isArray(archiveDoc?.importantFacts)
        ? (archiveDoc?.importantFacts as UnknownRecord[])
        : [];
      const mergedFacts = mergeImportantFacts(existingFacts, currentSessionSummary.importantFacts);
      archiveDoc = {
        ...(archiveDoc || {}),
        importantFacts: mergedFacts,
      };
      await ArchiveModel.updateOne(
        archiveMatch,
        {
          $setOnInsert: archiveMatch,
          $set: {
            importantFacts: mergedFacts,
            lastProcessedDate: now,
            rollupState: archiveDoc?.rollupState || {},
          },
        },
        { upsert: true },
      );
    }
  }

  if (!args.userPersonaId) return;

  archiveDoc = ((await ArchiveModel.findOne(archiveMatch).lean()) as UnknownRecord | null) || archiveDoc || null;
  const rollupState: UnknownRecord = toUnknownRecord(archiveDoc?.rollupState);
  const lastDailyRollupAt = rollupState.lastDailyRollupAt
    ? new Date(rollupState.lastDailyRollupAt as string | number | Date)
    : new Date(0);
  const todayStart = getKstDayStart(now);
  const changedClosedSessions = await SessionModel.find({
    ...match,
    updatedAt: { $gt: lastDailyRollupAt },
    lastMessageAt: { $lt: todayStart },
  })
    .select({ sessionId: 1, lastMessageAt: 1 })
    .lean();

  const dailyMap = new Map<string, boolean>();
  for (const session of changedClosedSessions as UnknownRecord[]) {
    if (!session?.lastMessageAt) continue;
    const dateKey = formatKstDateKey(new Date(session.lastMessageAt as string | number | Date));
    if (isClosedDateKey(dateKey, currentDateKey)) dailyMap.set(dateKey, true);
  }

  let dailySummaries: UnknownRecord[] = Array.isArray(archiveDoc?.dailySummaries)
    ? ([...(archiveDoc.dailySummaries as UnknownRecord[])] as UnknownRecord[])
    : [];

  for (const dateKey of [...dailyMap.keys()].sort()) {
    const range = getKstDateRange(dateKey);
    const daySessions = await SessionModel.find({
      ...match,
      lastMessageAt: { $gte: range.start, $lte: range.end },
    })
      .sort({ lastMessageAt: 1 })
      .lean();
    if (!daySessions.length) continue;

    const finalizedSessions: UnknownRecord[] = [];
    for (const session of daySessions as UnknownRecord[]) {
      if (!session.summary || Number(session.messageCount || 0) > Number(session.summarySourceMessageCount || 0)) {
        await summarizeSession({
          SessionModel,
          MessageModel,
          personaId,
          session,
          match,
          force: true,
          billing: scopeMemoryBilling(memoryBilling, "session", session.sessionId, session.messageCount),
        });
      }
      const refreshed = await SessionModel.findOne({ ...match, sessionId: session.sessionId })
        .select({ sessionId: 1, summary: 1, summaryUpdatedAt: 1, summaryModel: 1, messageCount: 1, lastMessageAt: 1 })
        .lean();
      if (refreshed) finalizedSessions.push(refreshed as UnknownRecord);
    }

    const sourceFingerprint = buildSourceFingerprint(
      finalizedSessions.flatMap((session) => [
        String(session.sessionId || ""),
        String(session.summary || ""),
        session.summaryUpdatedAt ? new Date(session.summaryUpdatedAt as string | number | Date) : "",
        Number(session.messageCount || 0),
      ]),
    );
    const existing = dailySummaries.find((summary) => summary.date === dateKey);
    if (existing?.sourceFingerprint === sourceFingerprint) continue;

    const sourceSummaries = finalizedSessions
      .map((session) => session.summary)
      .filter((v): v is string => typeof v === "string" && Boolean(v));
    const summarized = await summarizePeriod({
      periodType: "daily",
      periodKey: dateKey,
      sourceSummaries,
      billing: scopeMemoryBilling(memoryBilling, "daily", dateKey, sourceFingerprint),
    });
    const intimacyChange = await computeDayIntimacyChange(ConversationModel, match, dateKey);
    const emotionalTone = await computeDayTone(
      MessageModel,
      match,
      finalizedSessions.map((session) => String(session.sessionId)),
    );
    const lastSession = finalizedSessions[finalizedSessions.length - 1];
    const sourceLastMessageAt =
      lastSession?.lastMessageAt != null ? new Date(lastSession.lastMessageAt as string | number | Date) : undefined;

    const nextEntry = {
      date: dateKey,
      messageCount: finalizedSessions.reduce((sum, session) => sum + Number(session.messageCount || 0), 0),
      intimacyChange,
      summary: summarized.summary,
      keyTopics: summarized.keyTopics,
      emotionalTone,
      importance: summarized.importance,
      sourceSessionCount: finalizedSessions.length,
      sourceFingerprint,
      sourceLastMessageAt,
      updatedAt: now,
      summaryModel: summarized.modelName,
    };

    dailySummaries = [...dailySummaries.filter((summary) => summary.date !== dateKey), nextEntry].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }

  let weeklySummaries: UnknownRecord[] = Array.isArray(archiveDoc?.weeklySummaries)
    ? ([...(archiveDoc.weeklySummaries as UnknownRecord[])] as UnknownRecord[])
    : [];
  const lastWeeklyRollupAt = rollupState.lastWeeklyRollupAt
    ? new Date(rollupState.lastWeeklyRollupAt as string | number | Date)
    : new Date(0);
  const changedDaily = dailySummaries.filter(
    (summary) => summary.updatedAt && new Date(summary.updatedAt as string | number | Date) > lastWeeklyRollupAt,
  );
  const weekKeys = new Map<string, { periodKey: string; startDate: string; endDate: string }>();
  for (const summary of changedDaily) {
    const weekInfo = getWeekRangeFromDateKey(String(summary.date));
    if (isClosedWeek(weekInfo.endDate, currentDateKey)) weekKeys.set(weekInfo.periodKey, weekInfo);
  }

  for (const weekInfo of weekKeys.values()) {
    const items = dailySummaries.filter(
      (summary) => String(summary.date) >= weekInfo.startDate && String(summary.date) <= weekInfo.endDate,
    );
    if (!items.length) continue;

    const sourceFingerprint = buildSourceFingerprint(
      items.flatMap((item) => [
        String(item.date || ""),
        String(item.sourceFingerprint || ""),
        item.updatedAt ? new Date(item.updatedAt as string | number | Date) : "",
      ]),
    );
    const existing = weeklySummaries.find((summary) => summary.periodKey === weekInfo.periodKey);
    if (existing?.sourceFingerprint === sourceFingerprint) continue;

    const summarized = await summarizePeriod({
      periodType: "weekly",
      periodKey: weekInfo.periodKey,
      sourceSummaries: items.map((item) => `[${String(item.date)}] ${String(item.summary || "")}`),
      billing: scopeMemoryBilling(memoryBilling, "weekly", weekInfo.periodKey, sourceFingerprint),
    });

    const nextEntry = {
      periodKey: weekInfo.periodKey,
      startDate: weekInfo.startDate,
      endDate: weekInfo.endDate,
      summary: summarized.summary,
      totalMessages: items.reduce((sum: number, item) => sum + Number(item.messageCount || 0), 0),
      intimacyChange: items.reduce((sum: number, item) => sum + Number(item.intimacyChange || 0), 0),
      keyEvents: summarized.keyTopics,
      importance: summarized.importance,
      sourceCount: items.length,
      sourceFingerprint,
      updatedAt: now,
      summaryModel: summarized.modelName,
    };

    weeklySummaries = [
      ...weeklySummaries.filter((summary) => summary.periodKey !== weekInfo.periodKey),
      nextEntry,
    ].sort((a, b) => String(a.periodKey).localeCompare(String(b.periodKey)));
  }

  let monthlySummaries: UnknownRecord[] = Array.isArray(archiveDoc?.monthlySummaries)
    ? ([...(archiveDoc.monthlySummaries as UnknownRecord[])] as UnknownRecord[])
    : [];
  const lastMonthlyRollupAt = rollupState.lastMonthlyRollupAt
    ? new Date(rollupState.lastMonthlyRollupAt as string | number | Date)
    : new Date(0);
  const changedWeekly = weeklySummaries.filter(
    (summary) => summary.updatedAt && new Date(summary.updatedAt as string | number | Date) > lastMonthlyRollupAt,
  );
  const monthKeys = new Map<string, { periodKey: string; startDate: string; endDate: string }>();
  for (const summary of changedWeekly) {
    const monthInfo = getMonthRangeFromDateKey(String(summary.endDate));
    if (isClosedMonth(monthInfo.periodKey, currentMonthKey)) monthKeys.set(monthInfo.periodKey, monthInfo);
  }

  for (const monthInfo of monthKeys.values()) {
    const items = weeklySummaries.filter((summary) => String(summary.endDate).startsWith(monthInfo.periodKey));
    if (!items.length) continue;

    const sourceFingerprint = buildSourceFingerprint(
      items.flatMap((item) => [
        String(item.periodKey || ""),
        String(item.sourceFingerprint || ""),
        item.updatedAt ? new Date(item.updatedAt as string | number | Date) : "",
      ]),
    );
    const existing = monthlySummaries.find((summary) => summary.periodKey === monthInfo.periodKey);
    if (existing?.sourceFingerprint === sourceFingerprint) continue;

    const summarized = await summarizePeriod({
      periodType: "monthly",
      periodKey: monthInfo.periodKey,
      sourceSummaries: items.map((item) => `[${String(item.periodKey)}] ${String(item.summary || "")}`),
      billing: scopeMemoryBilling(memoryBilling, "monthly", monthInfo.periodKey, sourceFingerprint),
    });

    const nextEntry = {
      periodKey: monthInfo.periodKey,
      startDate: monthInfo.startDate,
      endDate: monthInfo.endDate,
      summary: summarized.summary,
      totalMessages: items.reduce((sum: number, item) => sum + Number(item.totalMessages || 0), 0),
      intimacyChange: items.reduce((sum: number, item) => sum + Number(item.intimacyChange || 0), 0),
      keyEvents: summarized.keyTopics,
      importance: summarized.importance,
      sourceCount: items.length,
      sourceFingerprint,
      updatedAt: now,
      summaryModel: summarized.modelName,
    };

    monthlySummaries = [
      ...monthlySummaries.filter((summary) => summary.periodKey !== monthInfo.periodKey),
      nextEntry,
    ].sort((a, b) => String(a.periodKey).localeCompare(String(b.periodKey)));
  }

  let yearlySummaries: UnknownRecord[] = Array.isArray(archiveDoc?.yearlySummaries)
    ? ([...(archiveDoc.yearlySummaries as UnknownRecord[])] as UnknownRecord[])
    : [];
  const lastYearlyRollupAt = rollupState.lastYearlyRollupAt
    ? new Date(rollupState.lastYearlyRollupAt as string | number | Date)
    : new Date(0);
  const changedMonthly = monthlySummaries.filter(
    (summary) => summary.updatedAt && new Date(summary.updatedAt as string | number | Date) > lastYearlyRollupAt,
  );
  const yearKeys = new Map<string, { periodKey: string; startDate: string; endDate: string }>();
  for (const summary of changedMonthly) {
    const yearInfo = getYearRangeFromMonthKey(String(summary.periodKey));
    if (isClosedYear(yearInfo.periodKey, currentYearKey)) yearKeys.set(yearInfo.periodKey, yearInfo);
  }

  for (const yearInfo of yearKeys.values()) {
    const items = monthlySummaries.filter((summary) => String(summary.periodKey).startsWith(`${yearInfo.periodKey}-`));
    if (!items.length) continue;

    const sourceFingerprint = buildSourceFingerprint(
      items.flatMap((item) => [
        String(item.periodKey || ""),
        String(item.sourceFingerprint || ""),
        item.updatedAt ? new Date(item.updatedAt as string | number | Date) : "",
      ]),
    );
    const existing = yearlySummaries.find((summary) => summary.periodKey === yearInfo.periodKey);
    if (existing?.sourceFingerprint === sourceFingerprint) continue;

    const summarized = await summarizePeriod({
      periodType: "yearly",
      periodKey: yearInfo.periodKey,
      sourceSummaries: items.map((item) => `[${String(item.periodKey)}] ${String(item.summary || "")}`),
      billing: scopeMemoryBilling(memoryBilling, "yearly", yearInfo.periodKey, sourceFingerprint),
    });

    const nextEntry = {
      periodKey: yearInfo.periodKey,
      startDate: yearInfo.startDate,
      endDate: yearInfo.endDate,
      summary: summarized.summary,
      totalMessages: items.reduce((sum: number, item) => sum + Number(item.totalMessages || 0), 0),
      intimacyChange: items.reduce((sum: number, item) => sum + Number(item.intimacyChange || 0), 0),
      keyEvents: summarized.keyTopics,
      importance: summarized.importance,
      sourceCount: items.length,
      sourceFingerprint,
      updatedAt: now,
      summaryModel: summarized.modelName,
    };

    yearlySummaries = [
      ...yearlySummaries.filter((summary) => summary.periodKey !== yearInfo.periodKey),
      nextEntry,
    ].sort((a, b) => String(a.periodKey).localeCompare(String(b.periodKey)));
  }

  const totalArchivedMessages = dailySummaries.reduce((sum: number, item) => sum + Number(item.messageCount || 0), 0);
  const baseArchive = toUnknownRecord(archiveDoc);
  const baseRollupState = toUnknownRecord(baseArchive.rollupState);
  const nextArchiveDoc: UnknownRecord = {
    ...baseArchive,
    dailySummaries,
    weeklySummaries,
    monthlySummaries,
    yearlySummaries,
    totalArchivedMessages,
    lastProcessedDate: now,
    rollupState: {
      ...baseRollupState,
      lastDailyRollupAt: now,
      lastWeeklyRollupAt: now,
      lastMonthlyRollupAt: now,
      lastYearlyRollupAt: now,
      lastRawPrunedAt: baseRollupState.lastRawPrunedAt,
    },
  };

  await ArchiveModel.updateOne(
    archiveMatch,
    {
      $setOnInsert: archiveMatch,
      $set: {
        dailySummaries: nextArchiveDoc.dailySummaries,
        weeklySummaries: nextArchiveDoc.weeklySummaries,
        monthlySummaries: nextArchiveDoc.monthlySummaries,
        yearlySummaries: nextArchiveDoc.yearlySummaries,
        importantFacts: nextArchiveDoc.importantFacts || [],
        totalArchivedMessages: nextArchiveDoc.totalArchivedMessages,
        lastProcessedDate: nextArchiveDoc.lastProcessedDate,
        rollupState: nextArchiveDoc.rollupState,
      },
    },
    { upsert: true },
  );

  await pruneRawMessagesIfNeeded({
    ArchiveModel,
    RawBackupModel,
    SessionModel,
    MessageModel,
    archiveMatch,
    archiveDoc: nextArchiveDoc,
    match,
    now,
  });
}

export async function loadConversationMemoryBlock(args: IdentityArgs) {
  const serverUserId = String(args.serverUserId || "").trim();
  const personaId = String(args.personaId || "").trim();
  const userPersonaId = String(args.userPersonaId || "").trim();
  if (!serverUserId || !personaId || !userPersonaId) return "";

  const match = buildConversationIdentityMatch(args);
  const SessionModel = await getConversationSessionModel(serverUserId);
  const ArchiveModel = await getConversationArchiveModel(serverUserId);

  const recentSessions = await SessionModel.find({
    ...match,
    summary: { $exists: true, $type: "string", $ne: "" },
  })
    .sort({ lastMessageAt: -1 })
    .limit(3)
    .select({ summary: 1, lastMessageAt: 1 })
    .lean();

  const archive = (await ArchiveModel.findOne(match)
    .select({ dailySummaries: 1, weeklySummaries: 1, monthlySummaries: 1, importantFacts: 1 })
    .lean()) as UnknownRecord | null;

  const recentDaily = ([...((archive?.dailySummaries as UnknownRecord[] | undefined) || [])] as UnknownRecord[])
    .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))
    .slice(0, 1);
  const recentWeekly = ([...((archive?.weeklySummaries as UnknownRecord[] | undefined) || [])] as UnknownRecord[])
    .sort((a, b) => String(b?.periodKey || "").localeCompare(String(a?.periodKey || "")))
    .slice(0, 1);
  const importantFacts = ([...((archive?.importantFacts as UnknownRecord[] | undefined) || [])] as UnknownRecord[])
    .sort((a, b) => {
      if (Number(b?.importance || 0) !== Number(a?.importance || 0))
        return Number(b?.importance || 0) - Number(a?.importance || 0);
      return (
        new Date((b?.updatedAt as string | number | Date) || 0).getTime() -
        new Date((a?.updatedAt as string | number | Date) || 0).getTime()
      );
    })
    .slice(0, 8);

  // 최종 태그의 단일 소유자는 systemPromptComposer다. 이 함수는 unwrapped projection만 반환한다.
  const lines: string[] = [];
  if (recentSessions.length) {
    lines.push("최근 세션:");
    for (const session of recentSessions) {
      lines.push(`- ${safeTrim(session.summary, 200)}`);
    }
  }
  if (recentDaily.length) {
    lines.push("최근 일간 요약:");
    for (const entry of recentDaily) {
      lines.push(`- [${entry.date}] ${safeTrim(entry.summary, 220)}`);
    }
  }
  if (recentWeekly.length) {
    lines.push("최근 주간 요약:");
    for (const entry of recentWeekly) {
      lines.push(`- [${entry.periodKey}] ${safeTrim(entry.summary, 220)}`);
    }
  }
  if (importantFacts.length) {
    lines.push("구조화된 장기 기억:");
    for (const fact of importantFacts) {
      lines.push(`- (${fact.category}) ${safeTrim(fact.key, 48)}: ${safeTrim(fact.value, 160)}`);
    }
  }
  lines.push("오래된 기억은 압축되어 있을 수 있으므로, 최근 세션과 구조화된 사실을 우선 참고한다.");
  return trimMemoryBlock(lines.join("\n"));
}
