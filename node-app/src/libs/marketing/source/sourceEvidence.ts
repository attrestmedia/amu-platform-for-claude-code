import type { MarketingSourceSnapshot } from "libs/marketing/bridge/types";
import { decodeHtmlEntities } from "utils/common";

type SourceEvidenceInput = {
  title?: unknown;
  contentHtml?: unknown;
  contentText?: unknown;
  excerptText?: unknown;
  categories?: unknown;
  tags?: unknown;
};

const SOURCE_SECTION_LIMIT = 12;
const SECTION_PARAGRAPH_LIMIT = 4;
const SOURCE_QUOTE_LIMIT = 8;
const KEY_TERM_LIMIT = 24;
const ALLOWED_CLAIM_LIMIT = 8;
const TEXT_BLOCK_MAX = 900;

function toSafeString(value: unknown, max = 2000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function toStringArray(values: unknown, limit: number, maxLength = 120) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => toSafeString(value, maxLength)).filter(Boolean)),
  ).slice(0, limit);
}

function toPlainText(raw: unknown, max = TEXT_BLOCK_MAX) {
  return decodeHtmlEntities(
    toSafeString(
      String(raw || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
      max,
    ),
  );
}

function appendParagraph(
  sections: NonNullable<MarketingSourceSnapshot["outline"]>,
  heading: string,
  paragraph: string,
) {
  const text = toSafeString(paragraph, TEXT_BLOCK_MAX);
  if (!text) return;

  if (sections.length === 0) {
    sections.push({ heading, paragraphs: [] });
  }

  const current = sections[sections.length - 1];
  if (current.paragraphs.length < SECTION_PARAGRAPH_LIMIT) {
    current.paragraphs.push(text);
  }
}

function buildOutlineFromHtml(contentHtml: unknown, fallbackText: unknown) {
  const html = String(contentHtml || "");
  const sections: NonNullable<MarketingSourceSnapshot["outline"]> = [];
  const blockRe = /<(h[2-4]|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(html)) && sections.length < SOURCE_SECTION_LIMIT) {
    const tagName = match[1].toLowerCase();
    const text = toPlainText(match[2], TEXT_BLOCK_MAX);
    if (!text) continue;

    if (tagName.startsWith("h")) {
      sections.push({ heading: text.slice(0, 120), paragraphs: [] });
      continue;
    }

    appendParagraph(sections, "본문", text);
  }

  const filledSections = sections.filter((section) => section.paragraphs.length > 0);
  if (filledSections.length > 0) return filledSections.slice(0, SOURCE_SECTION_LIMIT);

  const fallback = toSafeString(fallbackText, 50000);
  const paragraphs = fallback
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((value) => toSafeString(value, TEXT_BLOCK_MAX))
    .filter(Boolean)
    .slice(0, SECTION_PARAGRAPH_LIMIT);

  return paragraphs.length ? [{ heading: "본문", paragraphs }] : [];
}

function buildSourceQuotes(outline: NonNullable<MarketingSourceSnapshot["outline"]>) {
  return Array.from(
    new Set(
      outline
        .flatMap((section) => section.paragraphs)
        .map((paragraph) => toSafeString(paragraph, 220))
        .filter((paragraph) => paragraph.length >= 24),
    ),
  ).slice(0, SOURCE_QUOTE_LIMIT);
}

function extractTaggedTerms(contentHtml: unknown) {
  const html = String(contentHtml || "");
  const terms: string[] = [];
  const tagRe = /<(strong|b|a|em)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) && terms.length < KEY_TERM_LIMIT) {
    const text = toPlainText(match[2], 80);
    if (text.length >= 2 && text.length <= 40) terms.push(text);
  }

  return terms;
}

function buildKeyTerms(input: SourceEvidenceInput, outline: NonNullable<MarketingSourceSnapshot["outline"]>) {
  const candidates = [
    toSafeString(input.title, 120),
    ...toStringArray(input.categories, 12, 60),
    ...toStringArray(input.tags, 12, 60),
    ...outline.map((section) => section.heading),
    ...extractTaggedTerms(input.contentHtml),
  ];

  return Array.from(
    new Set(
      candidates
        .flatMap((value) => value.split(/[|,/·:()[\]{}"'“”‘’]+/))
        .map((value) => toSafeString(value, 60))
        .filter((value) => /[A-Za-z가-힣]/.test(value) && value.length >= 2 && value.length <= 40),
    ),
  ).slice(0, KEY_TERM_LIMIT);
}

function buildAllowedClaims(outline: NonNullable<MarketingSourceSnapshot["outline"]>) {
  return Array.from(
    new Set(
      outline
        .flatMap((section) => section.paragraphs)
        .map((paragraph) => toSafeString(paragraph.split(/(?<=[.!?。！？])\s+/)[0] || paragraph, 220))
        .filter((claim) => claim.length >= 24),
    ),
  ).slice(0, ALLOWED_CLAIM_LIMIT);
}

function normalizeOutline(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((section) => {
      const record = section && typeof section === "object" && !Array.isArray(section) ? section : {};
      const heading = toSafeString((record as { heading?: unknown }).heading, 120);
      const paragraphs = toStringArray((record as { paragraphs?: unknown }).paragraphs, SECTION_PARAGRAPH_LIMIT, TEXT_BLOCK_MAX);
      return heading && paragraphs.length ? { heading, paragraphs } : null;
    })
    .filter((section): section is { heading: string; paragraphs: string[] } => Boolean(section))
    .slice(0, SOURCE_SECTION_LIMIT);
}

export function withMarketingSourceEvidence<T extends Partial<MarketingSourceSnapshot>>(
  snapshot: T,
  input: SourceEvidenceInput = {},
) {
  const outline = normalizeOutline(snapshot.outline);
  const nextOutline = outline.length ? outline : buildOutlineFromHtml(input.contentHtml, input.contentText || snapshot.contentText);
  const sourceQuotes = toStringArray(snapshot.sourceQuotes, SOURCE_QUOTE_LIMIT, 240);
  const keyTerms = toStringArray(snapshot.keyTerms, KEY_TERM_LIMIT, 80);
  const allowedClaims = toStringArray(snapshot.allowedClaims, ALLOWED_CLAIM_LIMIT, 240);

  return {
    ...snapshot,
    outline: nextOutline,
    sourceQuotes: sourceQuotes.length ? sourceQuotes : buildSourceQuotes(nextOutline),
    keyTerms: keyTerms.length ? keyTerms : buildKeyTerms(input, nextOutline),
    allowedClaims: allowedClaims.length ? allowedClaims : buildAllowedClaims(nextOutline),
  };
}
