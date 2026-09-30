import { NextResponse } from "next/server";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { getCommerceDraftByDraftId } from "libs/database/commerce";
import { getContentAssetByAssetId, getImageAssetByAssetId } from "libs/database/lab";
import { getMarketingKeywordSettings } from "libs/database/marketing";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { enqueueMarketingSourceSnapshots } from "libs/marketing/ingest/contentQueueService";
import {
  buildCommerceProductSourceSnapshotFromDraft,
  type CommerceProductSourcePromotionAsset,
  CommerceProductSourceContractError,
} from "libs/marketing/source/commerceProductSourceContract";
import { toUnknownRecord } from "utils/common/typeUtils";
import { toErrorMessage } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SOCIAL_CHANNELS = ["threads", "instagram"] as const;
type SocialChannel = (typeof SOCIAL_CHANNELS)[number];

function toSafeString(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function badRequest(message: string, errorCode: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, message, errorCode, ...(details ? { details } : {}) }, { status: 422 });
}

function parsePeriod(raw: unknown) {
  const period = toUnknownRecord(raw);
  const startsAt = toSafeString(period.startsAt, 80);
  const endsAt = toSafeString(period.endsAt, 80);
  const startTime = startsAt ? Date.parse(startsAt) : Number.NaN;
  const endTime = endsAt ? Date.parse(endsAt) : Number.NaN;
  if ((startsAt && !Number.isFinite(startTime)) || (endsAt && !Number.isFinite(endTime))) return null;
  if (Number.isFinite(startTime) && Number.isFinite(endTime) && startTime > endTime) return null;
  return {
    ...(startsAt ? { startsAt: new Date(startTime).toISOString() } : {}),
    ...(endsAt ? { endsAt: new Date(endTime).toISOString() } : {}),
  };
}

function parseChannels(raw: unknown): SocialChannel[] {
  const plan = toUnknownRecord(raw);
  const values = Array.isArray(plan.channels) ? plan.channels : [];
  return Array.from(new Set(values.map((value) => toSafeString(value, 30))))
    .filter((value): value is SocialChannel => SOCIAL_CHANNELS.includes(value as SocialChannel));
}

function parseAssetIds(raw: unknown, max = 8) {
  return Array.from(
    new Set(
      (Array.isArray(raw) ? raw : [])
        .map((value) => toSafeString(value, 160))
        .filter((value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)),
    ),
  ).slice(0, max);
}

function canUseStudioAsset(asset: Record<string, unknown>, universeId: string, userId: string) {
  const state = toSafeString(asset.state, 40).toLowerCase();
  if (state && !["active", "ready"].includes(state)) return false;
  const assetUniverseId = toSafeString(asset.universeId, 120);
  const ownerId = toSafeString(asset.uid || asset.userId, 160);
  const visibility = toSafeString(asset.visibility, 40).toLowerCase();
  if (assetUniverseId && assetUniverseId !== universeId && visibility !== "public") return false;
  if (!assetUniverseId && ownerId && ownerId !== userId && visibility !== "public") return false;
  return Boolean(assetUniverseId === universeId || ownerId === userId || visibility === "public");
}

async function resolvePromotionAssets(input: { raw: unknown; universeId: string; userId: string }) {
  const studioAssets = toUnknownRecord(input.raw);
  const contentAssetIds = parseAssetIds(studioAssets.contentAssetIds);
  const imageAssetIds = parseAssetIds(studioAssets.imageAssetIds);
  const [contentAssets, imageAssets] = await Promise.all([
    Promise.all(contentAssetIds.map((assetId) => getContentAssetByAssetId(assetId))),
    Promise.all(imageAssetIds.map((assetId) => getImageAssetByAssetId(assetId))),
  ]);
  const missingContent = contentAssets.some((asset) => !asset);
  const missingImages = imageAssets.some((asset) => !asset);
  if (missingContent || missingImages) {
    return { errorCode: "studio_asset_not_found", missingContent, missingImages } as const;
  }
  const inaccessible = [...contentAssets, ...imageAssets].some(
    (asset) => !asset || !canUseStudioAsset(asset as Record<string, unknown>, input.universeId, input.userId),
  );
  if (inaccessible) return { errorCode: "studio_asset_access_denied" } as const;

  const promotionAssets: CommerceProductSourcePromotionAsset[] = [
    ...contentAssets.filter(Boolean).map((asset) => ({
      assetId: toSafeString((asset as Record<string, unknown>).assetId, 160),
      assetType: "content" as const,
      origin: "gen_studio" as const,
      role: "social_copy" as const,
      templateKey: toSafeString((asset as Record<string, unknown>).templateKey, 200),
    })),
    ...imageAssets.filter(Boolean).map((asset) => ({
      assetId: toSafeString((asset as Record<string, unknown>).assetId, 160),
      assetType: "image" as const,
      origin: "gen_studio" as const,
      role: "social_image" as const,
      templateKey: toSafeString((asset as Record<string, unknown>).templateKey, 200),
    })),
  ].filter((asset) => asset.assetId);

  return { promotionAssets } as const;
}

