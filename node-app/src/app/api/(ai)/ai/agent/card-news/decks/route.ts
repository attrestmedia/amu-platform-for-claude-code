import { NextRequest, NextResponse } from "next/server";
import {
  createCardNewsDeckFromAgent,
  listCardNewsDecksForAgent,
  toCardNewsAgentDeckSummary,
} from "libs/server-utils/lab/cardNewsAgentDeckService";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_CARD_NEWS_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError, type UnknownRecord } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_CARD_NEWS_DECK_ENDPOINT = "ai/agent/card-news/decks";

function parseQueryInt(raw: string | null, name: string, min: number, max: number) {
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    const error = new Error(`invalid_${name}`) as Error & { errorCode: string; status: number };
    error.errorCode = "INVALID_INPUT";
    error.status = 400;
    throw error;
  }
  return value;
}

/**
 * @docHint
 * @purpose Agent/MCP가 semantic CardContent로 새 CardNews 덱을 생성하거나 자신의 덱 목록을 조회
 * @process scoped agent 인증 → fail-closed limiter → 입력/템플릿/evidence 검증 → 공용 resolver/repository
 * @domain card-news
 * @scope agent-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, {
      scope: "genstudio:card-news:read",
      allowWildcard: false,
      allowLegacyWildcard: true,
    });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_CARD_NEWS_DECK_ENDPOINT,
      limitPerMinute: AGENT_CARD_NEWS_POLICY.maxRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });

    const searchParams = new URL(request.url).searchParams;
    const limit = parseQueryInt(searchParams.get("limit"), "limit", 1, 50);
    const skip = parseQueryInt(searchParams.get("skip"), "skip", 0, 10_000);
    const result = await listCardNewsDecksForAgent({ ownerUid: auth.uid, limit, skip });
    const items = result.items.map(toCardNewsAgentDeckSummary);

    logger.info("[agent-card-news] decks listed", {
      endpoint: AGENT_CARD_NEWS_DECK_ENDPOINT,
      keyId: auth.keyId,
      keyHash: auth.keyHash,
      count: items.length,
      total: result.total,
      invalidCount: result.invalidCount,
    });

    return NextResponse.json({
      ok: true,
      data: { items, total: result.total, limit: result.limit, skip: result.skip, invalidCount: result.invalidCount },
    });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Failed to list agent CardNews decks",
    });
    logger.error("[agent-card-news] list failed", {
      endpoint: AGENT_CARD_NEWS_DECK_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, {
      scope: "genstudio:card-news:write",
      allowWildcard: false,
      allowLegacyWildcard: true,
    });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: `${AGENT_CARD_NEWS_DECK_ENDPOINT}:write`,
      limitPerMinute: AGENT_CARD_NEWS_POLICY.maxRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const deck = await createCardNewsDeckFromAgent({ ownerUid: auth.uid, payload: body });
    const evidenceCount = deck.cards.filter((card) => card.layers.some((layer) => layer.type === "image")).length;
    logger.info("[agent-card-news] deck created", {
      endpoint: `${AGENT_CARD_NEWS_DECK_ENDPOINT}:write`,
      keyId: auth.keyId,
      keyHash: auth.keyHash,
      deckId: deck.deckId,
      sourceKind: deck.agentMetadata?.source.kind,
      templateId: deck.template?.id,
      templateVersion: deck.template?.version,
      cardCount: deck.cards.length,
      evidenceCount,
    });
    return NextResponse.json({ ok: true, data: deck }, { status: 201 });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Failed to create agent CardNews deck",
    });
    logger.error("[agent-card-news] create failed", {
      endpoint: `${AGENT_CARD_NEWS_DECK_ENDPOINT}:write`,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
