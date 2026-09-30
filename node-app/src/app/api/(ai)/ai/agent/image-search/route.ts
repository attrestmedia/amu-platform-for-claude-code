import { NextRequest, NextResponse } from "next/server";
import {
  STOCK_IMAGE_SEARCH_PROVIDERS,
  searchStockImages,
  type StockImageSearchOrientation,
  type StockImageSearchProvider,
} from "libs/server-utils/api/imageSearchService";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_IMAGE_SEARCH_ENDPOINT = "ai/agent/image-search";

function toBoundedInt(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function readProviders(raw: string | null): StockImageSearchProvider[] | null {
  if (!raw?.trim()) return [...STOCK_IMAGE_SEARCH_PROVIDERS];
  const providers = Array.from(
    new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)),
  );
  if (providers.some((provider) => !STOCK_IMAGE_SEARCH_PROVIDERS.includes(provider as StockImageSearchProvider))) {
    return null;
  }
  return providers as StockImageSearchProvider[];
}

function readOrientation(raw: string | null): StockImageSearchOrientation | undefined | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return undefined;
  if (value === "landscape" || value === "portrait" || value === "square") return value;
  return null;
}

/**
 * @docHint
 * @purpose Agent/MCP에 Pexels·Pixabay·Unsplash 무료 참고 이미지 통합 검색 제공
 * @process agent 인증 -> 입력/rate-limit 검증 -> 서버측 provider 검색 -> 출처·라이선스 포함 응답
 * @domain ai-image
 * @scope agent-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:images:search" });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_IMAGE_SEARCH_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
      keyHash: auth.keyHash,
    });

    const searchParams = new URL(request.url).searchParams;
    const query = String(searchParams.get("q") || "").trim();
    const providers = readProviders(searchParams.get("providers"));
    const orientation = readOrientation(searchParams.get("orientation"));
    if (!query || query.length > 160 || !providers?.length || orientation === null) {
      return NextResponse.json(
        { ok: false, error: "invalid_search_params", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const count = toBoundedInt(searchParams.get("count"), 3, 1, 10);
    const random = searchParams.get("random") === "true";
    const result = await searchStockImages({ query, providers, count, random, orientation });
    logger.info("[agent-image-search] completed", {
      endpoint: AGENT_IMAGE_SEARCH_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      query,
      providers,
      count,
      random,
      orientation: orientation || "",
      resultCount: result.items.length,
      errors: result.errors,
    });

    return NextResponse.json({
      ok: true,
      query,
      providers,
      countPerProvider: count,
      random,
      orientation: orientation || null,
      count: result.items.length,
      data: result.items,
      errors: result.errors,
    });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Image search failed" });
    logger.error("[agent-image-search] failed", {
      endpoint: AGENT_IMAGE_SEARCH_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