function getUploadPolicy(settings: unknown, channels: SocialChannel[]) {
  const criteria = toUnknownRecord(toUnknownRecord(settings).marketingCriteria);
  const policy = toUnknownRecord(criteria.uploadPolicy);
  const version = Number(policy.version);
  const policyChannels = toUnknownRecord(policy.channels);
  if (!Number.isSafeInteger(version) || version < 1) return null;
  if (channels.some((channel) => !Object.keys(toUnknownRecord(policyChannels[channel])).length)) return null;
  return { version, channels: Object.fromEntries(channels.map((channel) => [channel, policyChannels[channel]])) };
}

function buildInstruction(input: {
  campaignId: string;
  goal: string;
  target: string;
  message: string;
  period: Record<string, string>;
  channels: SocialChannel[];
  revenuePath: string;
  uploadPolicyVersion: number;
  studioAssetIds: string[];
}) {
  return [
    `상품 캠페인 ${input.campaignId}를 ${input.channels.join(", ")} 채널용으로 작성한다.`,
    `목표: ${input.goal}`,
    `타깃: ${input.target}`,
    `핵심 메시지: ${input.message}`,
    `기간: ${input.period.startsAt || "미정"} ~ ${input.period.endsAt || "미정"}`,
    `수익 경로: ${input.revenuePath}`,
    `uploadPolicy version ${input.uploadPolicyVersion}을 기준으로 Pre-Fit을 통과한 채널만 생성한다.`,
    `사용자가 선택한 Gen Studio asset(${input.studioAssetIds.join(", ")})을 social copy/image 후보와 연결하고, 상품 source snapshot과 다른 사실을 추가하지 않는다.`,
    "Threads는 관찰·제작 과정·제품 proof 중심으로, Instagram은 Before/After·모델컷·제작 과정 이미지 계획을 포함한다.",
    "상품 source snapshot의 allowedClaims와 productFacts 밖의 가격·효과·성과 단정을 만들지 않는다.",
    "각 채널 draft의 sourceCoverage·channelFit·marketingFit·adFit·독립 오탈자 검수를 수행하고 waiting_review에서 멈춘다. 발행·예약은 수행하지 않는다.",
  ].join("\n");
}

