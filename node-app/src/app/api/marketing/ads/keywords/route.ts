import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import {
  approveMarketingKeywordPlan,
  createMarketingKeywordPlan,
  getMarketingAdsPolicy,
  listMarketingKeywordPlans,
} from "libs/database/marketing";
import { getMarketingKeywordPlanAnalysis } from "libs/marketing/ads/marketingKeywordStrategyService";
import { buildMarketingKeywordStrategy, type MarketingKeywordStrategyInput } from "libs/marketing/ads/marketingKeywordStrategyContract";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function adminOnly(user: { roles?: string[] }) {
  return user?.roles?.includes("administrator");
}

function inputFromBody(data: Record<string, unknown>, strategy: Record<string, unknown>) {
  const product = toUnknownRecord(data.product);
  return {
    asOf: new Date().toISOString(),
    product,
    strategy,
    providers: data.providers,
    seedKeywords: data.seedKeywords,
    negativeKeywords: data.negativeKeywords,
  } satisfies MarketingKeywordStrategyInput;
}

function safeSource(input: MarketingKeywordStrategyInput) {
  const product = toUnknownRecord(input.product);
  const strategy = toUnknownRecord(input.strategy);
  return {
    product: {
      productId: toSafeString(product.productId),
      channelProductNo: toSafeString(product.channelProductNo),
      productRevision: toSafeString(product.productRevision),
      productName: toSafeString(product.productName),
      sourceFingerprint: toSafeString(product.sourceFingerprint),
      campaignId: toSafeString(product.campaignId),
      landingUrl: toSafeString(product.landingUrl),
      creativeIds: Array.isArray(product.creativeIds) ? product.creativeIds.map(toSafeString).filter(Boolean).slice(0, 20) : [],
      allowedClaims: Array.isArray(product.allowedClaims) ? product.allowedClaims.map(toSafeString).filter(Boolean).slice(0, 30) : [],
    },
    strategy: {
      objective: toSafeString(strategy.objective),
      targetAudience: toSafeString(strategy.targetAudience),
      offer: toSafeString(strategy.offer),
      landingPage: toSafeString(strategy.landingPage),
      requiredClaims: Array.isArray(strategy.requiredClaims) ? strategy.requiredClaims.map(toSafeString).filter(Boolean).slice(0, 30) : [],
      prohibitedClaims: Array.isArray(strategy.prohibitedClaims) ? strategy.prohibitedClaims.map(toSafeString).filter(Boolean).slice(0, 30) : [],
      requiredDisclosures: Array.isArray(strategy.requiredDisclosures) ? strategy.requiredDisclosures.map(toSafeString).filter(Boolean).slice(0, 30) : [],
      measurementPlan: toSafeString(strategy.measurementPlan),
      version: Math.max(0, Math.floor(Number(strategy.version) || 0)),
    },
    providers: toSafeString(input.providers) || "both",
    seedKeywords: Array.isArray(input.seedKeywords) ? input.seedKeywords.map(toSafeString).filter(Boolean).slice(0, 20) : [],
    negativeKeywords: Array.isArray(input.negativeKeywords) ? input.negativeKeywords.map(toSafeString).filter(Boolean).slice(0, 30) : [],
  };
}

export const GET = withAuth(
  async (_data, user, request) => withApiTimeout(async () => {
    if (!isMarketingFeatureEnabled()) return NextResponse.json({ success: false, error: "marketing_feature_disabled" }, { status: 404 });
    const search = new URL(request.url).searchParams;
    const universeId = toSafeString(search.get("universeId"));
    const access = await assertMarketingUniverseAccess({ user, universeId });
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const planId = toSafeString(search.get("planId"));
    const [policy, plans, analysis] = await Promise.all([
      getMarketingAdsPolicy(access.universeId),
      listMarketingKeywordPlans(access.universeId),
      planId ? getMarketingKeywordPlanAnalysis({ universeId: access.universeId, planId }) : Promise.resolve(null),
    ]);
    return NextResponse.json({ success: true, data: { policy, plans, ...(planId ? { analysis } : {}) } });
  }, 20_000),
  undefined,
  "marketing_ads_keyword_strategy_get",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user) => withApiTimeout(async () => {
    if (!isMarketingFeatureEnabled()) return NextResponse.json({ success: false, error: "marketing_feature_disabled" }, { status: 404 });
    if (!adminOnly(user)) return NextResponse.json({ success: false, error: "administrator_required" }, { status: 403 });
    const universeId = toSafeString(data?.universeId);
    const access = await assertMarketingUniverseAccess({ user, universeId });
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const action = toSafeString(data?.action);
    const actor = toSafeString(user.userEmail || user.uid);

    if (action === "preview" || action === "save_plan") {
      const policy = await getMarketingAdsPolicy(access.universeId);
      const strategy = toUnknownRecord(data?.strategy || policy?.advertisingCriteria);
      const input = inputFromBody(toUnknownRecord(data), strategy);
      const analysis = buildMarketingKeywordStrategy(input);
      if (action === "preview") return NextResponse.json({ success: true, data: { analysis } });
      if (!analysis.lineage.campaignId) {
        return NextResponse.json({ success: false, error: "campaign_id_required_for_plan" }, { status: 400 });
      }
      const requestedProvider = toSafeString(input.providers);
      const provider = requestedProvider === "naver_ads" || requestedProvider === "google_ads" || requestedProvider === "both"
        ? requestedProvider
        : "both";
      const plan = await createMarketingKeywordPlan({
        universeId: access.universeId,
        campaignId: analysis.lineage.campaignId,
        provider,
        lineage: analysis.lineage,
        source: safeSource(input),
        output: analysis,
        createdBy: actor,
      });
      return NextResponse.json({ success: true, data: { plan, analysis } }, { status: 201 });
    }

    if (action === "approve_plan") {
      const plan = await approveMarketingKeywordPlan({
        universeId: access.universeId,
        planId: toSafeString(data?.planId),
        approvedBy: actor,
      });
      if (!plan) return NextResponse.json({ success: false, error: "keyword_plan_not_approvable" }, { status: 409 });
      return NextResponse.json({ success: true, data: { plan } });
    }

    return NextResponse.json({ success: false, error: "unsupported_action" }, { status: 400 });
  }, 30_000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_ads_keyword_strategy_post",
);
