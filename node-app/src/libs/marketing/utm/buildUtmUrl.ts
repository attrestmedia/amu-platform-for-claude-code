import "server-only";

import type { MarketingChannel } from "consts/marketing/queue";
import { MARKETING_CANONICAL_POLICY, MARKETING_DEFAULT_UTM_MEDIUM_BY_CHANNEL } from "consts/marketing/tracking";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toCampaign(jobId: string, campaignId?: string) {
  return toSafeString(campaignId) || `marketing_job_${toSafeString(jobId)}`;
}

export function buildMarketingUtmUrl(args: {
  canonicalUrl: string;
  channel: MarketingChannel;
  jobId: string;
  slug: string;
  medium?: string;
  term?: string;
  campaignId?: string;
}) {
  const canonicalUrl = toSafeString(args.canonicalUrl);
  if (!canonicalUrl) {
    return {
      canonicalUrl: "",
      finalUrl: "",
      utm: {},
      policy: MARKETING_CANONICAL_POLICY,
    };
  }

  try {
    const parsed = new URL(canonicalUrl);

    MARKETING_CANONICAL_POLICY.strippedParams.forEach((key) => {
      parsed.searchParams.delete(key);
    });

    const medium = toSafeString(args.medium) || MARKETING_DEFAULT_UTM_MEDIUM_BY_CHANNEL[args.channel] || "social";
    parsed.searchParams.set("utm_source", args.channel);
    parsed.searchParams.set("utm_medium", medium);
    const campaign = toCampaign(args.jobId, args.campaignId);
    parsed.searchParams.set("utm_campaign", campaign);
    parsed.searchParams.set("utm_content", toSafeString(args.slug));
    if (toSafeString(args.term)) {
      parsed.searchParams.set("utm_term", toSafeString(args.term));
    }

    return {
      canonicalUrl,
      finalUrl: parsed.toString(),
      utm: {
        utm_source: args.channel,
        utm_medium: medium,
        utm_campaign: campaign,
        utm_content: toSafeString(args.slug),
        ...(toSafeString(args.term) ? { utm_term: toSafeString(args.term) } : {}),
      },
      policy: MARKETING_CANONICAL_POLICY,
    };
  } catch {
    return {
      canonicalUrl,
      finalUrl: canonicalUrl,
      utm: {},
      policy: MARKETING_CANONICAL_POLICY,
    };
  }
}
