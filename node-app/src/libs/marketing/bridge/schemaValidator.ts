import { THREADS_POST_TEXT_MAX_LEN } from "consts/thirdparty/threads";
import type { MarketingChannelDraft, MarketingValidationReport } from "./types";

type ChannelFitVerdict = NonNullable<MarketingValidationReport["channelFit"]>["verdict"];
type ScoreSignal = NonNullable<MarketingValidationReport["channelFit"]>["signal"];

const COPY_FIELDS_BY_CHANNEL: Partial<Record<MarketingChannelDraft["channel"], readonly string[]>> = {
  threads: ["title", "text", "cta", "reply"],
  instagram: ["title", "caption", "body", "text", "cta", "reply"],
  linkedin: ["headline", "body", "text", "summary", "cta", "reply"],
  naver_blog: ["title", "summary", "body", "html", "plainText", "cta", "reply"],
};

const INLINE_HASHTAG_TOKEN_RE = /#[\p{L}\p{N}_]+/gu;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toArray(values: unknown, limit = 10) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => toSafeString(value))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function findInlineHashtags(channel: MarketingChannelDraft["channel"], draft: Record<string, unknown>) {
  const fields: string[] = [];
  const tokens = new Set<string>();

  for (const field of COPY_FIELDS_BY_CHANNEL[channel] ?? []) {
    const matches = toSafeString(draft[field]).match(INLINE_HASHTAG_TOKEN_RE) ?? [];
    if (matches.length === 0) continue;
    fields.push(field);
    for (const token of matches) tokens.add(token);
  }

  return { fields, tokens: Array.from(tokens) };
}

function toSignal(score: number): ScoreSignal {
  if (score >= 85) return "green";
  if (score >= 70) return "yellow";
  return "red";
}

function toVerdict(score: number): ChannelFitVerdict {
  if (score >= 85) return "positive";
  if (score >= 70) return "conditional";
  return "negative";
}

function buildChannelFitReport(args: {
  channel: MarketingChannelDraft["channel"];
  draft: Record<string, unknown>;
  issues: string[];
  warnings: string[];
  valid: boolean;
}) {
  const baseScore = args.valid ? Math.max(70, 100 - args.warnings.length * 5) : Math.max(0, 60 - args.issues.length * 15);
  const text = toSafeString(args.draft.text || args.draft.body || args.draft.caption || args.draft.plainText);
  const hasCta = Boolean(toSafeString(args.draft.cta));
  const hasLink = Boolean(toSafeString(args.draft.linkUrl || args.draft.commentLink));
  const hasTags = toArray(args.draft.hashtags || args.draft.tags).length > 0;
  const hasImage = Boolean(toSafeString(args.draft.imageUrl || args.draft.image_url));

  const axes = {
    tone: Math.max(0, 20 - args.warnings.filter((item) => item.includes("markdown") || item.includes("typo")).length * 3),
    format: Math.max(0, 15 - args.issues.length * 3),
    discoverability: Math.max(0, 20 - (hasTags ? 0 : 4) - (text.length > 0 ? 0 : 8)),
    conversion: Math.max(0, 15 - (hasCta ? 0 : 4) - (hasLink ? 0 : 3)),
    grounding: Math.max(0, 15 - (hasLink ? 0 : 4)),
    riskFree: Math.max(0, 15 - args.issues.length * 4 - args.warnings.length * 2),
  };

  if (args.channel === "instagram" && !hasImage) {
    axes.format = Math.max(0, axes.format - 5);
    axes.discoverability = Math.max(0, axes.discoverability - 5);
  }

  const axisScore = Object.values(axes).reduce((sum, value) => sum + value, 0);
  const score = Math.max(0, Math.min(100, Math.round((baseScore + axisScore) / 2)));
  const signal = toSignal(score);

  return {
    score,
    verdict: toVerdict(score),
    signal,
    axes,
    expectedExposure: score >= 85 ? ("high" as const) : score >= 70 ? ("medium" as const) : ("low" as const),
    notes: {
      basis: "기본 스키마 검증, CTA/link/tag/image 준비 상태를 기반으로 산출한 1차 채널 적합도입니다.",
    },
  };
}

