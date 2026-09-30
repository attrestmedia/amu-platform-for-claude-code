import { NextRequest, NextResponse } from "next/server";
import { getCardNewsDeckForAgent } from "libs/server-utils/lab/cardNewsAgentDeckService";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_CARD_NEWS_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_CARD_NEWS_DECK_ENDPOINT = "ai/agent/card-news/decks/:deckId";

/**
 * @docHint
 * @purpose Agent/MCP가 자신이 만든 CardNews 덱 하나를 조회
 * @process scoped agent 인증 → fail-closed limiter → owner-scoped repository read
 * @domain card-news
 * @scope agent-api
 */
export async function GET(request: NextRequest, context: { params: Promise<{ deckId: string }> }) {
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

    const { deckId } = await context.params;
    const deck = await getCardNewsDeckForAgent({ ownerUid: auth.uid, deckId });
    if (deck === "forbidden") {
      return NextResponse.json({ ok: false, error: "deck_forbidden", errorCode: "FORBIDDEN" }, { status: 403 });
    }
    if (!deck) {
      return NextResponse.json({ ok: false, error: "deck_not_found", errorCode: "NOT_FOUND" }, { status: 404 });
    }

    logger.info("[agent-card-news] deck fetched", {
      endpoint: AGENT_CARD_NEWS_DECK_ENDPOINT,
      keyId: auth.keyId,
      keyHash: auth.keyHash,
      deckId: deck.deckId,
      templateId: deck.template?.id,
      templateVersion: deck.template?.version,
      cardCount: deck.cards.length,
    });
    return NextResponse.json({ ok: true, data: deck });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Failed to fetch agent CardNews deck",
    });
    logger.error("[agent-card-news] fetch failed", {
      endpoint: AGENT_CARD_NEWS_DECK_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
