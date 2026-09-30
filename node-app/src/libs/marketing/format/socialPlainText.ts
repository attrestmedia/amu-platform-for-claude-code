import "server-only";

import { normalizeMarketingTextSymbols } from "libs/marketing/format/textSymbols";
import { isUnknownRecord, toSafeString, type UnknownRecord } from "utils/common/typeUtils";

export const MARKETING_MARKDOWN_UNSUPPORTED_SOCIAL_CHANNELS = [
  "threads",
  "instagram",
  "linkedin",
  "x",
  "twitter",
  "facebook",
] as const;

const SOCIAL_PLAIN_TEXT_FIELDS = ["title", "headline", "summary", "body", "text", "caption", "cta"] as const;

export function isMarketingPlainTextSocialChannel(channel: unknown) {
  const value = toSafeString(channel);
  return (MARKETING_MARKDOWN_UNSUPPORTED_SOCIAL_CHANNELS as readonly string[]).includes(value);
}

export function stripSocialMarkdownText(raw: unknown) {
  const text = normalizeMarketingTextSymbols(toSafeString(raw));
  if (!text) return "";

  return text
    .replace(/\r\n?/g, "\n")
    .replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^\w])\*([^*\n]+)\*([^\w]|$)/g, "$1$2$3")
    .replace(/(^|[^\w])_([^_\n]+)_([^\w]|$)/g, "$1$2$3")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizePlainTextSocialDraft<T extends UnknownRecord>(channel: unknown, draft: T): T {
  if (!isMarketingPlainTextSocialChannel(channel) || !isUnknownRecord(draft)) return draft;

  const next: UnknownRecord = { ...draft };
  for (const field of SOCIAL_PLAIN_TEXT_FIELDS) {
    if (field in next) next[field] = stripSocialMarkdownText(next[field]);
  }

  const body = stripSocialMarkdownText(next.body || next.text || next.caption);
  if (body) {
    if ("body" in next || "text" in next) next.body = body;
    if ("text" in next || "body" in next) next.text = body;
    if ("caption" in next) next.caption = body;
  }

  return next as T;
}