function buildImpactScoreReport(channelFit: ReturnType<typeof buildChannelFitReport>, issues: string[], warnings: string[]) {
  const riskPenalty = issues.length * 8 + warnings.length * 3;
  const measurementReady = channelFit.axes.grounding >= 12 && channelFit.axes.conversion >= 10;
  const score = Math.max(0, Math.min(100, Math.round(channelFit.score - riskPenalty * 0.2 + (measurementReady ? 3 : 0))));
  const signal = toSignal(score);
  const recommendations: Array<{ action: string; expectedDelta: number; reason: string }> = [];

  if (channelFit.axes.discoverability < 16) {
    recommendations.push({ action: "improve_discoverability", expectedDelta: 4, reason: "태그, 첫 문장 훅, 채널 노출 요소를 보완하세요." });
  }
  if (channelFit.axes.conversion < 12) {
    recommendations.push({ action: "strengthen_cta", expectedDelta: 3, reason: "CTA 또는 추적 가능한 링크가 약합니다." });
  }
  if (channelFit.axes.format < 12) {
    recommendations.push({ action: "fix_channel_format", expectedDelta: 5, reason: "채널 필수 형식 또는 이미지 요구사항을 충족해야 합니다." });
  }

  return {
    score,
    signal,
    direction: signal === "green" ? ("positive" as const) : signal === "yellow" ? ("positive_with_fixes" as const) : ("negative" as const),
    confidence: issues.length > 0 ? ("medium" as const) : ("high" as const),
    recommendations,
  };
}

export function validateMarketingChannelDraft(
  channel: MarketingChannelDraft["channel"],
  draft: Record<string, unknown>,
): MarketingValidationReport {
  const issues: string[] = [];
  const warnings: string[] = [];
  const inlineHashtags = findInlineHashtags(channel, draft);

  if (inlineHashtags.fields.length > 0) {
    issues.push(`${channel}_hashtags_in_copy_fields`);
  }

  if (channel === "threads") {
    const text = toSafeString(draft.text);
    const linkUrl = toSafeString(draft.linkUrl);
    if (!toSafeString(draft.title)) issues.push("threads_title_required");
    if (!text) issues.push("threads_text_required");
    if (text.length > THREADS_POST_TEXT_MAX_LEN) warnings.push(`threads_text_will_publish_as_thread:${THREADS_POST_TEXT_MAX_LEN}`);
    if (!linkUrl) warnings.push("threads_link_url_missing");
    if (toArray(draft.hashtags).length === 0) warnings.push("threads_hashtags_missing");
  }

  if (channel === "instagram") {
    const caption = toSafeString(draft.caption || draft.body || draft.text);
    if (!toSafeString(draft.title)) warnings.push("instagram_title_missing");
    if (!caption) issues.push("instagram_caption_required");
    if (caption.length > 2200) issues.push("instagram_caption_too_long:2200");
    if (!toSafeString(draft.imageUrl || draft.image_url)) issues.push("instagram_image_url_required");
    if (toArray(draft.hashtags || draft.tags).length === 0) warnings.push("instagram_hashtags_missing");
  }

  if (channel === "linkedin") {
    if (!toSafeString(draft.headline)) issues.push("linkedin_headline_required");
    if (!toSafeString(draft.body || draft.text)) issues.push("linkedin_body_required");
    if (!toSafeString(draft.commentLink)) issues.push("linkedin_comment_link_required");
    if (!toSafeString(draft.cta)) warnings.push("linkedin_cta_missing");
  }

  if (channel === "naver_blog") {
    if (!toSafeString(draft.title)) issues.push("naver_blog_title_required");
    if (!toSafeString(draft.summary)) issues.push("naver_blog_summary_required");
    if (!toSafeString(draft.body || draft.plainText)) issues.push("naver_blog_body_required");
    if (!toSafeString(draft.html)) issues.push("naver_blog_html_required");
    if (!toSafeString(draft.plainText)) issues.push("naver_blog_plain_text_required");
    if (toArray(draft.tags).length === 0) warnings.push("naver_blog_tags_missing");
  }

  const valid = issues.length === 0;
  const channelFit = buildChannelFitReport({ channel, draft, issues, warnings, valid });

  return {
    channel,
    valid,
    summary: valid ? "기본 스키마 검증을 통과했습니다." : "기본 스키마 검증에서 보완이 필요한 항목이 있습니다.",
    issues,
    warnings,
    hashtagSeparation: {
      valid: inlineHashtags.fields.length === 0,
      fields: inlineHashtags.fields,
      tokens: inlineHashtags.tokens,
    },
    score: valid ? Math.max(70, 100 - warnings.length * 5) : Math.max(0, 60 - issues.length * 15),
    channelFit,
    impactScore: buildImpactScoreReport(channelFit, issues, warnings),
  };
}
