/**
 * @docHint
 * @purpose CardNews Canvas text가 실제 지정 family/weight로 준비됐는지 브라우저에서 fail-closed 검증
 * @process document.fonts.ready → load(font, sample) → ready/check → prepared font handle
 * @domain card-news
 * @scope browser_font_adapter
 */

import { CARD_NEWS_FONT_FAMILIES, CARD_NEWS_FONT_WEIGHTS, type CardNewsFontFamily } from "types/card-news/cardDeck";
import type { CardNewsPreparedFont } from "types/card-news/scene";
import { buildTextLayoutFontValue } from "utils/common/text-layout/fontSpec";

export type CardNewsBrowserFontRequest = {
  family: CardNewsFontFamily;
  weight: number;
  fontSizePx: number;
  lineHeightPx: number;
  sampleText: string;
  fontLoadPolicy?: CardNewsFontLoadPolicy;
};

export type CardNewsBrowserFontAdapter = {
  prepare: (request: CardNewsBrowserFontRequest) => Promise<CardNewsPreparedFont>;
};

export type CardNewsFontErrorCode =
  | "FONT_BROWSER_UNAVAILABLE"
  | "FONT_FAMILY_NOT_ALLOWED"
  | "FONT_WEIGHT_NOT_ALLOWED"
  | "FONT_EXTERNAL_GATE_BLOCKED"
  | "FONT_LOAD_FAILED";

export const CARD_NEWS_EXTERNAL_FONT_GATE = Object.freeze({
  feature: "card-news.external-google-fonts",
  releaseGate: "CN-005",
  defaultEnabled: false,
});

export type CardNewsFontLoadPolicy = {
  source?: "self-hosted" | "external-google";
  enabled?: boolean;
  releaseApproved?: boolean;
};

export type CardNewsFontPolicyEnvironment = {
  nodeEnv?: string;
  externalEnabled?: string;
  externalReleaseApproved?: string;
};

/**
 * CardNews가 실제로 사용하는 폰트 소스를 한 곳에서 결정한다.
 * 개발 미리보기는 외부 CSS를 사용할 수 있지만, 운영 빌드는 CN-005 승인 플래그가 모두 필요하다.
 */
export function getCardNewsFontLoadPolicy(environment: CardNewsFontPolicyEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  externalEnabled: process.env.NEXT_PUBLIC_CARD_NEWS_EXTERNAL_FONT_ENABLED,
  externalReleaseApproved: process.env.NEXT_PUBLIC_CARD_NEWS_EXTERNAL_FONT_RELEASE_APPROVED,
}): CardNewsFontLoadPolicy {
  const isDevelopmentPreview = environment.nodeEnv === "development";
  return {
    source: "external-google",
    enabled: isDevelopmentPreview || environment.externalEnabled === "true",
    releaseApproved: isDevelopmentPreview || environment.externalReleaseApproved === "true",
  };
}

export function assertCardNewsFontLoadPolicy(policy: CardNewsFontLoadPolicy = {}) {
  if (policy.source !== "external-google") return;
  if (!policy.enabled || !policy.releaseApproved) {
    throw new CardNewsFontError("FONT_EXTERNAL_GATE_BLOCKED");
  }
}

const externalFontStylesheets = new Set<string>();

