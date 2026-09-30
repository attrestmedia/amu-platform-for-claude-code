import "server-only";
import { getRedisClient } from "libs/cache/redisClient";
import { logger } from "utils/log";
import { toErrorLike } from "utils/common/typeUtils";

function codedError(message: string, errorCode: string, status = 400) {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

function toPositiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function toBoolean(raw: string | undefined, fallback = false) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function getDayStamp(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getMinuteTtl(now: Date) {
  return Math.max(1, Math.ceil((60_000 - (now.getTime() % 60_000)) / 1000));
}

function getDayTtl(now: Date) {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((nextDay.getTime() - now.getTime()) / 1000));
}

async function incrWithExpire(key: string, ttlSeconds: number, amount = 1) {
  const client = await getRedisClient();
  const script = `
    local c = redis.call("INCRBY", KEYS[1], ARGV[1])
    if c == tonumber(ARGV[1]) then
      redis.call("EXPIRE", KEYS[1], ARGV[2])
    end
    return c
  `;
  const result: unknown = await client.eval(script, 1, key, String(amount), String(ttlSeconds));
  const count = typeof result === "number" ? result : parseInt(String(result), 10);
  return Number.isFinite(count) ? count : 0;
}

async function getCounterValue(key: string) {
  const client = await getRedisClient();
  const raw = await client.get(key);
  const value = parseInt(String(raw || "0"), 10);
  return Number.isFinite(value) ? value : 0;
}

export const AGENT_IMAGE_POLICY = {
  defaultProvider: "zai",
  allowedProviders: ["google", "openai", "xai", "zai"] as const,
  defaultModelByProvider: {
    google: "gemini-2.5-flash-image",
    openai: "gpt-image-2.5-flare",
    xai: "grok-imagine-image",
    zai: "glm-image",
  } as const,
  allowedModelsByProvider: {
    google: ["gemini-2.5-flash-image", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"] as const,
    openai: ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"] as const,
    xai: ["grok-imagine-image", "grok-imagine-image-2.0"] as const,
    zai: ["glm-image"] as const,
  } as const,
  maxPromptCharsByProvider: {
    zai: 1000,
  } as const,
  defaultGoogleSize: "1K",
  defaultVisibility: "public" as const,
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_IMAGE_MAX_REQUESTS_PER_MINUTE, 6),
  maxListRequestsPerMinute: toPositiveInt(process.env.AGENT_IMAGE_LIST_MAX_REQUESTS_PER_MINUTE, 20),
  maxImagesPerRequest: toPositiveInt(process.env.AGENT_IMAGE_MAX_IMAGES_PER_REQUEST, 2),
  maxImagesPerDay: toPositiveInt(process.env.AGENT_IMAGE_MAX_IMAGES_PER_DAY, 40),
  maxPromptChars: toPositiveInt(process.env.AGENT_IMAGE_MAX_PROMPT_CHARS, 4000),
} as const;

export const AGENT_CONTENT_POLICY = {
  defaultProvider: "openai",
  defaultModelByProvider: {
    google: "gemini-3.8-flash",
    openai: "gpt-5.6-terra",
    claude: "claude-sonnet-5",
    deepseek: "deepseek-v4-pro",
    xai: "grok-4.7",
    zai: "glm-5.3-flash",
  } as const,
  defaultVisibility: "public" as const,
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_CONTENT_MAX_REQUESTS_PER_MINUTE, 10),
  maxReadRequestsPerMinute: toPositiveInt(process.env.AGENT_CONTENT_READ_MAX_REQUESTS_PER_MINUTE, 20),
  maxReadAssetsPerRequest: toPositiveInt(process.env.AGENT_CONTENT_READ_MAX_ASSETS_PER_REQUEST, 5),
  maxTemplateKeyChars: 160,
  maxVariableCount: 40,
  maxVariableChars: 12_000,
  maxVariablesTotalChars: 30_000,
  maxExtraPromptChars: 4_000,
  minOutputTokens: 256,
  maxOutputTokens: 12_288,
  maxThinkingBudget: 4_096,
} as const;

