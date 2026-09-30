import "server-only";

import {
  appendMarketingAdExecutionExternalId,
  claimMarketingAdExecution,
  finishMarketingAdExecution,
  getMarketingAdDraft,
  getMarketingAdsPolicy,
  markMarketingAdDraftExecuted,
} from "libs/database/marketing";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { getNaverAdsAuth, naverSearchAdRequest } from "libs/api/thirdparty/naverads/naverSearchAdClient";
import { getGoogleAdsAuth, googleAdsRequest } from "libs/api/thirdparty/googleads/googleAdsClient";
import { getMarketingSystemStatus } from "libs/marketing/queue/ops";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

function resourceName(value: unknown) {
  return toSafeString(toUnknownRecord(value).resourceName);
}

async function createGooglePausedResources(universeId: string, draftRaw: unknown, executionId: string) {
  const draft = toUnknownRecord(draftRaw);
  const campaign = toUnknownRecord(draft.campaign);
  const adGroup = toUnknownRecord(draft.adGroup);
  const creative = toUnknownRecord(draft.creative);
  const auth = await getGoogleAdsAuth(universeId);
  if (!auth) throw new Error("google_ads_credentials_incomplete");
  // 외부 mutate는 트랜잭션이 아니라서, 생성 직후 즉시 원장에 기록해야 중간 실패 시 고아 리소스를 추적할 수 있다.
  const record = (key: string, value: string) => appendMarketingAdExecutionExternalId({ executionId, key, value });
  const mutate = <T>(resource: string, operations: unknown[]) =>
    googleAdsRequest<{ results?: T[] }>(auth, `customers/${auth.customerId}/${resource}:mutate`, { operations, partialFailure: false });
  const budgetResult = await mutate<Record<string, unknown>>("campaignBudgets", [{
    create: { name: `${toSafeString(campaign.name)} budget`, amountMicros: Math.round(Number(campaign.dailyBudget) * 1_000_000), deliveryMethod: "STANDARD", explicitlyShared: false },
  }]);
  const budgetResource = resourceName(budgetResult.results?.[0]);
  await record("budget", budgetResource);
  const campaignResult = await mutate<Record<string, unknown>>("campaigns", [{
    create: {
      name: toSafeString(campaign.name),
      status: "PAUSED",
      advertisingChannelType: "SEARCH",
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      campaignBudget: budgetResource,
      manualCpc: { enhancedCpcEnabled: false },
    },
  }]);
  const campaignResource = resourceName(campaignResult.results?.[0]);
  await record("campaign", campaignResource);
  const groupResult = await mutate<Record<string, unknown>>("adGroups", [{
    create: { name: toSafeString(adGroup.name), campaign: campaignResource, status: "PAUSED", type: "SEARCH_STANDARD", cpcBidMicros: Math.round(Number(adGroup.defaultBid || 0) * 1_000_000) },
  }]);
  const adGroupResource = resourceName(groupResult.results?.[0]);
  await record("adGroup", adGroupResource);
  const adResult = await mutate<Record<string, unknown>>("adGroupAds", [{
    create: {
      adGroup: adGroupResource,
      status: "PAUSED",
      ad: {
        finalUrls: [toSafeString(draft.landingUrl)],
        responsiveSearchAd: {
          headlines: (Array.isArray(creative.headlines) ? creative.headlines : []).map((text) => ({ text: toSafeString(text) })),
          descriptions: (Array.isArray(creative.descriptions) ? creative.descriptions : []).map((text) => ({ text: toSafeString(text) })),
        },
      },
    },
  }]);
  const keywords = Array.isArray(draft.keywords) ? draft.keywords.map(toUnknownRecord) : [];
  const adResource = resourceName(adResult.results?.[0]);
  await record("ad", adResource);
  const keywordResult = keywords.length ? await mutate<Record<string, unknown>>("adGroupCriteria", keywords.map((keyword) => ({
    create: { adGroup: adGroupResource, status: "PAUSED", keyword: { text: toSafeString(keyword.text), matchType: toSafeString(keyword.matchType) } },
  }))) : { results: [] };
  return {
    externalIds: {
      budget: budgetResource,
      campaign: campaignResource,
      adGroup: adGroupResource,
      ad: adResource,
    },
    response: { keywordCount: keywordResult.results?.length || 0, providerStatus: "PAUSED" },
  };
}

