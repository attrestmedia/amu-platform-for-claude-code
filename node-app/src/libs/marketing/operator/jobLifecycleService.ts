import "server-only";

import { getRedisClient } from "libs/cache/redisClient";
import {
  createMarketingAsset,
  getMarketingJobByJobId,
  listMarketingJobSteps,
  updateMarketingJob,
  updateMarketingJobStepStatus,
} from "libs/database/marketing";
import {
  MARKETING_DEFAULT_CONTENT_CHANNELS,
  type MarketingChannel,
  type MarketingJobPriority,
} from "consts/marketing/queue";
import {
  normalizeMarketingQueueCategory,
  normalizeMarketingQueueChannels,
  normalizeMarketingQueuePriority,
} from "libs/marketing/queue/categoryConfig";
import { normalizeMarketingGenerationConfig } from "libs/marketing/generationConfig";
import { toSafeString, type UnknownRecord } from "utils/common/typeUtils";
import {
  getMarketingJobLeaseKey,
  getMarketingJobPayloadKey,
  getMarketingUniverseDeadLetterKey,
  getMarketingUniverseProcessingKey,
  getMarketingUniverseQueueKey,
} from "libs/marketing/queue/keys";

const CANCELABLE_JOB_STATUS = [
  "queued",
  "ready",
  "running",
  "waiting_review",
  "approved",
  "failed",
  "rejected",
  "partial",
  "canceled",
];
const ARCHIVABLE_JOB_STATUS = ["success", "failed", "canceled", "rejected", "partial"];
const ACTIVE_STEP_STATUS = ["queued", "running", "waiting_input", "waiting_review", "approved"];
const GENERATION_STEP_KEYS = [
  "generate_channel_copy",
  "validate_output",
  "publish_threads",
  "publish_instagram",
  "prepare_linkedin_draft",
  "prepare_naver_draft",
];

function toOperatorId(value?: string) {
  return toSafeString(value) || "operator";
}

async function removeJobFromRedisQueues(args: { universeId: string; jobId: string }) {
  const client = await getRedisClient();
  const queueKey = getMarketingUniverseQueueKey(args.universeId);
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const deadLetterKey = getMarketingUniverseDeadLetterKey(args.universeId);

  const [queueRemoved, processingRemoved, deadLetterRemoved] = await Promise.all([
    client.lrem(queueKey, 0, args.jobId),
    client.lrem(processingKey, 0, args.jobId),
    client.lrem(deadLetterKey, 0, args.jobId),
    client.del(getMarketingJobPayloadKey(args.jobId)),
    client.del(getMarketingJobLeaseKey(args.jobId)),
  ]);

  return {
    queueRemoved: Number(queueRemoved || 0),
    processingRemoved: Number(processingRemoved || 0),
    deadLetterRemoved: Number(deadLetterRemoved || 0),
  };
}

async function appendJobLifecycleAudit(args: {
  universeId: string;
  jobId: string;
  action: "cancel" | "archive" | "update_category" | "request_generation";
  reason: string;
  requestedBy: string;
  previousStatus: string;
  nextStatus: string;
  redis?: UnknownRecord;
}) {
  return await createMarketingAsset({
    jobId: args.jobId,
    universeId: args.universeId,
    kind: "audit_log",
    title: `marketing job ${args.action}`,
    mimeType: "application/json",
    content: {
      event: "job_lifecycle",
      action: args.action,
      reason: args.reason,
      previousStatus: args.previousStatus,
      nextStatus: args.nextStatus,
      requestedBy: args.requestedBy,
      redis: args.redis || {},
      createdAt: new Date().toISOString(),
    },
    meta: {
      scope: "job_lifecycle",
      action: args.action,
    },
  });
}

function toChannelList(values: unknown) {
  const channels = normalizeMarketingQueueChannels(values, [...MARKETING_DEFAULT_CONTENT_CHANNELS]).filter((channel) =>
    (MARKETING_DEFAULT_CONTENT_CHANNELS as readonly string[]).includes(channel),
  );
  return channels.length > 0 ? channels : [...MARKETING_DEFAULT_CONTENT_CHANNELS];
}

