import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import {
  approveMarketingAdDraft,
  createMarketingAdDraft,
  getMarketingAdsPolicy,
  listMarketingAdDrafts,
  listMarketingAdExecutions,
  upsertMarketingAdsPolicy,
  upsertMarketingAdvertisingCriteria,
} from "libs/database/marketing";
import { getAdsPerformance, collectAdsPerformanceSnapshots } from "libs/marketing/analytics/adsCollectService";
import { normalizeAndValidateMarketingAdDraft } from "libs/marketing/ads/adDraftService";
import { executeApprovedMarketingAdDraft } from "libs/marketing/ads/adsExecutionService";
import { validateAdsCredentials, type AdsCredentialProvider } from "libs/marketing/ads/credentialsValidation";
import { getNaverAdsAuth, naverSearchAdReadApi } from "libs/api/thirdparty/naverads/naverSearchAdClient";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { getMarketingOAuthConnectionStatus } from "libs/marketing/auth/marketingOAuthStatusService";
import { buildAdsCredentialStatus } from "libs/marketing/ads/adsCredentialStatusContract";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { normalizeAdvertisingCriteriaList } from "consts/marketing/advertisingCriteria";

/**
 * @docHint
 * @purpose Marketing Ops 광고 패널의 정책·초안·승인·paused-first 집행·성과 조회 단일 API
 * @process universe 권한 확인 → 관리자 mutate 제한 → 서버 정책/승인 재검증 → 멱등 실행
 * @domain marketing
 * @scope admin-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function adminOnly(user: { roles?: string[] }) {
  return user?.roles?.includes("administrator");
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(min, Math.min(max, Math.floor(next))) : fallback;
}

export const GET = withAuth(
  async (_data, user, request) => withApiTimeout(async () => {
    const search = new URL(request.url).searchParams;
    const universeId = toSafeString(search.get("universeId"));
    const access = await assertMarketingUniverseAccess({ user, universeId });
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const [policy, drafts, executions, performance, credentialStatus, googleOAuthStatus] = await Promise.all([
      getMarketingAdsPolicy(access.universeId),
      listMarketingAdDrafts(access.universeId),
      listMarketingAdExecutions(access.universeId),
      getAdsPerformance({ universeId: access.universeId, channels: toSafeString(search.get("channel")).split(",").filter(Boolean), days: bounded(search.get("days"), 30, 1, 180) }),
      getCredentialStatus(access.universeId),
      getMarketingOAuthConnectionStatus({ universeId: access.universeId, provider: "google_ads" }),
    ]);
    // 실제 Google Ads 실행 경로와 동일하게 OAuth 연결을 우선 표시하고, OAuth 이력이 없을 때만 레거시 슬롯으로 폴백한다.
    const credentials = buildAdsCredentialStatus({
      legacyStatus: credentialStatus,
      googleOAuthConnections: googleOAuthStatus.connections,
    });
    return NextResponse.json({ success: true, data: { policy, drafts, executions, performance, credentials } });
  }, 20_000),
  undefined,
  "marketing_ads_get",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user) => withApiTimeout(async () => {
    if (!adminOnly(user)) return NextResponse.json({ success: false, error: "administrator_required" }, { status: 403 });
    const universeId = toSafeString(data?.universeId);
    const access = await assertMarketingUniverseAccess({ user, universeId });
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const action = toSafeString(data?.action);
    const actor = toSafeString(user.userEmail || user.uid);

    if (action === "update_advertising_criteria") {
      const criteria = toUnknownRecord(data?.advertisingCriteria);
      const targetAudience = toSafeString(criteria.targetAudience).slice(0, 1000);
      const offer = toSafeString(criteria.offer).slice(0, 1000);
      if (!targetAudience || !offer) {
        return NextResponse.json({ success: false, error: "advertising_strategy_required" }, { status: 400 });
      }
      const policy = await upsertMarketingAdvertisingCriteria({
        universeId: access.universeId,
        advertisingCriteria: {
          objective: ["awareness", "traffic", "leads", "sales"].includes(toSafeString(criteria.objective))
            ? toSafeString(criteria.objective)
            : "traffic",
          targetAudience,
          offer,
          landingPage: toSafeString(criteria.landingPage).slice(0, 1000),
          requiredClaims: normalizeAdvertisingCriteriaList(criteria.requiredClaims),
          prohibitedClaims: normalizeAdvertisingCriteriaList(criteria.prohibitedClaims),
          requiredDisclosures: normalizeAdvertisingCriteriaList(criteria.requiredDisclosures),
          measurementPlan: toSafeString(criteria.measurementPlan).slice(0, 2000),
        },
        updatedBy: actor,
      });
      return NextResponse.json({ success: true, data: { policy } });
    }

    if (action === "update_policy") {
      const dailyAmount = Math.max(0, Number(data?.dailyAmount || 0));
      const monthlyAmount = Math.max(0, Number(data?.monthlyAmount || 0));
      const allowedLandingDomains: string[] = Array.from(new Set<string>(
        (Array.isArray(data?.allowedLandingDomains) ? data.allowedLandingDomains : toSafeString(data?.allowedLandingDomains).split(","))
          .map((item: unknown) => toSafeString(item).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
          .filter(Boolean),
      )).slice(0, 20);
      if (data?.executionEnabled === true && (!dailyAmount || !monthlyAmount || !allowedLandingDomains.length)) {
        return NextResponse.json({ success: false, error: "execution_policy_incomplete" }, { status: 400 });
      }
      const policy = await upsertMarketingAdsPolicy({
        universeId: access.universeId,
        executionEnabled: data?.executionEnabled === true,
        spendCap: { dailyAmount, monthlyAmount, currency: toSafeString(data?.currency).toUpperCase() || "KRW" },
        allowedLandingDomains,
        ...(data?.advertisingCriteria
          ? {
              advertisingCriteria: {
                objective: ["awareness", "traffic", "leads", "sales"].includes(
                  toSafeString(data.advertisingCriteria.objective),
                )
                  ? toSafeString(data.advertisingCriteria.objective)
                  : "traffic",
                targetAudience: toSafeString(data.advertisingCriteria.targetAudience).slice(0, 1000),
                offer: toSafeString(data.advertisingCriteria.offer).slice(0, 1000),
                landingPage: toSafeString(data.advertisingCriteria.landingPage).slice(0, 1000),
                requiredClaims: normalizeAdvertisingCriteriaList(data.advertisingCriteria.requiredClaims),
                prohibitedClaims: normalizeAdvertisingCriteriaList(data.advertisingCriteria.prohibitedClaims),
                requiredDisclosures: normalizeAdvertisingCriteriaList(data.advertisingCriteria.requiredDisclosures),
                measurementPlan: toSafeString(data.advertisingCriteria.measurementPlan).slice(0, 2000),
              },
            }
          : {}),
        updatedBy: actor,
      });
      return NextResponse.json({ success: true, data: { policy } });
    }

    if (action === "create_draft") {
      const validation = await normalizeAndValidateMarketingAdDraft(access.universeId, data?.draft);
      const draft = await createMarketingAdDraft({ ...validation.normalized, universeId: access.universeId, status: "draft", createdBy: actor });
      return NextResponse.json({ success: true, data: { draft }, warnings: validation.issues }, { status: 201 });
    }

    if (action === "approve_draft") {
      const draft = await approveMarketingAdDraft({ universeId: access.universeId, draftId: toSafeString(data?.draftId), approvedBy: actor });
      if (!draft) return NextResponse.json({ success: false, error: "draft_not_approvable" }, { status: 409 });
      return NextResponse.json({ success: true, data: { draft } });
    }

    if (action === "execute_draft") {
      const result = await executeApprovedMarketingAdDraft({ universeId: access.universeId, draftId: toSafeString(data?.draftId), executedBy: actor });
      return NextResponse.json({ success: result.ok, data: result }, { status: result.ok ? 200 : 409 });
    }

    if (action === "collect_performance") {
      const result = await collectAdsPerformanceSnapshots({
        universeId: access.universeId,
        dateFrom: toSafeString(data?.dateFrom) || undefined,
        dateTo: toSafeString(data?.dateTo) || undefined,
        channels: Array.isArray(data?.channels) ? data.channels.map(toSafeString) : undefined,
        dryRun: data?.dryRun === true,
      });
      return NextResponse.json({ success: result.ok, data: result }, { status: result.ok ? 200 : 409 });
    }

    if (action === "validate_credentials") {
      const provider = toSafeString(data?.provider) as AdsCredentialProvider;
      if (!(["naver_ads", "google_ads"] as string[]).includes(provider)) return NextResponse.json({ success: false, error: "unsupported_provider" }, { status: 400 });
      const result = await validateAdsCredentials({ universeId: access.universeId, provider, actor, persist: true });
      return NextResponse.json({ success: result.ok, data: result }, { status: result.ok ? 200 : 409 });
    }

    if (action === "naver_keyword_ideas") {
      const keywords = (Array.isArray(data?.keywords) ? data.keywords : toSafeString(data?.keywords).split(",")).map(toSafeString).filter(Boolean).slice(0, 5);
      const auth = await getNaverAdsAuth(access.universeId);
      if (!auth) return NextResponse.json({ success: false, error: "naver_ads_credentials_incomplete" }, { status: 409 });
      const result = await naverSearchAdReadApi.keywordIdeas(auth, keywords);
      return NextResponse.json({ success: true, data: result });
    }
    return NextResponse.json({ success: false, error: "unsupported_action" }, { status: 400 });
  }, 60_000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_ads_post",
);
