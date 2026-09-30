import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  bindCommerceDraftPublishResult,
  buildCommercePublishJobDedupeKey,
  claimCommercePublishJobExecution,
  getCommercePublishJob,
  getOrCreateCommercePublishJob,
  findLatestPublishJobByDedupeKey,
  getCommerceDraftByDraftId,
  markCommercePublishJobFailed,
  markCommercePublishJobPartial,
  markCommercePublishJobSuccess,
  claimCommerceDraftPublish,
  releaseCommerceDraftPublish,
  snapshotCommerceDraftRevision,
} from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftPublish } from "libs/server-utils/api/routeValidators";
import { getNaverDraftConnector } from "libs/server-utils/commerce/naverDraftConnector";
import { buildNaverPublishPreviewFromDraft } from "libs/server-utils/commerce/naverDraftPayloadMapper";
import { syncNaverProductToStorefront } from "libs/server-utils/commerce/naverStorefrontSyncService";
import {
  buildCommercePublishDiff,
  buildCommercePublishIdempotencyKey,
  compareCommercePublishReadback,
} from "libs/server-utils/commerce/commercePublishContract";
import type { SmartstoreDraftValidationMode } from "libs/server-utils/commerce/naverDraftValidation";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import {
  assertCommerceDraftExpectedRevision,
  commerceDraftErrorResponse,
  commerceDraftErrorResponseForCode,
  COMMERCE_DRAFT_ERROR_CODES,
} from "libs/server-utils/commerce/commerceDraftContract";
import { logger } from "utils/log";
import { toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / publish) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  publish job 생성  네이버 create/update publish  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toFiniteNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function hashSnapshot(snapshot: UnknownRecord) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot || {}), "utf8").digest("hex");
}

function hasMeaningfulKeys(payload?: UnknownRecord, ignoreKeys: string[] = []) {
  return Object.keys(payload || {}).some((key) => !ignoreKeys.includes(key));
}

function inferPublishMode(draft: UnknownRecord, preferredMode?: unknown): SmartstoreDraftValidationMode {
  const mode = toSafeString(preferredMode).toLowerCase();
  if (mode === "create" || mode === "update") return mode;
  const smartstore = toUnknownRecord(draft.smartstore);
  if (smartstore.channelProductNo || smartstore.originProductNo) return "update";
  return "create";
}

function findFirstNumberByKeys(
  value: unknown,
  keys: string[],
  depth = 0,
  visited = new WeakSet<object>(),
): number | undefined {
  if (depth > 8 || value == null) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstNumberByKeys(item, keys, depth + 1, visited);
      if (found != null) return found;
    }
    return undefined;
  }

  if (typeof value !== "object") return undefined;
  if (visited.has(value as object)) return undefined;
  visited.add(value as object);

  const record = value as UnknownRecord;
  for (const key of keys) {
    const picked = toFiniteNumber(record[key]);
    if (picked != null && picked > 0) return picked;
  }

  for (const item of Object.values(record)) {
    const found = findFirstNumberByKeys(item, keys, depth + 1, visited);
    if (found != null) return found;
  }

  return undefined;
}

function buildStorefrontSnapshot(draft: UnknownRecord) {
  const display = toUnknownRecord(draft.display);
  const smartstore = toUnknownRecord(draft.smartstore);
  return {
    title: display.title,
    summary: display.summary,
    price: smartstore.salePrice ?? display.price,
    inStock: Number(smartstore.stockQuantity || 0) > 0 && toSafeString(smartstore.statusType) === "SALE",
  };
}

function buildPublishAssetLineage(draft: UnknownRecord) {
  const smartstore = toUnknownRecord(draft.smartstore);
  const images = Array.isArray(smartstore.images) ? smartstore.images : [];
  return {
    assetIds: images.map((image) => toSafeString(toUnknownRecord(image).assetId)).filter(Boolean),
    imageCount: images.length,
    status: "pending",
  };
}