async function pushJobToRedisQueue(args: {
  universeId: string;
  jobId: string;
  sourceRef: UnknownRecord;
  scheduledAt?: string | Date | null;
  generationConfig?: UnknownRecord;
}) {
  const client = await getRedisClient();
  const queueKey = getMarketingUniverseQueueKey(args.universeId);
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const payloadKey = getMarketingJobPayloadKey(args.jobId);

  await Promise.all([client.lrem(queueKey, 0, args.jobId), client.lrem(processingKey, 0, args.jobId)]);
  await client.rpush(queueKey, args.jobId);
  await client.set(
    payloadKey,
    JSON.stringify({
      universeId: args.universeId,
      sourceRef: args.sourceRef || {},
      scheduledAt: args.scheduledAt || null,
      generationConfig: args.generationConfig || null,
    }),
    "EX",
    60 * 60 * 24,
  );
}

async function resetGenerationSteps(args: {
  jobId: string;
  channels: MarketingChannel[];
  requestedBy: string;
  reason: string;
}) {
  const steps = await listMarketingJobSteps({ jobId: args.jobId, limit: 200 });
  const channelSet = new Set(args.channels);
  const targetSteps = steps.filter((step) => {
    const stepKey = toSafeString(step.stepKey);
    const channel = toSafeString(step.channel);
    if (!GENERATION_STEP_KEYS.includes(stepKey)) return false;
    if (stepKey === "publish_threads") return channelSet.has("threads");
    if (stepKey === "publish_instagram") return channelSet.has("instagram");
    if (stepKey === "prepare_linkedin_draft") return channelSet.has("linkedin");
    if (stepKey === "prepare_naver_draft") return channelSet.has("naver_blog");
    return channelSet.has(channel as MarketingChannel);
  });

  await Promise.all(
    targetSteps.map((step) =>
      updateMarketingJobStepStatus({
        stepId: step.stepId,
        status: "queued",
        workerId: "",
        leaseExpiresAt: null,
        outputRef: {},
        meta: {
          ...(step.meta || {}),
          generationRequestedAt: new Date().toISOString(),
          generationRequestedBy: args.requestedBy,
          generationRequestReason: args.reason,
        },
        lastError: null,
        startedAt: null,
        completedAt: null,
      }),
    ),
  );

  return targetSteps.length;
}

async function skipOpenJobSteps(args: { universeId: string; jobId: string; requestedBy: string; reason: string }) {
  const steps = await listMarketingJobSteps({ jobId: args.jobId, limit: 200 });
  const now = new Date();
  const openSteps = steps.filter((step) => ACTIVE_STEP_STATUS.includes(toSafeString(step.status)));

  await Promise.all(
    openSteps.map((step) =>
      updateMarketingJobStepStatus({
        stepId: step.stepId,
        status: "skipped",
        workerId: toSafeString(step.workerId),
        leaseExpiresAt: null,
        meta: {
          ...(step.meta || {}),
          canceledAt: now.toISOString(),
          canceledBy: args.requestedBy,
          cancelReason: args.reason,
        },
        lastError: null,
        completedAt: now,
      }),
    ),
  );

  return openSteps.length;
}