function buildCardNewsGoogleFontStylesheetUrl(family: CardNewsFontFamily) {
  const encodedFamily = encodeURIComponent(family).replace(/%20/g, "+");
  const weights = CARD_NEWS_FONT_WEIGHTS[family].join(";");
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weights}&display=swap`;
}

export async function loadCardNewsExternalGoogleFont(family: CardNewsFontFamily, policy: CardNewsFontLoadPolicy) {
  assertCardNewsFontLoadPolicy(policy);
  if (policy.source !== "external-google") throw new CardNewsFontError("FONT_EXTERNAL_GATE_BLOCKED");
  if (typeof document === "undefined" || !document.head) throw new CardNewsFontError("FONT_BROWSER_UNAVAILABLE");
  const href = buildCardNewsGoogleFontStylesheetUrl(family);
  if (externalFontStylesheets.has(href)) return href;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.cardNewsFont = family;
  await new Promise<void>((resolve, reject) => {
    link.onload = () => resolve();
    link.onerror = () => reject(new CardNewsFontError("FONT_LOAD_FAILED"));
    document.head.appendChild(link);
  });
  externalFontStylesheets.add(href);
  return href;
}

export class CardNewsFontError extends Error {
  readonly code: CardNewsFontErrorCode;

  constructor(code: CardNewsFontErrorCode) {
    super(code);
    this.name = "CardNewsFontError";
    this.code = code;
  }
}

function assertFontRequest(request: CardNewsBrowserFontRequest) {
  if (!CARD_NEWS_FONT_FAMILIES.includes(request.family)) {
    throw new CardNewsFontError("FONT_FAMILY_NOT_ALLOWED");
  }
  if (!CARD_NEWS_FONT_WEIGHTS[request.family].includes(request.weight)) {
    throw new CardNewsFontError("FONT_WEIGHT_NOT_ALLOWED");
  }
  if (!Number.isFinite(request.fontSizePx) || request.fontSizePx <= 0 || !Number.isFinite(request.lineHeightPx) || request.lineHeightPx <= 0) {
    throw new CardNewsFontError("FONT_LOAD_FAILED");
  }
}

function normalizedFontFamily(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
}

function hasLoadedRequestedFont(face: unknown, request: CardNewsBrowserFontRequest) {
  if (!face || typeof face !== "object") return false;
  const candidate = face as { family?: unknown; weight?: unknown; status?: unknown };
  const familyMatches = normalizedFontFamily(candidate.family) === normalizedFontFamily(request.family);
  const weightMatches = new RegExp(`(?:^|\\s)${request.weight}(?:\\s|$)`).test(String(candidate.weight || ""));
  const statusMatches = candidate.status === "loaded";
  return familyMatches && weightMatches && statusMatches;
}

export async function prepareCardNewsBrowserFont(request: CardNewsBrowserFontRequest): Promise<CardNewsPreparedFont> {
  assertCardNewsFontLoadPolicy(request.fontLoadPolicy);
  assertFontRequest(request);
  if (typeof document === "undefined" || !document.fonts) {
    throw new CardNewsFontError("FONT_BROWSER_UNAVAILABLE");
  }

  const cssFont = buildTextLayoutFontValue({
    fontFamily: request.family,
    fontSizePx: request.fontSizePx,
    fontWeight: request.weight,
  });

  try {
    if (request.fontLoadPolicy?.source === "external-google") {
      await loadCardNewsExternalGoogleFont(request.family, request.fontLoadPolicy);
    }
    await document.fonts.ready;
    const loadedFonts = await document.fonts.load(cssFont, request.sampleText);
    if (!Array.isArray(loadedFonts) || !loadedFonts.some((face) => hasLoadedRequestedFont(face, request))) {
      throw new CardNewsFontError("FONT_LOAD_FAILED");
    }
    await document.fonts.ready;
    if (!document.fonts.check(cssFont, request.sampleText)) {
      throw new CardNewsFontError("FONT_LOAD_FAILED");
    }
  } catch (error) {
    if (error instanceof CardNewsFontError) throw error;
    throw new CardNewsFontError("FONT_LOAD_FAILED");
  }

  return {
    family: request.family,
    weight: request.weight,
    fontSizePx: request.fontSizePx,
    lineHeightPx: request.lineHeightPx,
    cssFont,
    sampleText: request.sampleText,
    ready: true,
  };
}

export const browserCardNewsFontAdapter: CardNewsBrowserFontAdapter = {
  prepare: prepareCardNewsBrowserFont,
};
