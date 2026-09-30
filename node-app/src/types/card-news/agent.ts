/**
 * @docHint
 * @purpose Agent가 생성한 semantic CardContent와 CardDeck 메타데이터 계약
 * @process source 선택 → semantic 입력 검증 → Template Resolver → CardDeck 저장
 * @domain card-news
 * @scope shared
 */

import type {
  CardNewsAspectRatio,
  CardNewsImageFit,
  CardNewsTemplateReference,
} from "./cardDeck";
import type {
  CardNewsSemanticCard,
  CardNewsSemanticCardContent,
  CardNewsSemanticEvidence,
  CardNewsTemplateCardRole,
} from "./template";

export const CARD_NEWS_AGENT_CONTRACT_VERSION = 1 as const;
export type CardNewsAgentSourceKind = "wp_article" | "operator_instruction" | "interactive_session";

export type CardNewsAgentSource = {
  kind: CardNewsAgentSourceKind;
  ref?: string;
  url?: string;
  title?: string;
};

export type CardNewsAgentDeckRequest = {
  source: CardNewsAgentSource;
  instruction?: string;
  semanticContent: CardNewsSemanticCardContent;
};

export type CardNewsAgentDeckMetadata = {
  contractVersion: typeof CARD_NEWS_AGENT_CONTRACT_VERSION;
  generatedBy: "agent";
  generatedAt: string;
  source: CardNewsAgentSource;
  instruction?: string;
  semanticContent: CardNewsSemanticCardContent;
};