export async function cancelMarketingJob(args: {
  universeId: string;
  jobId: string;
  requestedBy?: string;
  reason?: string;
  archive?: boolean;
}) {
  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) {
    return { ok: false as const, status: 404, error: "job_not_found" };
  }

  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const previousStatus = toSafeString(job.status);
  if (!CANCELABLE_JOB_STATUS.includes(previousStatus)) {
    return { ok: false as const, status: 400, error: "job_not_cancelable" };
  }

  const now = new Date();
  const requestedBy = toOperatorId(args.requestedBy);
  const reason = toSafeString(args.reason) || "operator_cancel";
  const redis = await removeJobFromRedisQueues({
    universeId: args.universeId,
    jobId: args.jobId,
  });
  const skippedStepCount = await skipOpenJobSteps({
    universeId: args.universeId,
    jobId: args.jobId,
    requestedBy,
    reason,
  });
  const archive = Boolean(args.archive);

  const updatedJob = await updateMarketingJob({
    jobId: args.jobId,
    set: {
      status: "canceled",
      currentStepKey: "",
      completedAt: now,
      canceledAt: now,
      canceledBy: requestedBy,
      ...(archive ? { archivedAt: now, archivedBy: requestedBy } : {}),
      lastError: {
        code: "JOB_CANCELED",
        message: "Job canceled by operator.",
        reason,
      },
      request: {
        ...(job.request || {}),
        cancelReason: reason,
        canceledBy: requestedBy,
        ...(archive ? { archiveReason: reason, archivedBy: requestedBy } : {}),
      },
      metrics: {
        ...(job.metrics || {}),
        lifecycle: {
          ...(job.metrics?.lifecycle || {}),
          canceledAt: now.toISOString(),
          canceledBy: requestedBy,
          cancelReason: reason,
          ...(archive ? { archivedAt: now.toISOString(), archivedBy: requestedBy } : {}),
        },
      },
    },
  });

  await appendJobLifecycleAudit({
    universeId: args.universeId,
    jobId: args.jobId,
    action: "cancel",
    reason,
    requestedBy,
    previousStatus,
    nextStatus: "canceled",
    redis,
  });

  return {
    ok: true as const,
    jobId: args.jobId,
    status: "canceled" as const,
    archived: archive,
    skippedStepCount,
    redis,
    job: updatedJob,
  };
}

export async function archiveMarketingJob(args: {
  universeId: string;
  jobId: string;
  requestedBy?: string;
  reason?: string;
}) {
  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) {
    return { ok: false as const, status: 404, error: "job_not_found" };
  }

  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const previousStatus = toSafeString(job.status);
  if (!ARCHIVABLE_JOB_STATUS.includes(previousStatus)) {
    return { ok: false as const, status: 400, error: "job_not_archivable" };
  }

  const now = new Date();
  const requestedBy = toOperatorId(args.requestedBy);
  const reason = toSafeString(args.reason) || "operator_archive";
  const alreadyArchived = Boolean(job.archivedAt);
  const updatedJob = alreadyArchived
    ? job
    : await updateMarketingJob({
        jobId: args.jobId,
        set: {
          archivedAt: now,
          archivedBy: requestedBy,
          request: {
            ...(job.request || {}),
            archiveReason: reason,
            archivedBy: requestedBy,
          },
          metrics: {
            ...(job.metrics || {}),
            lifecycle: {
              ...(job.metrics?.lifecycle || {}),
              archivedAt: now.toISOString(),
              archivedBy: requestedBy,
              archiveReason: reason,
            },
          },
        },
      });

  if (!alreadyArchived) {
    await appendJobLifecycleAudit({
      universeId: args.universeId,
      jobId: args.jobId,
      action: "archive",
      reason,
      requestedBy,
      previousStatus,
      nextStatus: previousStatus,
    });
  }

  return {
    ok: true as const,
    jobId: args.jobId,
    status: previousStatus,
    archived: true,
    alreadyArchived,
    job: updatedJob,
  };
}