export const AGENT_VIDEO_POLICY = {
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_VIDEO_MAX_REQUESTS_PER_MINUTE, 2),
  maxReadRequestsPerMinute: toPositiveInt(process.env.AGENT_VIDEO_READ_MAX_REQUESTS_PER_MINUTE, 20),
  maxPromptChars: toPositiveInt(process.env.AGENT_VIDEO_MAX_PROMPT_CHARS, 4000),
  maxReferenceImages: toPositiveInt(process.env.AGENT_VIDEO_MAX_REFERENCE_IMAGES, 3),
} as const;

// EL-503 — audio는 유료 생성 경로다. 생성 기본값은 video와 같은 보수값(2/분),
// 읽기·견적은 별도 카운터로 분리한다. maxTextChars는 studioAudioContract의 4096 상한과 맞춘다.
export const AGENT_AUDIO_POLICY = {
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_AUDIO_MAX_REQUESTS_PER_MINUTE, 2),
  maxReadRequestsPerMinute: toPositiveInt(process.env.AGENT_AUDIO_READ_MAX_REQUESTS_PER_MINUTE, 20),
  maxEstimateRequestsPerMinute: toPositiveInt(process.env.AGENT_AUDIO_ESTIMATE_MAX_REQUESTS_PER_MINUTE, 10),
  maxTextChars: toPositiveInt(process.env.AGENT_AUDIO_MAX_TEXT_CHARS, 4096),
} as const;

export const AGENT_CARD_NEWS_POLICY = {
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_CARD_NEWS_MAX_REQUESTS_PER_MINUTE, 20),
  maxCardsPerRequest: 10,
} as const;

// WordPress cleanup은 auth·resource allowlist·scope 검증을 유지한 채 별도 운영 플래그로만 limiter를 해제한다.
//
// 2026-09-18 — wp-proxy·wp-posts의 분당 한도를 이미지 목록 한도(AGENT_IMAGE_POLICY.maxListRequestsPerMinute, 기본 20)와
// 분리했다. 종전에는 성격이 다른 두 경로가 같은 상수를 공유해서, 이미지 한도를 건드리지 않고는 매거진 등록 처리량을
// 조정할 수 없었다. 기사 1건 등록은 slug 조회·본문 갱신·term 조회·Yoast meta 검증으로 wp-proxy 요청을 10~25회 쓰므로
// 20/분에서는 사실상 1건/분이 상한이었고, 같은 기사 리뉴얼은 라이브를 draft로 먼저 강등시키므로 429가 곧 오프라인
// 시간이 됐다(2026-09-12 실측 — production 15003이 약 3분간 404). 대량 사이클에서는 등록 주체가 리더 1세션이라
// 폭주 방지 상한은 유지하되 값을 등록 실사용량에 맞춘다. 저장소 장애 시 동작(fail-open)은 바꾸지 않는다 —
// 이 경로는 코인·과금 경로가 아니다(server-economy-security.md의 fail-closed 대상이 아님).
export const AGENT_WP_PROXY_POLICY = {
  cleanupWriteRateLimitDisabled: toBoolean(process.env.AGENT_WP_CLEANUP_RATE_LIMIT_DISABLED),
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_WP_PROXY_MAX_REQUESTS_PER_MINUTE, 120),
  maxReadRequestsPerMinute: toPositiveInt(process.env.AGENT_WP_POSTS_MAX_REQUESTS_PER_MINUTE, 60),
} as const;

// ai-model-tracker가 provider 자격증명을 직접 보관하지 않도록 서버가 대행하는 조회 경로.
// 무과금(provider /models 조회)이지만 자격증명 대행이므로 fail-closed로 운영한다.
export const AGENT_PROVIDER_CATALOG_POLICY = {
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_PROVIDER_CATALOG_MAX_REQUESTS_PER_MINUTE, 20),
  upstreamTimeoutMs: toPositiveInt(process.env.AGENT_PROVIDER_CATALOG_UPSTREAM_TIMEOUT_MS, 30_000),
} as const;