function extractPublishTargetRef(draft: UnknownRecord, responseSnapshot?: UnknownRecord) {
  const smartstore = toUnknownRecord(draft.smartstore);
  return {
    channelProductNo:
      findFirstNumberByKeys(responseSnapshot, ["channelProductNo"]) ||
      (toFiniteNumber(smartstore.channelProductNo) || undefined),
    originProductNo:
      findFirstNumberByKeys(responseSnapshot, ["originProductNo"]) ||
      (toFiniteNumber(smartstore.originProductNo) || undefined),
    sellerManagementCode: toSafeString(smartstore.sellerManagementCode),
  };
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    let publishClaimed = false;
    let activeJobId = "";
    let activeResponseSnapshot: UnknownRecord | null = null;
    const actor = String(user.ID || "");
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);

      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const expectedRevision = assertCommerceDraftExpectedRevision({
        draft,
        expectedRevision: data?.expectedRevision,
      });

      const draftRecord = toUnknownRecord(draft);
      const draftSmartstore = toUnknownRecord(draftRecord.smartstore);
      const mode = inferPublishMode(draftRecord, data?.mode);
      const preview = buildNaverPublishPreviewFromDraft({
        draft,
        mode,
        categoryPolicyGroup: data?.categoryPolicyGroup || draftSmartstore.categoryPolicyGroup,
      });

      if (!preview.validation.ready) {
        return commerceDraftErrorResponseForCode({
          code: COMMERCE_DRAFT_ERROR_CODES.NOT_READY,
          status: 422,
          message: "현재 draft는 publish readiness를 통과하지 못했습니다.",
          details: {
            draftId,
            universeId,
            draftRevision: expectedRevision,
            validation: preview.validation,
          },
        });
      }

      const createPayload = (preview.preview?.createPayload || {}) as UnknownRecord;
      const channelPayload = (preview.preview?.updatePayloads?.channelProduct || {}) as UnknownRecord;
      const originPayload = (preview.preview?.updatePayloads?.originProduct || {}) as UnknownRecord;
      const requestSnapshot =
        mode === "create"
          ? createPayload
          : {
              channelProduct: channelPayload,
              originProduct: originPayload,
            };

      const payloadHash = hashSnapshot(requestSnapshot);
      const idempotencyKey = buildCommercePublishIdempotencyKey({
        universeId,
        draftId,
        draftRevision: expectedRevision,
        mode,
      });
      const dedupeKey = buildCommercePublishJobDedupeKey({
        universeId,
        draftId,
        operation: mode,
        draftRevision: expectedRevision,
      });

      const latestJob = await findLatestPublishJobByDedupeKey(dedupeKey);
      if (latestJob && (latestJob.status === "running" || latestJob.status === "success")) {
        return NextResponse.json({
          success: true,
          data: {
            deduped: true,
            idempotencyKey,
            job: latestJob,
            draft,
          },
        });
      }

      if (mode === "create" && !hasMeaningfulKeys(createPayload)) {
        return NextResponse.json(
          { success: false, message: "신규 등록 payload가 비어 있습니다. 필수 메타데이터를 먼저 저장하세요." },
          { status: 400 },
        );
      }

      if (
        mode === "update" &&
        !hasMeaningfulKeys(channelPayload, ["channelProductNo"]) &&
        !hasMeaningfulKeys(originPayload, ["originProductNo"])
      ) {
        return NextResponse.json(
          { success: false, message: "업데이트 가능한 payload가 없습니다. import 또는 draft 수정을 먼저 진행하세요." },
          { status: 400 },
        );
      }

      const claimedDraft = await claimCommerceDraftPublish({
        draftId,
        expectedRevision,
        actor,
        validation: preview.validation,
      });
      if (!claimedDraft) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }
      publishClaimed = true;
      const claimedDraftRecord = toUnknownRecord(claimedDraft);
      const claimedDraftSmartstore = toUnknownRecord(claimedDraftRecord.smartstore);

      const { client, storeId } = await getNaverDraftConnector(universeId);
      const job = await getOrCreateCommercePublishJob({
        draftId,
        universeId,
        operation: mode,
        actor,
        draftRevision: expectedRevision,
        attempt: latestJob ? Number(latestJob.attempt || 1) + 1 : 1,
        payloadHash,
        dedupeKey,
        idempotencyKey,
        requestSnapshot,
        targetRef: {
          channelProductNo: toFiniteNumber(claimedDraftSmartstore.channelProductNo) || undefined,
          originProductNo: toFiniteNumber(claimedDraftSmartstore.originProductNo) || undefined,
          sellerManagementCode: toSafeString(claimedDraftSmartstore.sellerManagementCode),
        },
      });

      activeJobId = String(job.jobId || "");
      const executionJob = await claimCommercePublishJobExecution({
        jobId: activeJobId,
        owner: `${actor}:${crypto.randomUUID()}`,
      });
      if (!executionJob) {
        const persistedJob = await getCommercePublishJob(activeJobId);
        await releaseCommerceDraftPublish({ draftId, actor, status: "ready" });
        publishClaimed = false;
        if (persistedJob && (persistedJob.status === "running" || persistedJob.status === "success")) {
          return NextResponse.json({
            success: true,
            data: { deduped: true, idempotencyKey, job: persistedJob, draft },
          });
        }
        throw new Error("publish job 실행 권한을 확보하지 못했습니다.");
      }

      const responseSnapshot: UnknownRecord = {
        assetLineage: buildPublishAssetLineage(claimedDraftRecord),
      };
      activeResponseSnapshot = responseSnapshot;
      const errors: Array<{ stage: string; message: string }> = [];
      let beforeReadback: UnknownRecord | null = null;

      if (mode === "update") {
        const beforeChannelProductNo = toFiniteNumber(claimedDraftSmartstore.channelProductNo);
        if (beforeChannelProductNo) {
          try {
            beforeReadback = toUnknownRecord(await client.getProductDetail(beforeChannelProductNo));
            responseSnapshot.beforeReadback = beforeReadback;
          } catch (error) {
            responseSnapshot.beforeReadbackError = toErrorMessage(error, "등록 전 상품 read-back 실패");
          }
        }
      }

      if (mode === "create") {
        try {
          responseSnapshot.product = await client.createProduct(createPayload as Parameters<typeof client.createProduct>[0]);
        } catch (error) {
          errors.push({
            stage: "product",
            message: toErrorMessage(error, "상품 신규 등록 실패"),
          });
        }
      } else {
        if (hasMeaningfulKeys(originPayload, ["originProductNo"])) {
          try {
            const originProductNo = Number(claimedDraftSmartstore.originProductNo || originPayload.originProductNo || 0);
            responseSnapshot.originProduct = await client.updateOriginProduct(originProductNo, originPayload);
          } catch (error) {
            errors.push({
              stage: "originProduct",
              message: toErrorMessage(error, "원상품 업데이트 실패"),
            });
          }
        }

        if (hasMeaningfulKeys(channelPayload, ["channelProductNo"])) {
          try {
            const channelProductNo = Number(claimedDraftSmartstore.channelProductNo || channelPayload.channelProductNo || 0);
            responseSnapshot.channelProduct = await client.updateChannelProduct(channelProductNo, channelPayload);
          } catch (error) {
            errors.push({
              stage: "channelProduct",
              message: toErrorMessage(error, "채널상품 업데이트 실패"),
            });
          }
        }
      }

      const targetRef = extractPublishTargetRef(claimedDraftRecord, responseSnapshot);
      if (mode === "create" && !targetRef.channelProductNo && !targetRef.originProductNo) {
        errors.push({
          stage: "publish",
          message: "신규 등록 응답에서 상품 번호를 확인하지 못했습니다. job 응답을 검토하세요.",
        });
      }

      if (targetRef.channelProductNo) {
        try {
          const readback = toUnknownRecord(await client.getProductDetail(targetRef.channelProductNo));
          responseSnapshot.readback = readback;
          const readbackVerification = compareCommercePublishReadback({
            mode,
            requestSnapshot,
            readback,
            targetRef,
          });
          responseSnapshot.readbackVerification = readbackVerification;
          if (beforeReadback) {
            responseSnapshot.affectedFieldDiff = buildCommercePublishDiff({ before: beforeReadback, after: readback });
          }
          if (!readbackVerification.matched) {
            errors.push({
              stage: "sync",
              message: `등록 후 read-back 검증 불일치: ${readbackVerification.mismatches.map((item) => item.field).join(", ")}`,
            });
          }
        } catch (error) {
          errors.push({ stage: "sync", message: toErrorMessage(error, "등록 후 상품 read-back 실패") });
        }
      } else {
        errors.push({ stage: "sync", message: "등록 후 read-back에 필요한 channelProductNo가 없습니다." });
      }

      if (errors.length === 0) {
        const publishedAt = new Date();
        const publishedDraft = await bindCommerceDraftPublishResult({
          draftId,
          updatedBy: actor,
          operation: mode,
          jobId: String(job.jobId || ""),
          payloadHash,
          publishedAt,
          channelProductNo: targetRef.channelProductNo,
          originProductNo: targetRef.originProductNo,
          statusType: toSafeString(claimedDraftSmartstore.statusType),
          storefrontSnapshot: buildStorefrontSnapshot(claimedDraftRecord),
          lockedBy: actor,
        });
        publishClaimed = false;

        if (!publishedDraft || !responseSnapshot.readback) {
          throw new Error("publish 결과 draft 또는 read-back이 없습니다.");
        }
        const storefrontSync = await syncNaverProductToStorefront({
          client,
          universeId,
          actor,
          rawProduct: toUnknownRecord(responseSnapshot.readback),
          storeId,
        });
        if (!storefrontSync.draft || (!storefrontSync.storefrontProduct && storefrontSync.action !== "hidden")) {
          const partialJob = await markCommercePublishJobPartial({
            jobId: activeJobId,
            responseSnapshot: {
              ...responseSnapshot,
              projection: { action: storefrontSync.action, message: storefrontSync.message },
            },
            targetRef,
            error: {
              code: "STOREFRONT_PROJECTION_FAILED",
              message: "storefront projection 생성에 실패했습니다.",
              stage: "sync",
            },
          });
          return NextResponse.json(
            {
              success: false,
              message: "Naver 등록은 완료되었지만 storefront projection이 완료되지 않았습니다.",
              data: { job: partialJob, errors: [{ stage: "sync", message: "storefront projection 생성에 실패했습니다." }] },
            },
            { status: 207 },
          );
        }

        const successJob = await markCommercePublishJobSuccess({
          jobId: activeJobId,
          responseSnapshot: {
            ...responseSnapshot,
            assetLineage: { ...toUnknownRecord(responseSnapshot.assetLineage), status: "confirmed" },
            projection: { action: storefrontSync.action, storefrontProduct: storefrontSync.storefrontProduct },
          },
          targetRef,
        });
        invalidateUniverseDetailPromptCache(universeId);

        await snapshotCommerceDraftRevision({
          draftId,
          actor,
          source: "publish_result",
          summary: mode === "create" ? "스마트스토어 신규 등록 publish 성공" : "스마트스토어 수정 publish 성공",
          patchMeta: {
            jobId: String(job.jobId || ""),
            payloadHash,
            operation: mode,
            targetRef,
          },
        });

        logger.info(mode === "create" ? "스마트스토어 신규 등록 publish 성공" : "스마트스토어 수정 publish 성공", {
          userId: user.ID,
          universeId,
          draftId,
          jobId: job.jobId,
          operation: mode,
        });

        return NextResponse.json({
          success: true,
          data: {
            deduped: false,
            idempotencyKey,
            job: successJob,
            draft: storefrontSync.draft,
            storefrontProduct: storefrontSync.storefrontProduct,
          },
        });
      }

      const hasSuccessStep =
        mode === "create"
          ? Boolean(responseSnapshot.product)
          : Boolean(responseSnapshot.originProduct || responseSnapshot.channelProduct);
      responseSnapshot.assetLineage = {
        ...toUnknownRecord(responseSnapshot.assetLineage),
        status: hasSuccessStep ? "external_attached_reconcile" : "orphan_candidate",
      };

      const failedJob = hasSuccessStep
        ? await markCommercePublishJobPartial({
            jobId: String(job.jobId || ""),
            responseSnapshot,
            targetRef,
            error: {
              code: "PARTIAL_PUBLISH",
              message: errors.map((item) => item.message).join(" | "),
              stage: "publish",
            },
          })
        : await markCommercePublishJobFailed({
            jobId: String(job.jobId || ""),
            responseSnapshot,
            error: {
              code: "PUBLISH_FAILED",
              message: errors.map((item) => item.message).join(" | "),
              stage: "publish",
            },
          });

  await Promise.all([
        targetRef.channelProductNo || targetRef.originProductNo
          ? bindCommerceDraftPublishResult({
              draftId,
              updatedBy: actor,
              operation: mode,
              jobId: String(job.jobId || ""),
              payloadHash,
              channelProductNo: targetRef.channelProductNo,
              originProductNo: targetRef.originProductNo,
              statusType: toSafeString(claimedDraftSmartstore.statusType),
              storefrontSnapshot: buildStorefrontSnapshot(claimedDraftRecord),
              failed: true,
              lockedBy: actor,
            }).then(() => {
              publishClaimed = false;
            })
          : releaseCommerceDraftPublish({ draftId, actor, status: "publish_failed" }).then(() => {
              publishClaimed = false;
            }),
        snapshotCommerceDraftRevision({
          draftId,
          actor,
          source: "publish_result",
          summary:
            mode === "create"
              ? hasSuccessStep
                ? "스마트스토어 신규 등록 publish 부분 실패"
                : "스마트스토어 신규 등록 publish 실패"
              : hasSuccessStep
                ? "스마트스토어 수정 publish 부분 실패"
                : "스마트스토어 수정 publish 실패",
          patchMeta: {
            jobId: String(job.jobId || ""),
            operation: mode,
            errors,
          },
        }),
      ]);

      return NextResponse.json(
        {
          success: false,
          message: hasSuccessStep
            ? "일부 항목만 반영되었습니다. job 이력을 확인하고 다시 시도하세요."
            : mode === "create"
              ? "스마트스토어 신규 등록 publish에 실패했습니다."
              : "스마트스토어 수정 publish에 실패했습니다.",
          error: {
            code: hasSuccessStep ? "partial_publish" : "publish_failed",
            message: hasSuccessStep
              ? "일부 항목만 반영되었습니다. job 이력을 확인하고 다시 시도하세요."
              : mode === "create"
                ? "스마트스토어 신규 등록 publish에 실패했습니다."
                : "스마트스토어 수정 publish에 실패했습니다.",
          },
          errorCode: hasSuccessStep ? "partial_publish" : "publish_failed",
          data: {
            job: failedJob,
            errors,
          },
        },
        { status: hasSuccessStep ? 207 : 500 },
      );
    } catch (error) {
      if (activeJobId && activeResponseSnapshot) {
        const activeJob = await getCommercePublishJob(activeJobId).catch(() => null);
        if (activeJob?.status === "running") {
          const hasExternalResponse = Boolean(
            activeResponseSnapshot.product || activeResponseSnapshot.originProduct || activeResponseSnapshot.channelProduct,
          );
          const jobError = {
            code: hasExternalResponse ? "PARTIAL_PUBLISH" : "PUBLISH_UNHANDLED_ERROR",
            message: toErrorMessage(error, "스마트스토어 publish 중 오류"),
            stage: "publish",
          };
          if (hasExternalResponse) {
            await markCommercePublishJobPartial({
              jobId: activeJobId,
              responseSnapshot: activeResponseSnapshot,
              targetRef: extractPublishTargetRef({}, activeResponseSnapshot),
              error: jobError,
            }).catch((jobErrorWrite) => logger.error("스마트스토어 partial job 상태 기록 실패:", jobErrorWrite));
          } else {
            await markCommercePublishJobFailed({
              jobId: activeJobId,
              responseSnapshot: activeResponseSnapshot,
              error: jobError,
            }).catch((jobErrorWrite) => logger.error("스마트스토어 failed job 상태 기록 실패:", jobErrorWrite));
          }
        }
      }
      if (publishClaimed) {
        await releaseCommerceDraftPublish({ draftId: String(context.params?.draftId || ""), actor, status: "ready" }).catch(
          (releaseError) => logger.error("스마트스토어 publish lock 해제 실패:", releaseError),
        );
      }
      logger.error("스마트스토어 publish 실패:", error);
      return commerceDraftErrorResponse(error, "스마트스토어 publish 중 오류가 발생했습니다.");
    }
  },
  (data) => validateCommerceDraftPublish({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_publish",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