export async function updateMarketingJobCategory(args: {
  universeId: string;
  jobId: string;
  queueCategory: string;
  requestedBy?: string;
  reason?: string;
}) {
  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) {
    return { ok: false as const, status: 404, error: "job_not_found" };
  }

  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  if (job.archivedAt) {
    return { ok: false as const, status: 400, error: "job_archived" };
  }

  const requestedBy = toOperatorId(args.requestedBy);
  const reason = toSafeString(args.reason) || "operator_update_category";
  const previousCategory = normalizeMarketingQueueCategory(job.queueCategory);
  const queueCategory = normalizeMarketingQueueCategory(args.queueCategory);
  const updatedJob = await updateMarketingJob({
    jobId: args.jobId,
    set: {
      queueCategory,
      sourceRef: {
        ...(job.sourceRef || {}),
        queueCategory,
      },
      request: {
        ...(job.request || {}),
        queueCategory,
        categoryUpdatedBy: requestedBy,
        categoryUpdateReason: reason,
      },
      metrics: {
        ...(job.metrics || {}),
        category: {
          previousCategory,
          queueCategory,
          updatedAt: new Date().toISOString(),
          updatedBy: requestedBy,
          reason,
        },
      },
    },
  });

  await appendJobLifecycleAudit({
    universeId: args.universeId,
    jobId: args.jobId,
    action: "update_category",
    reason,
    requestedBy,
    previousStatus: toSafeString(job.status),
    nextStatus: toSafeString(job.status),
  });

  return {
    ok: true as const,
    jobId: args.jobId,
    queueCategory,
    previousCategory,
    job: updatedJob,
  };
}

export async function requestMarketingJobGeneration(args: {
  universeId: string;
  jobId: string;
  channels?: MarketingChannel[];
  queueCategory?: string;
  priority?: MarketingJobPriority;
  generationConfig?: UnknownRecord;
  requestedBy?: string;
  reason?: string;
}) {
  const job = await getMarketingJobByJobId(args.jobId);
  if (!job) {
    return { ok: false as const, status: 404, error: "job_not_found" };
  }

  if (toSafeString(job.universeId) !== toSafeString(args.universeId)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  if (job.archivedAt) {
    return { ok: false as const, status: 400, error: "job_archived" };
  }

  if (toSafeString(job.status) === "canceled") {
    return { ok: false as const, status: 400, error: "job_canceled" };
  }

  const requestedBy = toOperatorId(args.requestedBy);
  const reason = toSafeString(args.reason) || "operator_request_generation";
  const queueCategory = normalizeMarketingQueueCategory(args.queueCategory || job.queueCategory);
  const channels = toChannelList(args.channels?.length ? args.channels : job.channels);
  const generationConfig = normalizeMarketingGenerationConfig({
    ...(job.request?.generationConfig || {}),
    ...(args.generationConfig || {}),
  });
  const priority = normalizeMarketingQueuePriority(args.priority, job.priority || "normal");
  const resetStepCount = await resetGenerationSteps({
    jobId: args.jobId,
    channels,
    requestedBy,
    reason,
  });
  const now = new Date();

  const updatedJob = await updateMarketingJob({
    jobId: args.jobId,
    set: {
      status: "queued",
      priority,
      queueCategory,
      channels,
      currentStepKey: "generate_channel_copy",
      startedAt: null,
      completedAt: null,
      lastError: null,
      sourceRef: {
        ...(job.sourceRef || {}),
        queueCategory,
      },
      request: {
        ...(job.request || {}),
        queueCategory,
        generationConfig,
        generationRequestedAt: now.toISOString(),
        generationRequestedBy: requestedBy,
        generationRequestReason: reason,
      },
      featureFlags: {
        ...(job.featureFlags || {}),
        reviewRequired: generationConfig.reviewRequired,
        autoPublishAfterReview: generationConfig.autoPublishAfterReview,
      },
      metrics: {
        ...(job.metrics || {}),
        generationRequest: {
          requestedAt: now.toISOString(),
          requestedBy,
          reason,
          channels,
          resetStepCount,
        },
      },
    },
  });

  await pushJobToRedisQueue({
    universeId: args.universeId,
    jobId: args.jobId,
    sourceRef: updatedJob?.sourceRef || job.sourceRef || {},
    scheduledAt: updatedJob?.scheduledAt || job.scheduledAt || null,
    generationConfig,
  });

  await appendJobLifecycleAudit({
    universeId: args.universeId,
    jobId: args.jobId,
    action: "request_generation",
    reason,
    requestedBy,
    previousStatus: toSafeString(job.status),
    nextStatus: "queued",
  });

  return {
    ok: true as const,
    jobId: args.jobId,
    status: "queued" as const,
    queueCategory,
    channels,
    resetStepCount,
    job: updatedJob,
  };
}