// 가격 문서 AI 추출은 Gemini 유료 호출이다. 모델·출력 상한·tools를 서버가 고정하고
// limiter 저장소 장애 시 차단한다(server-economy-security fail-closed).
export const AGENT_PRICING_EXTRACTION_POLICY = {
  maxRequestsPerMinute: toPositiveInt(process.env.AGENT_PRICING_EXTRACTION_MAX_REQUESTS_PER_MINUTE, 10),
  maxPromptChars: toPositiveInt(process.env.AGENT_PRICING_EXTRACTION_MAX_PROMPT_CHARS, 20_000),
  maxOutputTokens: toPositiveInt(process.env.AGENT_PRICING_EXTRACTION_MAX_OUTPUT_TOKENS, 512),
  upstreamTimeoutMs: toPositiveInt(process.env.AGENT_PRICING_EXTRACTION_UPSTREAM_TIMEOUT_MS, 60_000),
} as const;

type AgentRequestLimitArgs = {
  uid: string;
  endpoint: string;
  limitPerMinute: number;
  keyHash?: string;
  failClosed?: boolean;
};

type AgentDailyImageLimitArgs = {
  uid: string;
  endpoint: string;
  requestedImages: number;
  keyHash?: string;
};

function getMinuteKey(uid: string, endpoint: string) {
  return `ratelimit:agent:${uid}:${endpoint}:minute`;
}

function getDailyImageKey(uid: string, endpoint: string, now: Date) {
  return `ratelimit:agent:${uid}:${endpoint}:images:${getDayStamp(now)}`;
}

export async function enforceAgentRequestRateLimit({
  uid,
  endpoint,
  limitPerMinute,
  keyHash,
  failClosed = false,
}: AgentRequestLimitArgs) {
  const now = new Date();

  try {
    const count = await incrWithExpire(getMinuteKey(uid, endpoint), getMinuteTtl(now));

    if (count > limitPerMinute) {
      logger.warn("[agent-rate-limit] request limit exceeded", {
        endpoint,
        uid,
        keyHash,
        limitPerMinute,
        count,
      });
      throw codedError("agent_rate_limit_exceeded", "RATE_LIMITED", 429);
    }
  } catch (error) {
    if (toErrorLike(error).errorCode) throw error;
    if (failClosed) {
      logger.error("[agent-rate-limit] request limiter unavailable; blocking request", {
        endpoint,
        uid,
        keyHash,
        error: error instanceof Error ? error.message : String(error),
      });
      throw codedError("agent_rate_limit_unavailable", "RATE_LIMIT_UNAVAILABLE", 503);
    }
    logger.warn("[agent-rate-limit] request limiter unavailable; allowing request", {
      endpoint,
      uid,
      keyHash,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function enforceAgentDailyImageLimit({
  uid,
  endpoint,
  requestedImages,
  keyHash,
}: AgentDailyImageLimitArgs) {
  const now = new Date();
  const safeRequested = Math.max(1, Math.floor(requestedImages || 1));

  try {
    const key = getDailyImageKey(uid, endpoint, now);
    const current = await getCounterValue(key);

    if (current + safeRequested > AGENT_IMAGE_POLICY.maxImagesPerDay) {
      logger.warn("[agent-rate-limit] daily image limit exceeded", {
        endpoint,
        uid,
        keyHash,
        current,
        requestedImages: safeRequested,
        maxImagesPerDay: AGENT_IMAGE_POLICY.maxImagesPerDay,
      });
      throw codedError("agent_daily_image_limit_exceeded", "DAILY_LIMIT_EXCEEDED", 429);
    }
  } catch (error) {
    if (toErrorLike(error).errorCode) throw error;
    logger.warn("[agent-rate-limit] daily limiter unavailable; allowing request", {
      endpoint,
      uid,
      keyHash,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function commitAgentImageUsage(args: {
  uid: string;
  endpoint: string;
  generatedImages: number;
  keyHash?: string;
}) {
  const now = new Date();
  const generatedImages = Math.max(0, Math.floor(args.generatedImages || 0));
  if (generatedImages <= 0) return;

  try {
    await incrWithExpire(getDailyImageKey(args.uid, args.endpoint, now), getDayTtl(now), generatedImages);
  } catch (error) {
    logger.warn("[agent-rate-limit] failed to persist daily image usage", {
      endpoint: args.endpoint,
      uid: args.uid,
      keyHash: args.keyHash,
      generatedImages,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
