import "server-only";

import {
  createCardNewsAgentDeck,
  getCardNewsDeck,
  getCardNewsTemplateRegistryEntry,
  listCardNewsDecks,
} from "libs/database/lab";
import { getImageAssetByAssetId } from "libs/database/lab";
import { resolveCardNewsTemplate, listCardNewsTemplatePresets } from "libs/card-news/templateResolver";
import {
  CARD_NEWS_AGENT_CONTRACT_VERSION,
  parseCardNewsAgentDeckRequest,
  type CardNewsAgentDeckRequest,
  type CardNewsAgentDeckMetadata,
  type CardNewsDeck,
  type CardNewsTemplatePreset,
} from "types/card-news";

/**
 * @docHint
 * @purpose Agent/MCP용 CardNews 생성 입력을 검증하고 공용 resolver/repository로 연결
 * @process source·semantic 검증 → 템플릿 활성 상태 확인 → evidence 소유권 확인 → CardDeck 저장
 * @domain card-news
 * @scope server
 */

export class CardNewsAgentTemplateError extends Error {
  readonly errorCode: string;
  readonly status: number;

  constructor(errorCode: string, status = 409) {
    super(errorCode);
    this.name = "CardNewsAgentTemplateError";
    this.errorCode = errorCode;
    this.status = status;
  }
}

export class CardNewsAgentEvidenceError extends Error {
  readonly errorCode: string;
  readonly status: number;
  readonly path: string;

  constructor(errorCode: string, path: string, status = 400) {
    super(`${errorCode}:${path}`);
    this.name = "CardNewsAgentEvidenceError";
    this.errorCode = errorCode;
    this.status = status;
    this.path = path;
  }
}

function safeString(value: unknown) {
  return String(value || "").trim();
}

function isActiveBuiltInPreset(reference: { id: string; version: number }) {
  return listCardNewsTemplatePresets().find(
    (preset) => preset.id === reference.id && preset.version === reference.version,
  );
}

async function resolveAgentPreset(reference: { id: string; version: number }): Promise<CardNewsTemplatePreset> {
  const builtIn = isActiveBuiltInPreset(reference);
  if (builtIn) return builtIn;

  const registered = await getCardNewsTemplateRegistryEntry(reference);
  if (!registered) throw new CardNewsAgentTemplateError("TEMPLATE_NOT_FOUND", 400);
  if (registered.status !== "active") throw new CardNewsAgentTemplateError("TEMPLATE_INACTIVE", 409);
  return registered.preset;
}

async function assertEvidenceAccess(ownerUid: string, request: CardNewsAgentDeckRequest) {
  const evidence = request.semanticContent.cards
    .map((card, index) => ({ evidence: card.evidence, index }))
    .filter((item): item is { evidence: NonNullable<CardNewsAgentDeckRequest["semanticContent"]["cards"][number]["evidence"]>; index: number } => Boolean(item.evidence));

  await Promise.all(
    evidence.map(async ({ evidence: item, index }) => {
      if (!item.assetId) return;
      const asset = await getImageAssetByAssetId(item.assetId);
      if (!asset || safeString(asset.state) !== "active" || asset.hardDeletedAt) {
        throw new CardNewsAgentEvidenceError("EVIDENCE_ASSET_NOT_FOUND", `semanticContent.cards[${index}].evidence.assetId`, 400);
      }
      const isOwner = safeString(asset.uid) === ownerUid;
      const isPublic = safeString(asset.visibility) === "public";
      if (!isOwner && !isPublic) {
        throw new CardNewsAgentEvidenceError("EVIDENCE_ASSET_FORBIDDEN", `semanticContent.cards[${index}].evidence.assetId`, 403);
      }
    }),
  );
}

function buildAgentMetadata(request: CardNewsAgentDeckRequest, generatedAt: string): CardNewsAgentDeckMetadata {
  return {
    contractVersion: CARD_NEWS_AGENT_CONTRACT_VERSION,
    generatedBy: "agent",
    generatedAt,
    source: request.source,
    ...(request.instruction !== undefined ? { instruction: request.instruction } : {}),
    semanticContent: request.semanticContent,
  };
}

export async function createCardNewsDeckFromAgent(input: { ownerUid: string; payload: unknown }) {
  const ownerUid = safeString(input.ownerUid);
  const request = parseCardNewsAgentDeckRequest(input.payload);
  const preset = await resolveAgentPreset(request.semanticContent.template);
  await assertEvidenceAccess(ownerUid, request);
  const resolvedPayload = resolveCardNewsTemplate(request.semanticContent, preset);
  const generatedAt = new Date().toISOString();
  return createCardNewsAgentDeck({
    ownerUid,
    payload: resolvedPayload,
    agentMetadata: buildAgentMetadata(request, generatedAt),
  });
}

export async function getCardNewsDeckForAgent(input: { ownerUid: string; deckId: string }) {
  return getCardNewsDeck({ ownerUid: input.ownerUid, deckId: input.deckId });
}

export async function listCardNewsDecksForAgent(input: {
  ownerUid: string;
  limit?: number;
  skip?: number;
}) {
  return listCardNewsDecks({
    ownerUid: input.ownerUid,
    sort: "updatedAt",
    order: "desc",
    limit: input.limit,
    skip: input.skip,
  });
}

export function toCardNewsAgentDeckSummary(deck: CardNewsDeck) {
  return {
    deckId: deck.deckId,
    title: deck.title,
    aspectRatio: deck.aspectRatio,
    template: deck.template || null,
    cardCount: deck.cards.length,
    revision: deck.revision,
    state: deck.state,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    agentMetadata: deck.agentMetadata
      ? {
          contractVersion: deck.agentMetadata.contractVersion,
          generatedBy: deck.agentMetadata.generatedBy,
          generatedAt: deck.agentMetadata.generatedAt,
          source: deck.agentMetadata.source,
        }
      : null,
  };
}
