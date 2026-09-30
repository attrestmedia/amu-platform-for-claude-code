import "server-only";

import {
  MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS,
  MARKETING_DRY_RUN,
  MARKETING_FEATURE_ENABLED,
  MARKETING_MEASUREMENT_LOOKBACK_DAYS,
  MARKETING_SLACK_ENABLED,
} from "consts/marketing/server";
import {
  MARKETING_ADS_UNLOCK_REQUIRED_PROVIDERS,
  MARKETING_CANONICAL_POLICY,
  MARKETING_MEASUREMENT_REVIEW_CHECKLIST,
} from "consts/marketing/tracking";
import { checkRedisHealth, getConnectionStatus as getRedisConnectionStatus, getRedisClient } from "libs/cache/redisClient";
import { getConnectionStatus as getMongoConnectionStatus } from "libs/database/mongoose";
import {
  createMarketingAsset,
  getMarketingJobByJobId,
  listMarketingJobs,
  listMarketingPublishLogs,
  getMarketingAdsPolicy,
  updateMarketingJob,
} from "libs/database/marketing";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { getMarketingJobLease } from "./lease";
import {
  getMarketingJobLeaseKey,
  getMarketingUniverseDeadLetterKey,
  getMarketingUniverseProcessingKey,
  getMarketingUniverseQueueKey,
  getMarketingWorkerHeartbeatKey,
  getMarketingWorkerHeartbeatPattern,
} from "./keys";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function isTerminalJobStatus(status: string) {
  return ["success", "failed", "canceled", "rejected"].includes(toSafeString(status));
}

function toIso(value?: string | Date | null) {
  if (!value) return null;

  const next = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(next.getTime())) return null;

  return next.toISOString();
}

function toLookbackDate(days: number) {
  const base = new Date();
  base.setDate(base.getDate() - Math.max(1, days));
  return base.toISOString();
}

async function appendRecoveryAudit(args: {
  universeId: string;
  jobId: string;
  requestedBy: string;
  action: string;
  reason: string;
  previousStatus?: string;
  nextStatus?: string;
  dryRun?: boolean;
}) {
  return await createMarketingAsset({
    jobId: args.jobId,
    universeId: args.universeId,
    kind: "audit_log",
    title: `marketing recovery audit ${args.action}`,
    mimeType: "application/json",
    content: {
      event: "queue_recovery",
      action: args.action,
      reason: args.reason,
      previousStatus: toSafeString(args.previousStatus),
      nextStatus: toSafeString(args.nextStatus),
      requestedBy: toSafeString(args.requestedBy),
      dryRun: Boolean(args.dryRun),
      createdAt: new Date().toISOString(),
    },
    meta: {
      scope: "queue_recovery",
    },
  });
}

async function scanKeys(pattern: string, count = 100) {
  const client = await getRedisClient();
  let cursor = "0";
  const keys = new Set<string>();

  do {
    const [nextCursor, foundKeys] = await client.scan(cursor, "MATCH", pattern, "COUNT", count);
    cursor = nextCursor;
    for (const key of foundKeys || []) {
      keys.add(key);
    }
  } while (cursor !== "0");

  return Array.from(keys);
}

export async function markMarketingWorkerHeartbeat(args: { universeId: string; workerId: string; ttlSec?: number }) {
  const workerId = toSafeString(args.workerId);
  if (!workerId) return null;

  const client = await getRedisClient();
  const ttlSec = Math.max(30, Math.min(3600, Number(args.ttlSec || 180)));
  const key = getMarketingWorkerHeartbeatKey(workerId);
  const payload = {
    workerId,
    universeId: toSafeString(args.universeId),
    lastSeenAt: new Date().toISOString(),
  };

  await client.set(key, JSON.stringify(payload), "EX", ttlSec);
  return payload;
}

export async function listMarketingWorkerHeartbeats(args?: { universeId?: string }) {
  const client = await getRedisClient();
  const keys = await scanKeys(getMarketingWorkerHeartbeatPattern(), 50);

  const heartbeats = await Promise.all(
    keys.map(async (key) => {
      const [raw, ttlMs] = await Promise.all([client.get(key), client.pttl(key)]);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        key,
        workerId: toSafeString(parsed?.workerId),
        universeId: toSafeString(parsed?.universeId),
        lastSeenAt: toSafeString(parsed?.lastSeenAt),
        ttlMs,
      };
    }),
  );

  return heartbeats.filter((item) => {
    if (!item.workerId) return false;
    if (!args?.universeId) return true;
    return item.universeId === toSafeString(args.universeId);
  });
}