export class CardNewsAgentInputError extends Error {
  readonly errorCode = "INVALID_CARD_NEWS_AGENT_INPUT";
  readonly status = 400;
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}:${message}`);
    this.name = "CardNewsAgentInputError";
    this.path = path;
  }
}

type UnknownRecord = Record<string, unknown>;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROXY_IMAGE_URL = /^\/api\/proxy\/image\?(?:[^#]*&)?url=/i;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertRecord(value: unknown, path: string): asserts value is UnknownRecord {
  if (!isRecord(value)) throw new CardNewsAgentInputError(path, "object_required");
}

function assertKeys(value: UnknownRecord, allowed: readonly string[], path: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new CardNewsAgentInputError(`${path}.${key}`, "field_not_allowed");
  }
}

function requiredString(value: unknown, path: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CardNewsAgentInputError(path, "string_required");
  }
  if (value.length > maxLength) throw new CardNewsAgentInputError(path, "too_long");
  return value;
}

function optionalString(value: unknown, path: string, maxLength: number) {
  if (value === undefined) return undefined;
  return requiredString(value, path, maxLength);
}

function parseSource(value: unknown): CardNewsAgentSource {
  assertRecord(value, "source");
  assertKeys(value, ["kind", "ref", "url", "title"], "source");
  const kind = value.kind;
  if (kind !== "wp_article" && kind !== "operator_instruction" && kind !== "interactive_session") {
    throw new CardNewsAgentInputError("source.kind", "unsupported_source_kind");
  }
  const ref = optionalString(value.ref, "source.ref", 240);
  const url = optionalString(value.url, "source.url", 2_000);
  const title = optionalString(value.title, "source.title", 240);
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new CardNewsAgentInputError("source.url", "valid_url_required");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new CardNewsAgentInputError("source.url", "http_url_required");
    }
  }
  if (kind === "wp_article" && !ref && !url) {
    throw new CardNewsAgentInputError("source", "wp_article_ref_or_url_required");
  }
  if (kind === "interactive_session" && !ref) {
    throw new CardNewsAgentInputError("source.ref", "interactive_session_ref_required");
  }
  return { kind, ...(ref ? { ref } : {}), ...(url ? { url } : {}), ...(title ? { title } : {}) };
}

function parseFocalPoint(value: unknown, path: string) {
  assertRecord(value, path);
  assertKeys(value, ["x", "y"], path);
  const x = value.x;
  const y = value.y;
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1) {
    throw new CardNewsAgentInputError(`${path}.x`, "normalized_number_required");
  }
  if (typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > 1) {
    throw new CardNewsAgentInputError(`${path}.y`, "normalized_number_required");
  }
  return { x, y };
}

function parseEvidence(value: unknown, path: string): CardNewsSemanticEvidence {
  assertRecord(value, path);
  assertKeys(value, ["assetId", "proxyUrl", "altText", "fit", "focalPoint"], path);
  const assetId = optionalString(value.assetId, `${path}.assetId`, 128);
  const proxyUrl = optionalString(value.proxyUrl, `${path}.proxyUrl`, 2_000);
  if (Boolean(assetId) === Boolean(proxyUrl)) {
    throw new CardNewsAgentInputError(path, "exactly_one_evidence_reference_required");
  }
  if (assetId && !SAFE_ID.test(assetId)) throw new CardNewsAgentInputError(`${path}.assetId`, "safe_id_required");
  if (proxyUrl && !PROXY_IMAGE_URL.test(proxyUrl)) {
    throw new CardNewsAgentInputError(`${path}.proxyUrl`, "proxy_image_url_required");
  }
  const altText = optionalString(value.altText, `${path}.altText`, 500);
  const fit = value.fit;
  if (fit !== undefined && fit !== "cover" && fit !== "contain" && fit !== "fill") {
    throw new CardNewsAgentInputError(`${path}.fit`, "unsupported_image_fit");
  }
  const focalPoint = value.focalPoint === undefined ? undefined : parseFocalPoint(value.focalPoint, `${path}.focalPoint`);
  return {
    ...(assetId ? { assetId } : {}),
    ...(proxyUrl ? { proxyUrl } : {}),
    ...(altText !== undefined ? { altText } : {}),
    ...(fit ? { fit: fit as CardNewsImageFit } : {}),
    ...(focalPoint ? { focalPoint } : {}),
  };
}

function parseCard(value: unknown, index: number): CardNewsSemanticCard {
  const path = `semanticContent.cards[${index}]`;
  assertRecord(value, path);
  assertKeys(value, ["role", "eyebrow", "headline", "body", "cta", "evidence", "altText"], path);
  const role = value.role;
  if (role !== "cover" && role !== "body" && role !== "closing") {
    throw new CardNewsAgentInputError(`${path}.role`, "unsupported_card_role");
  }
  const headline = requiredString(value.headline, `${path}.headline`, 3_000);
  const eyebrow = optionalString(value.eyebrow, `${path}.eyebrow`, 3_000);
  const body = optionalString(value.body, `${path}.body`, 3_000);
  const cta = optionalString(value.cta, `${path}.cta`, 3_000);
  const altText = optionalString(value.altText, `${path}.altText`, 500);
  const evidence = value.evidence === undefined ? undefined : parseEvidence(value.evidence, `${path}.evidence`);
  return {
    role: role as CardNewsTemplateCardRole,
    headline,
    ...(eyebrow !== undefined ? { eyebrow } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(cta !== undefined ? { cta } : {}),
    ...(evidence ? { evidence } : {}),
    ...(altText !== undefined ? { altText } : {}),
  };
}

function parseSemanticContent(value: unknown): CardNewsSemanticCardContent {
  assertRecord(value, "semanticContent");
  assertKeys(value, ["title", "aspectRatio", "template", "cards"], "semanticContent");
  const title = requiredString(value.title, "semanticContent.title", 120);
  const aspectRatio = value.aspectRatio;
  if (aspectRatio !== "1:1" && aspectRatio !== "4:5") {
    throw new CardNewsAgentInputError("semanticContent.aspectRatio", "unsupported_aspect_ratio");
  }
  assertRecord(value.template, "semanticContent.template");
  assertKeys(value.template, ["id", "version"], "semanticContent.template");
  const templateId = requiredString(value.template.id, "semanticContent.template.id", 128);
  if (!SAFE_ID.test(templateId)) throw new CardNewsAgentInputError("semanticContent.template.id", "safe_id_required");
  const templateVersion = value.template.version;
  if (typeof templateVersion !== "number" || !Number.isInteger(templateVersion) || templateVersion < 1 || templateVersion > 100) {
    throw new CardNewsAgentInputError("semanticContent.template.version", "positive_integer_required");
  }
  if (!Array.isArray(value.cards) || value.cards.length < 3 || value.cards.length > 10) {
    throw new CardNewsAgentInputError("semanticContent.cards", "card_count_must_be_3_to_10");
  }
  const cards = value.cards.map((card, index) => parseCard(card, index));
  return {
    title,
    aspectRatio: aspectRatio as CardNewsAspectRatio,
    template: { id: templateId, version: templateVersion } satisfies CardNewsTemplateReference,
    cards,
  };
}

export function parseCardNewsAgentDeckRequest(value: unknown): CardNewsAgentDeckRequest {
  assertRecord(value, "payload");
  assertKeys(value, ["source", "instruction", "semanticContent"], "payload");
  const source = parseSource(value.source);
  const instruction = optionalString(value.instruction, "instruction", 4_000);
  if (source.kind === "operator_instruction" && !instruction?.trim()) {
    throw new CardNewsAgentInputError("instruction", "operator_instruction_required");
  }
  return {
    source,
    ...(instruction !== undefined ? { instruction } : {}),
    semanticContent: parseSemanticContent(value.semanticContent),
  };
}
