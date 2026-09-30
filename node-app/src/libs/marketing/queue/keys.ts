const MARKETING_QUEUE_PREFIX = "amu:marketing";

function toSafeKeySegment(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "_");
}

export function getMarketingUniverseQueueKey(universeId: string) {
  return `${MARKETING_QUEUE_PREFIX}:queue:${toSafeKeySegment(universeId)}`;
}

export function getMarketingUniverseProcessingKey(universeId: string) {
  return `${MARKETING_QUEUE_PREFIX}:processing:${toSafeKeySegment(universeId)}`;
}

export function getMarketingUniverseDeadLetterKey(universeId: string) {
  return `${MARKETING_QUEUE_PREFIX}:dead-letter:${toSafeKeySegment(universeId)}`;
}

export function getMarketingJobPayloadKey(jobId: string) {
  return `${MARKETING_QUEUE_PREFIX}:job:${toSafeKeySegment(jobId)}`;
}

export function getMarketingJobLeaseKey(jobId: string) {
  return `${MARKETING_QUEUE_PREFIX}:lease:${toSafeKeySegment(jobId)}`;
}

export function getMarketingWorkerHeartbeatKey(workerId: string) {
  return `${MARKETING_QUEUE_PREFIX}:worker:${toSafeKeySegment(workerId)}:heartbeat`;
}

export function getMarketingWorkerHeartbeatPattern() {
  return `${MARKETING_QUEUE_PREFIX}:worker:*:heartbeat`;
}
