import "server-only";

import { MARKETING_DRY_RUN } from "consts/marketing/server";
import type { MarketingChannel } from "consts/marketing/queue";
import {
  createMarketingJob,
  createMarketingJobStep,
  findMarketingJobByIdempotencyKey,
  updateMarketingJobStatus,
} from "libs/database/marketing";
import {
  enqueueMarketingJob,
  retryMarketingJob,
} from "libs/marketing/ingest/contentQueueService";
import type { MarketingOopsNextAction } from "libs/server-utils/marketing/marketingOopsNextActionContract";
import { toMarketingOopsPatternSourceSnapshot } from "libs/server-utils/marketing/marketingOopsNextActionContract";
import { normalizeMarketingQueueCategory } from "libs/marketing/queue/categoryConfig";

/**
 * @docHint
 * @purpose AIR-803 Pattern 기반 Next Action을 기존 Marketing queue에 draft-only로 handoff
 * @process idempotency 조회 -> 동일 job 재사용/재시도 -> 신규 job·step 생성 -> Redis enqueue
 * @domain marketing-ops-intelligence
 * @scope server-service
 */

const MARKETING_OOPS_QUEUE_CATEGORY = "intelligence-pattern";
const RETRYABLE_JOB_STATUSES = new Set(["failed", "rejected", "canceled", "partial"]);
const ACTIVE_JOB_STATUSES = new Set(["queued", "ready", "running", "waiting_review", "approved"]);

function toSafeString(value: unknown, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === 11000);
}

export type MarketingOopsPatternQueueResult =
  | {
      ok: true;
      status: "enqueued" | "deduplicated" | "retry_queued";
      jobId: string;
      idempotencyKey: string;
      dedupeKey: string;
      draftOnly: true;
      approvalRequired: true;
    }
  | {
      ok: false;
      status: "retry_required" | "unavailable" | "conflict";
      error: string;
      jobId?: string;
    };