async function createNaverPausedResources(universeId: string, draftRaw: unknown, executionId: string) {
  const draft = toUnknownRecord(draftRaw);
  const campaign = toUnknownRecord(draft.campaign);
  const adGroup = toUnknownRecord(draft.adGroup);
  const auth = await getNaverAdsAuth(universeId);
  if (!auth) throw new Error("naver_ads_credentials_incomplete");
  const record = (key: string, value: string) => appendMarketingAdExecutionExternalId({ executionId, key, value });
  const campaignResult = await naverSearchAdRequest<Record<string, unknown>>(auth, "POST", "/ncc/campaigns", {
    body: { name: toSafeString(campaign.name), campaignTp: "WEB_SITE", customerId: Number(auth.customerId), userLock: true },
  });
  const campaignId = toSafeString(campaignResult.nccCampaignId);
  await record("campaign", campaignId);
  const groupResult = await naverSearchAdRequest<Record<string, unknown>>(auth, "POST", "/ncc/adgroups", {
    body: {
      nccCampaignId: campaignId,
      nccBusinessChannelId: toSafeString(adGroup.businessChannelId),
      name: toSafeString(adGroup.name),
      bidAmt: Math.round(Number(adGroup.defaultBid || 0)),
      dailyBudget: Math.round(Number(campaign.dailyBudget || 0)),
      userLock: true,
    },
  });
  const adGroupId = toSafeString(groupResult.nccAdgroupId);
  await record("adGroup", adGroupId);
  const keywords = Array.isArray(draft.keywords) ? draft.keywords.map(toUnknownRecord) : [];
  const keywordResult = keywords.length
    ? await naverSearchAdRequest<Record<string, unknown>[]>(auth, "POST", "/ncc/keywords", {
        body: keywords.map((keyword) => ({ nccAdgroupId: adGroupId, keyword: toSafeString(keyword.text), bidAmt: Math.round(Number(keyword.bid || adGroup.defaultBid || 0)), useGroupBidAmt: !keyword.bid, userLock: true })),
        query: { nccAdgroupId: adGroupId },
      })
    : [];
  return {
    externalIds: { campaign: campaignId, adGroup: adGroupId },
    response: { keywordCount: keywordResult.length, providerStatus: "USER_LOCKED", creativeStatus: "draft_only" },
  };
}

export async function executeApprovedMarketingAdDraft(args: { universeId: string; draftId: string; executedBy: string }) {
  const [draft, policy, systemStatus, credentialStatus] = await Promise.all([
    getMarketingAdDraft(args.universeId, args.draftId),
    getMarketingAdsPolicy(args.universeId),
    getMarketingSystemStatus({ universeId: args.universeId }),
    getCredentialStatus(args.universeId),
  ]);
  if (!draft) return { ok: false as const, error: "draft_not_found" };
  if (draft.status !== "approved" || !draft.approval?.approvalId) return { ok: false as const, error: "draft_not_approved" };
  if (!policy?.executionEnabled) return { ok: false as const, error: "ads_execution_disabled_in_ui" };
  if (!systemStatus.measurement.goNoGo.ready) return { ok: false as const, error: "ads_unlock_gate_not_ready", reasons: systemStatus.measurement.goNoGo.reasons };
  const providerCredential = credentialStatus[draft.provider];
  if (!providerCredential?.ready) return { ok: false as const, error: "selected_provider_credentials_incomplete" };
  if (providerCredential.extras?.lastValidationStatus !== "valid") {
    return { ok: false as const, error: "selected_provider_credentials_not_validated" };
  }
  const claim = await claimMarketingAdExecution({
    universeId: args.universeId,
    draftId: draft.draftId,
    provider: draft.provider,
    idempotencyKey: draft.idempotencyKey,
    executedBy: args.executedBy,
    request: { approvalId: draft.approval.approvalId, provider: draft.provider, mode: "paused_first" },
  });
  if (!claim.claimed) {
    // 멱등 응답은 "이전 성공 결과 재반환"이어야 한다. 실패한 시도를 성공 형태로 반환하면
    // 호출자가 외부 계정 상태를 오판하므로, failed execution은 명시 오류로 구분한다.
    if (toSafeString(toUnknownRecord(claim.execution).status) === "failed") {
      return { ok: false as const, error: "execution_already_failed_create_new_draft", execution: claim.execution };
    }
    return { ok: true as const, idempotent: true, execution: claim.execution };
  }
  const executionId = toSafeString(claim.execution.executionId);
  try {
    const providerResult = draft.provider === "google_ads"
      ? await createGooglePausedResources(args.universeId, draft, executionId)
      : await createNaverPausedResources(args.universeId, draft, executionId);
    const execution = await finishMarketingAdExecution({ executionId, status: "paused_created", ...providerResult });
    await markMarketingAdDraftExecuted(args.universeId, draft.draftId, "paused_created");
    return { ok: true as const, execution };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ads_execution_failed";
    await finishMarketingAdExecution({ executionId, status: "failed", error: message });
    await markMarketingAdDraftExecuted(args.universeId, draft.draftId, "failed");
    return { ok: false as const, error: message };
  }
}