export async function getMarketingSystemStatus(args: { universeId: string }) {
  const queueKey = getMarketingUniverseQueueKey(args.universeId);
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const deadLetterKey = getMarketingUniverseDeadLetterKey(args.universeId);

  let redisSummary: Record<string, unknown> = {
    isHealthy: false,
    error: "",
    connection: getRedisConnectionStatus(),
  };
  let queueDepth = 0;
  let processingDepth = 0;
  let deadLetterDepth = 0;
  let queuedPreview: string[] = [];
  let deadLetterPreview: string[] = [];
  let processingJobIds: string[] = [];
  let workers: Array<Record<string, unknown>> = [];

  try {
    const client = await getRedisClient();

    const [redisHealth, queueLen, processingLen, deadLetterLen, queueItems, processingItems, deadLetterItems, heartbeatItems] =
      await Promise.all([
        checkRedisHealth(),
        client.llen(queueKey),
        client.llen(processingKey),
        client.llen(deadLetterKey),
        client.lrange(queueKey, 0, 19),
        client.lrange(processingKey, 0, 49),
        client.lrange(deadLetterKey, 0, 19),
        listMarketingWorkerHeartbeats({ universeId: args.universeId }),
      ]);

    redisSummary = {
      ...redisHealth,
      connection: getRedisConnectionStatus(),
    };
    queueDepth = Number(queueLen || 0);
    processingDepth = Number(processingLen || 0);
    deadLetterDepth = Number(deadLetterLen || 0);
    queuedPreview = (queueItems || []).map((item) => toSafeString(item)).filter(Boolean);
    deadLetterPreview = (deadLetterItems || []).map((item) => toSafeString(item)).filter(Boolean);
    processingJobIds = Array.from(new Set((processingItems || []).map((item) => toSafeString(item)).filter(Boolean)));
    workers = heartbeatItems;
  } catch (error: unknown) {
    redisSummary = {
      isHealthy: false,
      error: toSafeString(error instanceof Error ? error.message : "") || "redis_status_failed",
      connection: getRedisConnectionStatus(),
    };
  }

  const processing = await Promise.all(
    processingJobIds.map(async (jobId) => {
      const [job, lease] = await Promise.all([getMarketingJobByJobId(jobId), getMarketingJobLease({ jobId })]);
      const jobStatus = toSafeString(job?.status);
      const orphanCandidate = !lease.workerId || Number(lease.ttlMs || 0) <= 0;

      return {
        jobId,
        status: jobStatus || "missing",
        currentStepKey: toSafeString(job?.currentStepKey),
        sourceSlug: toSafeString(job?.sourceRef?.slug),
        leaseWorkerId: toSafeString(lease.workerId),
        leaseTtlMs: Number(lease.ttlMs || 0),
        orphanCandidate,
        terminalInProcessing: isTerminalJobStatus(jobStatus),
        updatedAt: toIso(job?.updatedAt),
      };
    }),
  );

  const [recentFailedJobs, recentActiveJobs, recentPublishedLogs, recentFailedPublishLogs, recentActivityJobs, credentialStatus, adsPolicy] =
    await Promise.all([
      listMarketingJobs({ universeId: args.universeId, status: ["failed", "partial"], limit: 5 }),
      listMarketingJobs({ universeId: args.universeId, status: ["queued", "running", "waiting_review", "approved"], limit: 10 }),
      listMarketingPublishLogs({
        universeId: args.universeId,
        status: ["published"],
        dateFrom: toLookbackDate(MARKETING_MEASUREMENT_LOOKBACK_DAYS),
        limit: 200,
      }),
      listMarketingPublishLogs({
        universeId: args.universeId,
        status: ["failed"],
        dateFrom: toLookbackDate(MARKETING_MEASUREMENT_LOOKBACK_DAYS),
        limit: 200,
      }),
      listMarketingJobs({
        universeId: args.universeId,
        status: ["waiting_review", "approved", "partial", "success", "failed"],
        dateFrom: toLookbackDate(MARKETING_MEASUREMENT_LOOKBACK_DAYS),
        limit: 100,
      }),
      getCredentialStatus(args.universeId),
      getMarketingAdsPolicy(args.universeId),
    ]);

  const publishedChannels = Array.from(
    new Set(recentPublishedLogs.map((log) => toSafeString(log.channel)).filter(Boolean)),
  );
  const recentLocalAgentJobs = recentActivityJobs.items.filter((job) => {
    const metrics = toRecord(job.metrics);
    return toSafeString(toRecord(metrics.localAgent).status) === "submitted";
  });
  const adsCredentialReadiness = MARKETING_ADS_UNLOCK_REQUIRED_PROVIDERS.map((provider) => ({
    provider,
    exists: Boolean(credentialStatus?.[provider]?.exists),
    updatedAt: credentialStatus?.[provider]?.updatedAt || null,
  }));
  const goNoGoReasons: string[] = [];

  if (recentPublishedLogs.length < MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS) {
    goNoGoReasons.push(
      `최근 ${MARKETING_MEASUREMENT_LOOKBACK_DAYS}일 published log가 ${MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS}건 미만입니다.`,
    );
  }
  if (publishedChannels.length < 2) {
    goNoGoReasons.push("최근 publish channel 다양성이 부족합니다. 최소 2개 채널 운영 로그가 필요합니다.");
  }
  if (adsCredentialReadiness.every((item) => !item.exists)) {
    goNoGoReasons.push("naver_ads 또는 google_ads credential slot이 아직 준비되지 않았습니다.");
  }
  const readyAdsProviders = MARKETING_ADS_UNLOCK_REQUIRED_PROVIDERS.filter(
    (provider) => credentialStatus?.[provider]?.exists && credentialStatus?.[provider]?.ready,
  );
  if (adsCredentialReadiness.some((item) => item.exists) && readyAdsProviders.length === 0) {
    goNoGoReasons.push("ads credential 필수 필드가 미완성입니다.");
  }
  if (!credentialStatus?.google_analytics?.extras?.enabled) {
    goNoGoReasons.push("GA4 수집이 비활성 상태입니다.");
  }
  if (!adsPolicy?.spendCap?.dailyAmount || !adsPolicy?.spendCap?.monthlyAmount) {
    goNoGoReasons.push("광고 일일/월간 지출 상한이 설정되지 않았습니다.");
  }
  if (!adsPolicy?.executionEnabled) {
    goNoGoReasons.push("관리자 광고 패널에서 집행 경로가 비활성 상태입니다.");
  }

  return {
    scope: "universe",
    universeId: args.universeId,
    featureFlags: {
      enabled: MARKETING_FEATURE_ENABLED,
      dryRun: MARKETING_DRY_RUN,
      slack: MARKETING_SLACK_ENABLED,
    },
    redis: {
      isHealthy: Boolean(redisSummary.isHealthy),
      error: toSafeString(redisSummary.error),
      connection: redisSummary.connection,
      queueDepth,
      processingDepth,
      deadLetterDepth,
      queueKey,
      processingKey,
      deadLetterKey,
      queuedPreview,
      deadLetterPreview,
    },
    mongo: {
      connections: getMongoConnectionStatus(),
    },
    workers,
    processing,
    orphanCandidates: processing.filter((item) => item.orphanCandidate),
    recentFailedJobs: recentFailedJobs.items,
    recentActiveJobs: recentActiveJobs.items,
    activity: {
      lookbackDays: MARKETING_MEASUREMENT_LOOKBACK_DAYS,
      publishedLogCount: recentPublishedLogs.length,
      failedPublishLogCount: recentFailedPublishLogs.length,
      localAgentSubmittedJobCount: recentLocalAgentJobs.length,
      waitingReviewJobCount: recentActivityJobs.items.filter((job) => toSafeString(job.status) === "waiting_review").length,
    },
    measurement: {
      lookbackDays: MARKETING_MEASUREMENT_LOOKBACK_DAYS,
      minPublishedLogs: MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS,
      recentPublishedLogCount: recentPublishedLogs.length,
      recentPublishedChannels: publishedChannels,
      canonicalPolicy: MARKETING_CANONICAL_POLICY,
      checklist: MARKETING_MEASUREMENT_REVIEW_CHECKLIST,
      adsCredentialReadiness,
      adsPolicy: adsPolicy || null,
      goNoGo: {
        ready: goNoGoReasons.length === 0,
        reasons: goNoGoReasons,
      },
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getMarketingGlobalSystemStatus(args: { universeIds: string[] }) {
  const universeIds = Array.from(new Set((args.universeIds || []).map((value) => toSafeString(value)).filter(Boolean)));
  if (universeIds.length === 0) {
    return {
      scope: "global",
      universeIds: [],
      featureFlags: {
        enabled: MARKETING_FEATURE_ENABLED,
        dryRun: MARKETING_DRY_RUN,
        slack: MARKETING_SLACK_ENABLED,
      },
      redis: {
        isHealthy: true,
        error: "",
        connection: getRedisConnectionStatus(),
        queueDepth: 0,
        processingDepth: 0,
        deadLetterDepth: 0,
        queuedPreview: [],
        deadLetterPreview: [],
      },
      mongo: {
        connections: getMongoConnectionStatus(),
      },
      workers: [],
      orphanCandidates: [],
      recentFailedJobs: [],
      recentActiveJobs: [],
      activity: {
        lookbackDays: MARKETING_MEASUREMENT_LOOKBACK_DAYS,
        publishedLogCount: 0,
        failedPublishLogCount: 0,
        localAgentSubmittedJobCount: 0,
        waitingReviewJobCount: 0,
      },
      measurement: {
        lookbackDays: MARKETING_MEASUREMENT_LOOKBACK_DAYS,
        minPublishedLogs: MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS,
        recentPublishedLogCount: 0,
        recentPublishedChannels: [],
        canonicalPolicy: MARKETING_CANONICAL_POLICY,
        checklist: MARKETING_MEASUREMENT_REVIEW_CHECKLIST,
        adsCredentialReadiness: MARKETING_ADS_UNLOCK_REQUIRED_PROVIDERS.map((provider) => ({
          provider,
          exists: false,
          updatedAt: null,
        })),
        goNoGo: {
          ready: false,
          reasons: ["운영 가능한 유니버스가 없습니다."],
        },
      },
      universeSummaries: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const summaries = await Promise.all(universeIds.map((universeId) => getMarketingSystemStatus({ universeId })));
  const workers = Array.from(
    new Map(
      summaries
        .flatMap((summary) => summary.workers || [])
        .filter((item) => toSafeString(item?.workerId))
        .map((item) => [toSafeString(item.workerId), item]),
    ).values(),
  );
  const recentFailedJobs = summaries
    .flatMap((summary) => summary.recentFailedJobs || [])
    .sort((a, b) => new Date(toSafeString(b?.createdAt)).getTime() - new Date(toSafeString(a?.createdAt)).getTime())
    .slice(0, 5);
  const recentActiveJobs = summaries
    .flatMap((summary) => summary.recentActiveJobs || [])
    .sort((a, b) => new Date(toSafeString(b?.createdAt)).getTime() - new Date(toSafeString(a?.createdAt)).getTime())
    .slice(0, 10);
  const measurementReasons = Array.from(
    new Set(
      summaries.flatMap((summary) => summary.measurement?.goNoGo?.reasons || []).map((item) => toSafeString(item)).filter(Boolean),
    ),
  );
  const adsCredentialReadiness = MARKETING_ADS_UNLOCK_REQUIRED_PROVIDERS.map((provider) => {
    const items = summaries
      .map((summary) => summary.measurement?.adsCredentialReadiness?.find((item) => item.provider === provider))
      .filter(Boolean) as Array<{ provider?: string; exists?: boolean; updatedAt?: string | null }>;

    return {
      provider,
      exists: items.some((item) => Boolean(item.exists)),
      updatedAt: items
        .map((item) => toSafeString(item.updatedAt))
        .filter(Boolean)
        .sort()
        .reverse()[0] || null,
    };
  });

  return {
    scope: "global",
    universeIds,
    featureFlags: {
      enabled: MARKETING_FEATURE_ENABLED,
      dryRun: MARKETING_DRY_RUN,
      slack: MARKETING_SLACK_ENABLED,
    },
    redis: {
      isHealthy: summaries.every((summary) => Boolean(summary.redis?.isHealthy)),
      error: summaries
        .map((summary) => toSafeString(summary.redis?.error))
        .filter(Boolean)
        .join(" | "),
      connection: getRedisConnectionStatus(),
      queueDepth: summaries.reduce((sum, summary) => sum + Number(summary.redis?.queueDepth || 0), 0),
      processingDepth: summaries.reduce((sum, summary) => sum + Number(summary.redis?.processingDepth || 0), 0),
      deadLetterDepth: summaries.reduce((sum, summary) => sum + Number(summary.redis?.deadLetterDepth || 0), 0),
      queuedPreview: summaries.flatMap((summary) => summary.redis?.queuedPreview || []).slice(0, 20),
      deadLetterPreview: summaries.flatMap((summary) => summary.redis?.deadLetterPreview || []).slice(0, 20),
    },
    mongo: {
      connections: getMongoConnectionStatus(),
    },
    workers,
    orphanCandidates: summaries
      .flatMap((summary) =>
        (summary.orphanCandidates || []).map((item) => ({
          ...item,
          universeId: summary.universeId,
        })),
      )
      .slice(0, 20),
    recentFailedJobs,
    recentActiveJobs,
    activity: {
      lookbackDays: MARKETING_MEASUREMENT_LOOKBACK_DAYS,
      publishedLogCount: summaries.reduce((sum, summary) => sum + Number(summary.activity?.publishedLogCount || 0), 0),
      failedPublishLogCount: summaries.reduce((sum, summary) => sum + Number(summary.activity?.failedPublishLogCount || 0), 0),
      localAgentSubmittedJobCount: summaries.reduce(
        (sum, summary) => sum + Number(summary.activity?.localAgentSubmittedJobCount || 0),
        0,
      ),
      waitingReviewJobCount: summaries.reduce((sum, summary) => sum + Number(summary.activity?.waitingReviewJobCount || 0), 0),
    },
    measurement: {
      lookbackDays: MARKETING_MEASUREMENT_LOOKBACK_DAYS,
      minPublishedLogs: MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS,
      recentPublishedLogCount: summaries.reduce((sum, summary) => sum + Number(summary.measurement?.recentPublishedLogCount || 0), 0),
      recentPublishedChannels: Array.from(
        new Set(summaries.flatMap((summary) => summary.measurement?.recentPublishedChannels || []).map((item) => toSafeString(item)).filter(Boolean)),
      ),
      canonicalPolicy: MARKETING_CANONICAL_POLICY,
      checklist: MARKETING_MEASUREMENT_REVIEW_CHECKLIST,
      adsCredentialReadiness,
      goNoGo: {
        ready: summaries.some((summary) => Boolean(summary.measurement?.goNoGo?.ready)),
        reasons: summaries.some((summary) => Boolean(summary.measurement?.goNoGo?.ready))
          ? [
              `${summaries.filter((summary) => Boolean(summary.measurement?.goNoGo?.ready)).length}개 유니버스가 ads unlock ready 상태입니다.`,
            ]
          : measurementReasons,
      },
    },
    universeSummaries: summaries.map((summary) => ({
      universeId: summary.universeId,
      queueDepth: Number(summary.redis?.queueDepth || 0),
      processingDepth: Number(summary.redis?.processingDepth || 0),
      orphanCount: Number(summary.orphanCandidates?.length || 0),
      goNoGoReady: Boolean(summary.measurement?.goNoGo?.ready),
      publishedLogCount: Number(summary.activity?.publishedLogCount || 0),
      localAgentSubmittedJobCount: Number(summary.activity?.localAgentSubmittedJobCount || 0),
      waitingReviewJobCount: Number(summary.activity?.waitingReviewJobCount || 0),
      recentPublishedChannelCount: Number(summary.measurement?.recentPublishedChannels?.length || 0),
      goNoGoReasons: Array.isArray(summary.measurement?.goNoGo?.reasons)
        ? summary.measurement.goNoGo.reasons.filter(Boolean)
        : [],
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function recoverMarketingQueue(args: {
  universeId: string;
  requestedBy: string;
  reason?: string;
  dryRun?: boolean;
  limit?: number;
}) {
  const client = await getRedisClient();
  const queueKey = getMarketingUniverseQueueKey(args.universeId);
  const processingKey = getMarketingUniverseProcessingKey(args.universeId);
  const deadLetterKey = getMarketingUniverseDeadLetterKey(args.universeId);
  const reason = toSafeString(args.reason) || "operator_recovery";
  const limit = Math.max(1, Math.min(200, Number(args.limit || 100)));

  const [processingItems, queuedItems] = await Promise.all([
    client.lrange(processingKey, 0, limit - 1),
    client.lrange(queueKey, 0, limit - 1),
  ]);

  const processingJobIds = Array.from(new Set((processingItems || []).map((item) => toSafeString(item)).filter(Boolean)));
  const queuedSet = new Set((queuedItems || []).map((item) => toSafeString(item)).filter(Boolean));
  const actions: Array<Record<string, unknown>> = [];

  for (const jobId of processingJobIds) {
    const [job, lease] = await Promise.all([getMarketingJobByJobId(jobId), getMarketingJobLease({ jobId })]);
    const leaseActive = !!lease.workerId && Number(lease.ttlMs || 0) > 0;
    if (leaseActive) {
      actions.push({
        jobId,
        action: "skip_active_lease",
        status: toSafeString(job?.status),
        leaseWorkerId: lease.workerId,
        leaseTtlMs: lease.ttlMs,
      });
      continue;
    }

    if (!job) {
      actions.push({
        jobId,
        action: "dead_letter_missing_job",
      });

      if (!args.dryRun) {
        await client.lrem(processingKey, 1, jobId);
        await client.lpush(deadLetterKey, jobId);
        await client.del(getMarketingJobLeaseKey(jobId));
      }
      continue;
    }

    const previousStatus = toSafeString(job.status);
    if (isTerminalJobStatus(previousStatus)) {
      actions.push({
        jobId,
        action: "cleanup_terminal_processing",
        previousStatus,
      });

      if (!args.dryRun) {
        await client.lrem(processingKey, 1, jobId);
        await client.del(getMarketingJobLeaseKey(jobId));
        await appendRecoveryAudit({
          universeId: args.universeId,
          jobId,
          requestedBy: args.requestedBy,
          action: "cleanup_terminal_processing",
          reason,
          previousStatus,
          nextStatus: previousStatus,
          dryRun: false,
        });
      }
      continue;
    }

    actions.push({
      jobId,
      action: "requeue_orphan",
      previousStatus,
      nextStatus: "queued",
    });

    if (!args.dryRun) {
      await client.lrem(processingKey, 1, jobId);
      if (!queuedSet.has(jobId)) {
        await client.rpush(queueKey, jobId);
        queuedSet.add(jobId);
      }
      await client.del(getMarketingJobLeaseKey(jobId));

      await updateMarketingJob({
        jobId,
        set: {
          status: "queued",
          completedAt: null,
          lastError: {
            code: "RECOVERED_ORPHAN_PROCESSING",
            message: `processing queue orphan job recovered by ${toSafeString(args.requestedBy) || "system"}`,
          },
          metrics: {
            ...(job.metrics || {}),
            recovery: {
              recoveredAt: new Date().toISOString(),
              recoveredBy: toSafeString(args.requestedBy),
              reason,
              previousStatus,
            },
          },
        },
      });

      await appendRecoveryAudit({
        universeId: args.universeId,
        jobId,
        requestedBy: args.requestedBy,
        action: "requeue_orphan",
        reason,
        previousStatus,
        nextStatus: "queued",
        dryRun: false,
      });
    }
  }

  return {
    universeId: args.universeId,
    dryRun: Boolean(args.dryRun),
    action: "requeue_orphans",
    scanned: processingJobIds.length,
    recoveredCount: actions.filter((item) => item.action === "requeue_orphan").length,
    cleanedCount: actions.filter((item) => item.action === "cleanup_terminal_processing").length,
    deadLetterCount: actions.filter((item) => item.action === "dead_letter_missing_job").length,
    skippedCount: actions.filter((item) => item.action === "skip_active_lease").length,
    actions,
    generatedAt: new Date().toISOString(),
  };
}

export async function recoverMarketingQueueAcrossUniverses(args: {
  universeIds: string[];
  requestedBy: string;
  reason?: string;
  dryRun?: boolean;
  limit?: number;
}) {
  const universeIds = Array.from(new Set((args.universeIds || []).map((value) => toSafeString(value)).filter(Boolean)));
  const results = await Promise.all(
    universeIds.map((universeId) =>
      recoverMarketingQueue({
        universeId,
        requestedBy: args.requestedBy,
        reason: args.reason,
        dryRun: args.dryRun,
        limit: args.limit,
      }),
    ),
  );

  return {
    scope: "global",
    universeIds,
    dryRun: Boolean(args.dryRun),
    action: "requeue_orphans",
    scanned: results.reduce((sum, item) => sum + Number(item.scanned || 0), 0),
    recoveredCount: results.reduce((sum, item) => sum + Number(item.recoveredCount || 0), 0),
    cleanedCount: results.reduce((sum, item) => sum + Number(item.cleanedCount || 0), 0),
    deadLetterCount: results.reduce((sum, item) => sum + Number(item.deadLetterCount || 0), 0),
    skippedCount: results.reduce((sum, item) => sum + Number(item.skippedCount || 0), 0),
    actions: results.flatMap((item) =>
      (item.actions || []).map((action) => ({
        universeId: item.universeId,
        ...action,
      })),
    ),
    results,
    generatedAt: new Date().toISOString(),
  };
}