export async function enqueueMarketingOopsPatternAction(args: {
  universeId: string;
  action: MarketingOopsNextAction;
  requestedBy: string;
  retry?: boolean;
}): Promise<MarketingOopsPatternQueueResult> {
  const universeId = toSafeString(args.universeId, 160);
  const requestedBy = toSafeString(args.requestedBy, 160);
  const action = args.action;
  const queueCategory = normalizeMarketingQueueCategory(MARKETING_OOPS_QUEUE_CATEGORY);
  const existing = await findMarketingJobByIdempotencyKey({
    universeId,
    idempotencyKey: action.idempotencyKey,
  });

  if (existing?.jobId) {
    const status = toSafeString(existing.status);
    if (RETRYABLE_JOB_STATUSES.has(status) && args.retry) {
      const retry = await retryMarketingJob({
        universeId,
        jobId: toSafeString(existing.jobId),
        reason: "marketing_oops_pattern_retry",
        resetTo: "queued",
        requestedBy,
      });
      if (!retry.ok) return { ok: false, status: "unavailable", error: retry.error, jobId: toSafeString(existing.jobId) };
      return {
        ok: true,
        status: "retry_queued",
        jobId: toSafeString(existing.jobId),
        idempotencyKey: action.idempotencyKey,
        dedupeKey: action.dedupeKey,
        draftOnly: true,
        approvalRequired: true,
      };
    }
    if (RETRYABLE_JOB_STATUSES.has(status)) {
      return { ok: false, status: "retry_required", error: "existing_job_requires_explicit_retry", jobId: toSafeString(existing.jobId) };
    }
    if (ACTIVE_JOB_STATUSES.has(status) || status === "success") {
      return {
        ok: true,
        status: "deduplicated",
        jobId: toSafeString(existing.jobId),
        idempotencyKey: action.idempotencyKey,
        dedupeKey: action.dedupeKey,
        draftOnly: true,
        approvalRequired: true,
      };
    }
    return { ok: false, status: "conflict", error: "existing_job_state_not_reusable", jobId: toSafeString(existing.jobId) };
  }

  const sourceSnapshot = toMarketingOopsPatternSourceSnapshot(action);
  const channels = action.channels as MarketingChannel[];
  const generationConfig = {
    generationMode: "local_agent",
    reviewMode: "review_required",
    reviewRequired: true,
    autoPublishAfterReview: false,
    instructionText: [
      "Marketing Oops Pattern 기반 콘텐츠 초안입니다.",
      "Pattern Evidence와 AMU 성과를 혼동하지 말고, 외부/기사 근거는 성과 주장으로 사용하지 마세요.",
      `Primary Action: ${action.action}`,
      `Do Not Change: ${action.doNotChange}`,
    ].join("\n"),
  };
  const sourceRef = {
    sourceKind: "intelligence_pattern",
    sourceId: action.pattern.patternId,
    patternId: action.pattern.patternId,
    articleRevision: action.pattern.articleRevision,
    sourceSnapshot,
    queueCategory,
    nextAction: action,
  };

  let job;
  try {
    job = await createMarketingJob({
      universeId,
      source: "api_batch",
      sourceRef,
      priority: action.priority,
      queueCategory,
      channels,
      currentStepKey: "normalize_target",
      dedupeKey: action.dedupeKey,
      idempotencyKey: action.idempotencyKey,
      requestedBy,
      dryRun: MARKETING_DRY_RUN,
      request: {
        trigger: "intelligence_pattern_next_action",
        idempotencyKey: action.idempotencyKey,
        dedupeKey: action.dedupeKey,
        generationConfig,
        nextAction: action,
      },
      featureFlags: {
        dryRun: MARKETING_DRY_RUN,
        reviewRequired: true,
        autoPublishAfterReview: false,
        draftOnly: true,
        approvalRequired: true,
      },
    });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      const raced = await findMarketingJobByIdempotencyKey({ universeId, idempotencyKey: action.idempotencyKey });
      if (raced?.jobId) {
        return {
          ok: true,
          status: "deduplicated",
          jobId: toSafeString(raced.jobId),
          idempotencyKey: action.idempotencyKey,
          dedupeKey: action.dedupeKey,
          draftOnly: true,
          approvalRequired: true,
        };
      }
    }
    return { ok: false, status: "unavailable", error: "marketing_oops_job_create_failed" };
  }

  try {
    await Promise.all([
      createMarketingJobStep({
        jobId: job.jobId,
        universeId,
        stepKey: "normalize_target",
        status: "queued",
        inputRef: { patternId: action.pattern.patternId, idempotencyKey: action.idempotencyKey },
      }),
      createMarketingJobStep({
        jobId: job.jobId,
        universeId,
        stepKey: "load_wp_content",
        status: "queued",
        inputRef: { sourceKind: sourceSnapshot.sourceKind, sourceId: sourceSnapshot.sourceId },
      }),
      ...channels.flatMap((channel) => [
        createMarketingJobStep({
          jobId: job.jobId,
          universeId,
          stepKey: "generate_channel_copy",
          status: "queued",
          channel,
          inputRef: { patternId: action.pattern.patternId, channel, idempotencyKey: action.idempotencyKey },
        }),
        createMarketingJobStep({
          jobId: job.jobId,
          universeId,
          stepKey: "validate_output",
          status: "queued",
          channel,
          inputRef: { patternId: action.pattern.patternId, channel, idempotencyKey: action.idempotencyKey },
        }),
      ]),
    ]);

    await enqueueMarketingJob({
      universeId,
      jobId: job.jobId,
      sourceRef,
      scheduledAt: null,
      generationConfig,
    });
  } catch {
    await updateMarketingJobStatus({
      jobId: job.jobId,
      status: "failed",
      currentStepKey: "normalize_target",
      completedAt: new Date(),
      lastError: {
        code: "MARKETING_OOPS_HANDOFF_FAILED",
        message: "Pattern 기반 draft-only queue handoff가 완료되지 않았습니다.",
        retryable: true,
      },
    }).catch(() => null);
    return { ok: false, status: "unavailable", error: "marketing_oops_handoff_failed", jobId: job.jobId };
  }

  return {
    ok: true,
    status: "enqueued",
    jobId: toSafeString(job.jobId),
    idempotencyKey: action.idempotencyKey,
    dedupeKey: action.dedupeKey,
    draftOnly: true,
    approvalRequired: true,
  };
}
