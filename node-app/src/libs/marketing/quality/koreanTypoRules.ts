import "server-only";
import {
  listAllActiveMarketingTypoRules,
  recordMarketingTypoCandidate,
} from "libs/database/marketing";
import type { MarketingChannel } from "consts/marketing/queue";
import type { MarketingChannelDraft } from "libs/marketing/bridge/types";
import type { UnknownRecord } from "utils/common/typeUtils";

const REVIEW_TEXT_FIELDS_BY_CHANNEL: Record<string, string[]> = {
  threads: ["title", "text", "cta", "hashtags"],
  instagram: ["title", "caption", "body", "text", "cta", "hashtags", "tags"],
  linkedin: ["headline", "body", "text", "summary", "cta", "hashtags"],
  naver_blog: ["title", "summary", "body", "plainText", "cta", "tags"],
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toSafeString(value: unknown, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toReviewText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => toSafeString(item, 200)).filter(Boolean).join(" ");
  return toSafeString(value);
}

function getTextContext(text: string, index: number) {
  const chars = [...text];
  const start = Math.max(0, index - 16);
  const end = Math.min(chars.length, index + 17);
  return chars.slice(start, end).join("");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRuleRegex(rule: UnknownRecord) {
  const pattern = toSafeString(rule.pattern, 200);
  if (!pattern) return null;
  if (toSafeString(rule.type) === "regex") {
    try {
      return new RegExp(pattern, "gu");
    } catch {
      return null;
    }
  }
  return new RegExp(escapeRegExp(pattern), "gu");
}

function ruleAppliesToChannel(rule: UnknownRecord, channel: MarketingChannel) {
  const channels = toArray(rule.channels).map((value) => toSafeString(value, 40)).filter(Boolean);
  return channels.length === 0 || channels.includes(channel);
}

export async function validateDraftAgainstActiveTypoRules(args: {
  universeId: string;
  channel: MarketingChannel;
  draft: MarketingChannelDraft | Record<string, unknown>;
}) {
  const activeRules = await listAllActiveMarketingTypoRules({
    universeId: args.universeId,
    channel: args.channel,
  });
  const fields = REVIEW_TEXT_FIELDS_BY_CHANNEL[args.channel] || ["title", "text", "body", "summary", "plainText", "cta"];
  const findings: UnknownRecord[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];

  activeRules.forEach((ruleRaw) => {
    const rule = ruleRaw as UnknownRecord;
    if (!ruleAppliesToChannel(rule, args.channel)) return;
    const regex = buildRuleRegex(rule);
    if (!regex) return;
    const severity = toSafeString(rule.severity) || "blocking";
    const issueCode = `korean_typo_rule:${toSafeString(rule.ruleId) || toSafeString(rule.pattern, 80)}`;

    fields.forEach((field) => {
      const text = toReviewText((args.draft as Record<string, unknown>)[field]);
      if (!text) return;
      for (const match of text.matchAll(regex)) {
        const index = [...text.slice(0, match.index || 0)].length;
        findings.push({
          ruleId: toSafeString(rule.ruleId),
          pattern: toSafeString(rule.pattern, 200),
          type: toSafeString(rule.type) || "literal",
          severity,
          channel: args.channel,
          field,
          index,
          context: getTextContext(text, index),
          expected: toArray(rule.expected).map((value) => toSafeString(value, 120)).filter(Boolean),
          reason: toSafeString(rule.reason, 500),
        });
        if (severity === "blocking") issues.push(issueCode);
        else warnings.push(issueCode);
      }
    });
  });

  return {
    valid: issues.length === 0,
    findings,
    issues: Array.from(new Set(issues)),
    warnings: Array.from(new Set(warnings)),
    score: issues.length > 0 ? 30 : warnings.length > 0 ? 75 : 100,
  };
}

function normalizeCandidate(raw: unknown) {
  const item = isRecord(raw) ? raw : {};
  const pattern = toSafeString(item.pattern || item.text || item.term, 200);
  if (!pattern) return null;
  return {
    type: toSafeString(item.type, 20) || "literal",
    pattern,
    expected: toArray(item.expected || item.replacements || item.suggestions),
    reason: toSafeString(item.reason || item.summary, 500),
    channel: toSafeString(item.channel, 40),
    field: toSafeString(item.field, 80),
    context: toSafeString(item.context, 500),
  };
}

export function extractTypoCandidatesFromValidation(report: unknown) {
  const record = isRecord(report) ? report : {};
  const checks = isRecord(record.checks) ? record.checks : {};
  const proofread = isRecord(checks.koreanProofread) ? checks.koreanProofread : {};
  return [
    ...toArray(record.koreanTypoCandidates),
    ...toArray(proofread.candidates),
    ...toArray(record.typoCandidates),
  ]
    .map(normalizeCandidate)
    .filter(Boolean) as Array<NonNullable<ReturnType<typeof normalizeCandidate>>>;
}

export async function recordTypoCandidatesFromValidation(args: {
  universeId: string;
  jobId: string;
  channel: MarketingChannel;
  validation: unknown;
  createdBy?: string;
  modelName?: string;
}) {
  const candidates = extractTypoCandidatesFromValidation(args.validation);
  if (candidates.length === 0) return [];

  const docs = [];
  for (const candidate of candidates.slice(0, 20)) {
    const doc = await recordMarketingTypoCandidate({
      universeId: args.universeId,
      jobId: args.jobId,
      channel: candidate.channel || args.channel,
      field: candidate.field,
      context: candidate.context,
      type: candidate.type,
      pattern: candidate.pattern,
      expected: candidate.expected,
      reason: candidate.reason,
      channels: [candidate.channel || args.channel],
      source: "ai_validation",
      createdBy: args.createdBy,
      modelName: args.modelName,
    });
    if (doc) docs.push(doc);
  }
  return docs;
}