export const POST = withAuth(
  async (data, user, _request, context) =>
    await withApiTimeout(async () => {
      try {
        if (!isMarketingFeatureEnabled()) {
          return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
        }

        const { universeId, draftId } = context.params as { universeId: string; draftId: string };
        const safeUniverseId = toSafeString(universeId, 120);
        const safeDraftId = toSafeString(draftId, 160);
        const campaignId = toSafeString(data?.campaignId, 120);
        const goal = toSafeString(data?.goal, 1000);
        const target = toSafeString(data?.target, 1000);
        const message = toSafeString(data?.message, 2000);
        const revenuePath = toSafeString(data?.revenuePath, 1000);
        const period = parsePeriod(data?.period);
        const channels = parseChannels(data?.channelPlan);

        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(campaignId)) {
          return badRequest("campaignId는 영문·숫자와 . _ : - 만 사용할 수 있습니다.", "campaign_id_invalid");
        }
        const required = Object.entries({ goal, target, message, revenuePath }).filter(([, value]) => !value).map(([key]) => key);
        if (required.length) return badRequest("캠페인 목표·타깃·메시지·수익 경로를 입력해 주세요.", "campaign_fields_required", { fields: required });
        if (!period) return badRequest("캠페인 기간이 유효하지 않습니다.", "campaign_period_invalid");
        if (!channels.length) return badRequest("Threads 또는 Instagram을 하나 이상 선택해 주세요.", "channel_plan_required");

        const resolvedPromotionAssets = await resolvePromotionAssets({
          raw: data?.studioAssets,
          universeId: safeUniverseId,
          userId: String(user.ID || user.uid || user.userEmail || ""),
        });
        if ("errorCode" in resolvedPromotionAssets) {
          return badRequest("선택한 Gen Studio asset을 확인할 수 없습니다.", toSafeString(resolvedPromotionAssets.errorCode) || "studio_asset_invalid");
        }
        if (!resolvedPromotionAssets.promotionAssets.length) {
          return badRequest("Marketing Oops에 연결할 Gen Studio asset을 하나 이상 선택해 주세요.", "studio_asset_required");
        }

        const draft = await getCommerceDraftByDraftId(safeDraftId);
        if (!draft || toSafeString(draft.universeId, 120) !== safeUniverseId) {
          return NextResponse.json({ success: false, message: "상품을 찾을 수 없습니다.", errorCode: "draft_not_found" }, { status: 404 });
        }
        if (draft.status !== "published") {
          return badRequest("스마트스토어에 등록된 상품만 Marketing Oops에 연결할 수 있습니다.", "draft_not_published");
        }

        const [credentialStatus, settings] = await Promise.all([
          getCredentialStatus(safeUniverseId),
          getMarketingKeywordSettings(safeUniverseId),
        ]);
        const storeId = toSafeString(credentialStatus.naver?.extras?.storeId, 120);
        if (!storeId) {
          return NextResponse.json(
            { success: false, message: "스마트스토어 storeId가 없어 상품 URL을 만들 수 없습니다.", errorCode: "store_id_unavailable" },
            { status: 409 },
          );
        }
        const uploadPolicy = getUploadPolicy(settings, channels);
        if (!uploadPolicy) {
          return NextResponse.json(
            { success: false, message: "최신 Marketing uploadPolicy를 확인할 수 없어 작업을 만들지 않았습니다.", errorCode: "marketing_upload_policy_unavailable" },
            { status: 503 },
          );
        }

        const storeManagerUrl = `/store/${encodeURIComponent(safeUniverseId)}/manage?mode=manage&view=edit&draftId=${encodeURIComponent(safeDraftId)}`;
        const snapshot = buildCommerceProductSourceSnapshotFromDraft({
          draft,
          storeId,
          campaignId,
          storeManagerUrl,
          promotionAssets: resolvedPromotionAssets.promotionAssets,
        });
        const campaignContext = {
          pipelineVersion: 1,
          entryPoint: "store_product_promote",
          campaignId,
          goal,
          target,
          message,
          period,
          channelPlan: { channels },
          revenuePath,
          uploadPolicyVersion: uploadPolicy.version,
          sourceFingerprint: snapshot.sourceFingerprint,
          snapshotHash: snapshot.snapshotHash,
          studioAssets: snapshot.promotion,
          studioAssetIds: resolvedPromotionAssets.promotionAssets.map((asset) => asset.assetId),
          attribution: {
            level: "commerce_product_campaign",
            draftId: snapshot.draftId,
            draftRevision: snapshot.draftRevision,
            channelProductNo: snapshot.channelProductNo,
          },
        };
        const result = await enqueueMarketingSourceSnapshots({
          universeId: safeUniverseId,
          snapshots: [snapshot],
          queueCategory: "smartstore-product",
          requestedBy: `store:${String(user.ID || "")}`,
          trigger: "smartstore_product_marketing",
          generationMode: "local_agent",
          reviewMode: "review_required",
          channels,
          instructionText: buildInstruction({
            ...campaignContext,
            channels,
            studioAssetIds: resolvedPromotionAssets.promotionAssets.map((asset) => asset.assetId),
          }),
          campaignContext,
        });
        const jobId = toSafeString(result.enqueued[0]?.jobId || result.skipped[0]?.jobId, 160);
        if (!jobId && result.failed.length) {
          return NextResponse.json(
            { success: false, message: "상품 Marketing Oops 작업을 만들지 못했습니다.", errorCode: "marketing_enqueue_failed", data: result },
            { status: 422 },
          );
        }

        logger.info("스마트스토어 상품 Marketing Oops 연결 성공", {
          userId: user.ID,
          universeId: safeUniverseId,
          draftId: safeDraftId,
          draftRevision: snapshot.draftRevision,
          campaignId,
          jobId,
          deduplicated: !result.enqueued.length,
        });
        return NextResponse.json({
          success: true,
          data: {
            jobId,
            status: result.enqueued.length ? "queued" : "deduplicated",
            result,
            source: {
              sourceKind: snapshot.sourceKind,
              draftId: snapshot.draftId,
              draftRevision: snapshot.draftRevision,
              snapshotHash: snapshot.snapshotHash,
              sourceFingerprint: snapshot.sourceFingerprint,
            },
          },
        });
      } catch (error) {
        if (error instanceof CommerceProductSourceContractError) {
          return NextResponse.json(
            { success: false, message: error.message, errorCode: error.errorCode, details: error.details },
            { status: error.status },
          );
        }
        logger.error("스마트스토어 상품 Marketing Oops 연결 실패:", error);
        return NextResponse.json(
          { success: false, message: toErrorMessage(error, "상품 Marketing Oops 연결 중 오류가 발생했습니다.") },
          { status: 500 },
        );
      }
    }, 20000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "universe_commerce_draft_marketing_enqueue",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
