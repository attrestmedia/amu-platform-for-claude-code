import "server-only";

import { getMarketingAdsPolicy, getMarketingKeywordPlan } from "libs/database/marketing";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

export type MarketingAdsProvider = "naver_ads" | "google_ads";

function positiveNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function stringList(value: unknown, limit: number) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(toSafeString).filter(Boolean))).slice(0, limit);
}

function safeLineage(value: unknown) {
  const source = toUnknownRecord(value);
  const keys = ["productId", "channelProductNo", "productRevision", "productName", "sourceFingerprint", "campaignId", "landingUrl", "creativeIds", "allowedClaims"];
  return Object.fromEntries(
    keys
      .map((key) => [key, Array.isArray(source[key]) ? stringList(source[key], 30) : toSafeString(source[key])])
      .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value))),
  );
}

export async function normalizeAndValidateMarketingAdDraft(universeId: string, raw: unknown) {
  const input = toUnknownRecord(raw);
  const campaign = toUnknownRecord(input.campaign);
  const adGroup = toUnknownRecord(input.adGroup);
  const creative = toUnknownRecord(input.creative);
  const policy = await getMarketingAdsPolicy(universeId);
  const keywordPlanId = toSafeString(input.keywordPlanId);
  const keywordPlan = keywordPlanId ? await getMarketingKeywordPlan(universeId, keywordPlanId) : null;
  const provider = toSafeString(input.provider) as MarketingAdsProvider;
  const landingUrl = toSafeString(input.landingUrl || creative.finalUrl);
  const issues: string[] = [];
  let hostname = "";
  try {
    const url = new URL(landingUrl);
    if (url.protocol !== "https:") issues.push("landing_url_https_required");
    hostname = url.hostname.toLowerCase();
  } catch {
    issues.push("landing_url_invalid");
  }
  if (!(["naver_ads", "google_ads"] as string[]).includes(provider)) issues.push("provider_invalid");
  const allowedDomains = (policy?.allowedLandingDomains || []).map((item) => toSafeString(item).toLowerCase()).filter(Boolean);
  if (!hostname || !allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    issues.push("landing_domain_not_allowed");
  }
  const dailyBudget = positiveNumber(campaign.dailyBudget);
  const policyDaily = positiveNumber(policy?.spendCap?.dailyAmount);
  if (!dailyBudget) issues.push("daily_budget_required");
  if (!policyDaily || dailyBudget > policyDaily) issues.push("daily_budget_exceeds_policy");
  const headlines = stringList(creative.headlines, 15);
  const descriptions = stringList(creative.descriptions, 4);
  if (!headlines.length) issues.push("headline_required");
  if (!descriptions.length) issues.push("description_required");
  if (provider === "google_ads") {
    if (headlines.length < 3) issues.push("google_ads_min_three_headlines");
    if (descriptions.length < 2) issues.push("google_ads_min_two_descriptions");
    if (headlines.some((headline) => headline.length > 30)) issues.push("google_ads_headline_too_long");
    if (descriptions.some((description) => description.length > 90)) issues.push("google_ads_description_too_long");
  }
  const keywords = (Array.isArray(input.keywords) ? input.keywords : [])
    .map(toUnknownRecord)
    .map((keyword) => ({
      text: toSafeString(keyword.text),
      matchType: (["BROAD", "PHRASE", "EXACT"].includes(toSafeString(keyword.matchType).toUpperCase())
        ? toSafeString(keyword.matchType).toUpperCase()
        : "EXACT") as "BROAD" | "PHRASE" | "EXACT",
      ...(positiveNumber(keyword.bid) ? { bid: positiveNumber(keyword.bid) } : {}),
    }))
    .filter((keyword) => keyword.text)
    .slice(0, 100);
  if (!keywords.length) issues.push("keyword_required");

  const normalized = {
    provider,
    name: toSafeString(input.name || campaign.name),
    landingUrl,
    campaign: { name: toSafeString(campaign.name || input.name), dailyBudget },
    adGroup: {
      name: toSafeString(adGroup.name),
      defaultBid: positiveNumber(adGroup.defaultBid),
      ...(toSafeString(adGroup.businessChannelId) ? { businessChannelId: toSafeString(adGroup.businessChannelId) } : {}),
    },
    creative: { headlines, descriptions, finalUrl: landingUrl },
    keywords,
    spendCap: {
      dailyAmount: dailyBudget,
      monthlyAmount: positiveNumber(policy?.spendCap?.monthlyAmount),
      currency: toSafeString(policy?.spendCap?.currency) || "KRW",
    },
    validation: { valid: issues.length === 0, issues, checkedAt: new Date() },
  };
  if (!normalized.name) issues.push("name_required");
  if (!normalized.adGroup.name) issues.push("ad_group_name_required");
  if (provider === "naver_ads" && !("businessChannelId" in normalized.adGroup)) issues.push("naver_business_channel_id_required");
  if (keywordPlanId && !keywordPlan) issues.push("keyword_plan_not_found");
  if (keywordPlanId && keywordPlan && keywordPlan.status !== "approved") issues.push("keyword_plan_not_approved");
  if (keywordPlanId && keywordPlan && keywordPlan.provider !== "both" && keywordPlan.provider !== provider) issues.push("keyword_plan_provider_mismatch");
  const lineage = safeLineage(input.lineage);
  if (keywordPlan?.lineage && Object.keys(lineage).length === 0) Object.assign(lineage, safeLineage(keywordPlan.lineage));
  normalized.validation.valid = issues.length === 0;
  if (keywordPlanId) Object.assign(normalized, { keywordPlanId });
  if (toSafeString(input.campaignId || keywordPlan?.campaignId)) Object.assign(normalized, { campaignId: toSafeString(input.campaignId || keywordPlan?.campaignId) });
  if (Object.keys(lineage).length) Object.assign(normalized, { lineage });
  return { policy, normalized, issues };
}
