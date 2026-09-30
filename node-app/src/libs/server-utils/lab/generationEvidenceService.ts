import "server-only";
import type { UnknownRecord } from "utils/common/typeUtils";
import { sanitizeAgentImageRoutingMeta } from "utils/ai/agentImageRoutingPolicy";

const IMAGE_OPERATION_PREFIX = "image:";
const CONTENT_OPERATION_PREFIX = "content:";
const OPERATION_SUFFIX = ":generate";

export type GenerationEvidenceWarning = {
  code: string;
  assetId?: string;
  jobId?: string;
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function toSafeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getJobIdFromOperationId(operationId: unknown, prefix: string = IMAGE_OPERATION_PREFIX) {
  const value = toSafeString(operationId);
  if (!value.startsWith(prefix) || !value.endsWith(OPERATION_SUFFIX)) return "";
  return value.slice(prefix.length, -OPERATION_SUFFIX.length);
}

function isAppliedDeduction(row: { entryType?: unknown; state?: unknown }) {
  return row.entryType === "deduction" && row.state === "applied";
}

export function buildImageGenerationEvidenceAsset(asset: UnknownRecord, warnings: GenerationEvidenceWarning[]) {
  const storage = toRecord(asset.storage);
  const assetId = toSafeString(asset.assetId);
  const jobId = toSafeString(asset.jobId);
  const sha256 = toSafeString(storage.sha256);
  const width = toSafeNumber(storage.width);
  const height = toSafeNumber(storage.height);
  const bytes = toSafeNumber(storage.bytes);

  if (!jobId) warnings.push({ code: "ASSET_JOB_ID_MISSING", assetId });
  if (!sha256) warnings.push({ code: "ASSET_SHA256_MISSING", assetId, jobId });
  if (width <= 0 || height <= 0) warnings.push({ code: "ASSET_DIMENSIONS_MISSING", assetId, jobId });
  if (bytes <= 0) warnings.push({ code: "ASSET_BYTES_MISSING", assetId, jobId });

  const routingMeta = sanitizeAgentImageRoutingMeta(asset.routingMeta);
  return {
    assetId,
    jobId,
    provider: toSafeString(asset.provider),
    modelName: toSafeString(asset.modelName),
    createdAt: asset.createdAt || null,
    state: toSafeString(asset.state),
    ...(routingMeta ? { routingMeta } : {}),
    storage: {
      mimeType: toSafeString(storage.mimeType),
      width,
      height,
      bytes,
      sha256,
    },
  };
}

/**
 * 원장 상관 검증은 이미지·콘텐츠가 동일하다. 다른 것은 operationId prefix 하나뿐이므로
 * (`image:{jobId}:generate` / `content:{jobId}:generate`) 그 부분만 인자로 받는다.
 * warnings 배열은 호출자의 것을 그대로 채워 경고 순서(자산 → 잡 → 원장)를 유지한다.
 */
async function collectLedgerEvidence(args: {
  uid: string;
  jobIds: string[];
  operationPrefix: string;
  warnings: GenerationEvidenceWarning[];
}) {
  const { fetchCoinUsageEvidenceByOperationIds } = await import(
    "libs/server-utils/payment/coinUsageLedgerQuery"
  );
  const operationIds = args.jobIds.map((jobId) => `${args.operationPrefix}${jobId}${OPERATION_SUFFIX}`);
  const rawLedger = await fetchCoinUsageEvidenceByOperationIds({
    uid: args.uid,
    operationIds,
  });
  const ledger = rawLedger.map((row) => ({
    ledgerId: toSafeString(row._id),
    operationId: toSafeString(row.operationId),
    jobId: getJobIdFromOperationId(row.operationId, args.operationPrefix),
    billingKey: toSafeString(row.billingKey),
    coins: toSafeNumber(row.coins),
    entryType: toSafeString(row.entryType),
    state: toSafeString(row.state),
    createdAt: row.createdAt || null,
  }));
  const ledgerByJobId = new Map<string, typeof ledger>();
  ledger.forEach((row) => {
    const rows = ledgerByJobId.get(row.jobId) || [];
    rows.push(row);
    ledgerByJobId.set(row.jobId, rows);
  });

  args.jobIds.forEach((jobId) => {
    const rows = ledgerByJobId.get(jobId) || [];
    if (rows.length === 0) args.warnings.push({ code: "LEDGER_NOT_FOUND", jobId });
    const appliedDeductions = rows.filter((row) => isAppliedDeduction(row));
    if (appliedDeductions.length === 0 && rows.length > 0) {
      args.warnings.push({ code: "APPLIED_CHARGE_NOT_FOUND", jobId });
    }
    if (appliedDeductions.length > 1) {
      args.warnings.push({ code: "MULTIPLE_APPLIED_CHARGES", jobId });
    }
  });

  const allJobsHaveAppliedCharge =
    args.jobIds.length > 0 &&
    args.jobIds.every((jobId) => (ledgerByJobId.get(jobId) || []).some((row) => isAppliedDeduction(row)));
  const allLedgerEntriesLinkedToJobs =
    ledger.length > 0 && ledger.every((row) => Boolean(row.jobId) && args.jobIds.includes(row.jobId));

  return { ledger, allJobsHaveAppliedCharge, allLedgerEntriesLinkedToJobs };
}

export async function getGenerationEvidenceBundle(args: {
  uid: string;
  assetIds: string[];
}) {
  const requestedAssetIds = Array.from(
    new Set(
      (args.assetIds || [])
        .map((assetId) => toSafeString(assetId))
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const warnings: GenerationEvidenceWarning[] = [];
  const { listImageAssets, listImageGenJobsByJobIds } = await import("libs/database/lab");
  const rawAssets = await listImageAssets({
    scope: "user",
    uid: args.uid,
    assetIds: requestedAssetIds,
    state: "all",
    limit: requestedAssetIds.length,
  });
  const rawAssetById = new Map(
    rawAssets.map((asset) => [toSafeString(asset.assetId), asset]),
  );
  const orderedAssets = requestedAssetIds
    .map((assetId) => rawAssetById.get(assetId))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

  requestedAssetIds.forEach((assetId) => {
    if (!rawAssetById.has(assetId)) warnings.push({ code: "ASSET_NOT_FOUND", assetId });
  });

  const assets = orderedAssets.map((asset) => buildImageGenerationEvidenceAsset(toRecord(asset), warnings));

  const assetJobIds = Array.from(new Set(assets.map((asset) => asset.jobId).filter(Boolean)));
  const rawJobs = await listImageGenJobsByJobIds(assetJobIds);
  const ownedJobs = rawJobs.filter((job) => {
    const record = toRecord(job);
    return toSafeString(record.scope) === "user" && toSafeString(record.uid) === args.uid;
  });
  const rawJobById = new Map(
    ownedJobs.map((job) => [toSafeString(toRecord(job).jobId), toRecord(job)]),
  );

  assetJobIds.forEach((jobId) => {
    if (!rawJobById.has(jobId)) warnings.push({ code: "JOB_NOT_FOUND", jobId });
  });

  const jobs = assetJobIds
    .map((jobId) => rawJobById.get(jobId))
    .filter((job): job is UnknownRecord => Boolean(job))
    .map((job) => {
      const request = toRecord(job.request);
      const billing = toRecord(job.billing);
      const jobId = toSafeString(job.jobId);
      const promptHash = toSafeString(request.promptHash);
      if (!promptHash) warnings.push({ code: "JOB_PROMPT_HASH_MISSING", jobId });

      return {
        jobId,
        provider: toSafeString(job.provider),
        modelName: toSafeString(job.modelName),
        status: toSafeString(job.status),
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
        createdAt: job.createdAt || null,
        request: {
          templateKey: toSafeString(request.templateKey),
          generationMode: toSafeString(request.generationMode),
          promptHash,
          aspectRatio: toSafeString(request.aspectRatio),
          size: toSafeString(request.size),
          n: toSafeNumber(request.n),
        },
        billing: {
          coins: toSafeNumber(billing.coins),
          pricingKey: toSafeString(billing.pricingKey),
          billingStrategy: toSafeString(billing.billingStrategy),
          billedModelName: toSafeString(billing.billedModelName),
        },
      };
    });

  const { ledger, allJobsHaveAppliedCharge, allLedgerEntriesLinkedToJobs } = await collectLedgerEvidence({
    uid: args.uid,
    jobIds: assetJobIds,
    operationPrefix: IMAGE_OPERATION_PREFIX,
    warnings,
  });

  const promptHashes = jobs.map((job) => job.request.promptHash).filter(Boolean);
  const promptHashesEqual =
    jobs.length > 0 &&
    promptHashes.length === jobs.length &&
    new Set(promptHashes).size === 1;
  if (jobs.length > 1 && promptHashes.length === jobs.length && !promptHashesEqual) {
    warnings.push({ code: "PROMPT_HASH_MISMATCH" });
  }

  const foundJobIds = new Set(jobs.map((job) => job.jobId));
  const foundAssetJobIds = assets.map((asset) => asset.jobId);
  const allAssetsFound = assets.length === requestedAssetIds.length;
  const allJobsFound = assetJobIds.length > 0 && assetJobIds.every((jobId) => foundJobIds.has(jobId));
  const allAssetsLinkedToJobs =
    allAssetsFound &&
    foundAssetJobIds.every((jobId) => Boolean(jobId) && foundJobIds.has(jobId));

  return {
    bundleVersion: "1.0",
    assetKind: "image" as const,
    generatedAt: new Date().toISOString(),
    requestedAssetIds,
    assets,
    jobs,
    ledger,
    integrity: {
      allAssetsFound,
      allJobsFound,
      allAssetsLinkedToJobs,
      allJobsHaveAppliedCharge,
      allLedgerEntriesLinkedToJobs,
      promptHashesEqual,
      warnings,
    },
  };
}

/**
 * 콘텐츠 생성 자산의 증거 bundle.
 * 이미지와 상관 구조는 같고(자산 → 잡 → 원장) 저장 메타와 과금 operationId prefix만 다르다.
 * **본문(content.text)은 포함하지 않는다** — 증거는 메타·과금 상관이 목적이고, 본문 조회는
 * `/api/ai/agent/studio-contents`(get_content_asset)의 책임이다.
 */
export async function getContentGenerationEvidenceBundle(args: {
  uid: string;
  assetIds: string[];
}) {
  const requestedAssetIds = Array.from(
    new Set(
      (args.assetIds || [])
        .map((assetId) => toSafeString(assetId))
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const warnings: GenerationEvidenceWarning[] = [];
  const { listContentAssets, listContentGenJobsByJobIds } = await import("libs/database/lab");
  const rawAssets = await listContentAssets({
    scope: "user",
    uid: args.uid,
    assetIds: requestedAssetIds,
    state: "all",
    limit: requestedAssetIds.length,
  });
  const rawAssetById = new Map(
    rawAssets.map((asset) => [toSafeString(asset.assetId), asset]),
  );
  const orderedAssets = requestedAssetIds
    .map((assetId) => rawAssetById.get(assetId))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

  requestedAssetIds.forEach((assetId) => {
    if (!rawAssetById.has(assetId)) warnings.push({ code: "ASSET_NOT_FOUND", assetId });
  });

  const assets = orderedAssets.map((asset) => {
    const content = toRecord(asset.content);
    const assetId = toSafeString(asset.assetId);
    const jobId = toSafeString(asset.jobId);
    const sha256 = toSafeString(content.sha256);
    const chars = toSafeNumber(content.chars);
    const bytes = toSafeNumber(content.bytes);

    if (!jobId) warnings.push({ code: "ASSET_JOB_ID_MISSING", assetId });
    if (!sha256) warnings.push({ code: "ASSET_SHA256_MISSING", assetId, jobId });
    if (chars <= 0) warnings.push({ code: "ASSET_TEXT_EMPTY", assetId, jobId });
    if (bytes <= 0) warnings.push({ code: "ASSET_BYTES_MISSING", assetId, jobId });

    return {
      assetId,
      jobId,
      provider: toSafeString(asset.provider),
      modelName: toSafeString(asset.modelName),
      templateKey: toSafeString(asset.templateKey),
      generationMode: toSafeString(asset.generationMode),
      visibility: toSafeString(asset.visibility),
      outputIndex: toSafeNumber(asset.outputIndex),
      createdAt: asset.createdAt || null,
      state: toSafeString(asset.state),
      content: {
        chars,
        bytes,
        sha256,
      },
    };
  });

  const assetJobIds = Array.from(new Set(assets.map((asset) => asset.jobId).filter(Boolean)));
  const rawJobs = await listContentGenJobsByJobIds(assetJobIds);
  const ownedJobs = rawJobs.filter((job) => {
    const record = toRecord(job);
    return toSafeString(record.scope) === "user" && toSafeString(record.uid) === args.uid;
  });
  const rawJobById = new Map(
    ownedJobs.map((job) => [toSafeString(toRecord(job).jobId), toRecord(job)]),
  );

  assetJobIds.forEach((jobId) => {
    if (!rawJobById.has(jobId)) warnings.push({ code: "JOB_NOT_FOUND", jobId });
  });

  const jobs = assetJobIds
    .map((jobId) => rawJobById.get(jobId))
    .filter((job): job is UnknownRecord => Boolean(job))
    .map((job) => {
      const request = toRecord(job.request);
      const billing = toRecord(job.billing);
      const jobId = toSafeString(job.jobId);
      const promptHash = toSafeString(request.promptHash);
      if (!promptHash) warnings.push({ code: "JOB_PROMPT_HASH_MISSING", jobId });

      return {
        jobId,
        provider: toSafeString(job.provider),
        modelName: toSafeString(job.modelName),
        status: toSafeString(job.status),
        outputCount: toSafeNumber(job.outputCount),
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
        createdAt: job.createdAt || null,
        request: {
          templateKey: toSafeString(request.templateKey),
          generationMode: toSafeString(request.generationMode),
          promptHash,
          promptBytes: toSafeNumber(request.promptBytes),
          n: toSafeNumber(request.n),
        },
        billing: {
          coins: toSafeNumber(billing.coins),
          pricingKey: toSafeString(billing.pricingKey),
        },
      };
    });

  const { ledger, allJobsHaveAppliedCharge, allLedgerEntriesLinkedToJobs } = await collectLedgerEvidence({
    uid: args.uid,
    jobIds: assetJobIds,
    operationPrefix: CONTENT_OPERATION_PREFIX,
    warnings,
  });

  const promptHashes = jobs.map((job) => job.request.promptHash).filter(Boolean);
  const promptHashesEqual =
    jobs.length > 0 &&
    promptHashes.length === jobs.length &&
    new Set(promptHashes).size === 1;
  if (jobs.length > 1 && promptHashes.length === jobs.length && !promptHashesEqual) {
    warnings.push({ code: "PROMPT_HASH_MISMATCH" });
  }

  /**
   * 콘텐츠 잡은 저장 실패·부분 성공을 failed/partial로 남긴다.
   * 과금은 끝났는데 산출물이 온전하지 않은 상태이므로 증거 판정에서 놓치지 않도록 경고로 올린다.
   * (요청은 assetId 부분집합일 수 있어 outputCount와 자산 수 비교는 근거로 쓰지 않는다.)
   */
  jobs.forEach((job) => {
    if (job.status === "failed" || job.status === "partial") {
      warnings.push({ code: "JOB_NOT_SUCCEEDED", jobId: job.jobId });
    }
  });

  const foundJobIds = new Set(jobs.map((job) => job.jobId));
  const foundAssetJobIds = assets.map((asset) => asset.jobId);
  const allAssetsFound = assets.length === requestedAssetIds.length;
  const allJobsFound = assetJobIds.length > 0 && assetJobIds.every((jobId) => foundJobIds.has(jobId));
  const allAssetsLinkedToJobs =
    allAssetsFound &&
    foundAssetJobIds.every((jobId) => Boolean(jobId) && foundJobIds.has(jobId));

  return {
    bundleVersion: "1.0",
    assetKind: "content" as const,
    generatedAt: new Date().toISOString(),
    requestedAssetIds,
    assets,
    jobs,
    ledger,
    integrity: {
      allAssetsFound,
      allJobsFound,
      allAssetsLinkedToJobs,
      allJobsHaveAppliedCharge,
      allLedgerEntriesLinkedToJobs,
      promptHashesEqual,
      warnings,
    },
  };
}

/**
 * EL-503 — audio 자산 증거 bundle. 이미지·콘텐츠와 상관 구조(자산 → 잡 → 원장)는 같고
 * 저장 메타·세그먼트/voice provenance·과금 operationId 체계만 다르다.
 * provider 원본 URL·자격증명·내부 R2 key·서명 비밀·operationalTerms·evidence 경로는 넣지 않는다.
 * 요청 원문(request.text)도 증거에 포함하지 않는다.
 */
export function buildAudioGenerationEvidenceAsset(asset: UnknownRecord, warnings: GenerationEvidenceWarning[]) {
  const storage = toRecord(asset.storage);
  const audio = toRecord(asset.audio);
  const assetId = toSafeString(asset.assetId);
  const jobId = toSafeString(asset.jobId);
  const sha256 = toSafeString(storage.sha256);
  const bytes = toSafeNumber(storage.bytes);
  const durationMs = toSafeNumber(audio.durationMs);

  if (!jobId) warnings.push({ code: "ASSET_JOB_ID_MISSING", assetId });
  if (!sha256) warnings.push({ code: "ASSET_SHA256_MISSING", assetId, jobId });
  if (bytes <= 0) warnings.push({ code: "ASSET_BYTES_MISSING", assetId, jobId });
  if (durationMs <= 0) warnings.push({ code: "ASSET_DURATION_MISSING", assetId, jobId });

  return {
    assetId,
    jobId,
    provider: toSafeString(asset.provider),
    modelName: toSafeString(asset.modelName),
    templateKey: toSafeString(asset.templateKey),
    visibility: toSafeString(asset.visibility),
    sourceRevision: toSafeString(asset.sourceRevision),
    segmentIndex: toSafeNumber(asset.segmentIndex),
    segmentCount: toSafeNumber(asset.segmentCount),
    segmentHash: toSafeString(asset.segmentHash),
    manifestHash: toSafeString(asset.manifestHash),
    createdAt: asset.createdAt || null,
    state: toSafeString(asset.state),
    audio: {
      durationMs,
      codec: toSafeString(audio.codec),
      sampleRateHz: toSafeNumber(audio.sampleRateHz),
      channels: toSafeNumber(audio.channels),
    },
    storage: {
      mimeType: toSafeString(storage.mimeType),
      bytes,
      sha256,
    },
  };
}

function readJobBillingOperationIds(billing: UnknownRecord) {
  const ids = [
    toSafeString(billing.reserveOperationId),
    toSafeString(billing.settlementOperationId),
    ...(Array.isArray(billing.settlementOperationIds) ? billing.settlementOperationIds.map((id) => toSafeString(id)) : []),
  ];
  return Array.from(new Set(ids.filter(Boolean)));
}

export async function getAudioGenerationEvidenceBundle(args: {
  uid: string;
  assetIds: string[];
}) {
  const requestedAssetIds = Array.from(
    new Set(
      (args.assetIds || [])
        .map((assetId) => toSafeString(assetId))
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const warnings: GenerationEvidenceWarning[] = [];
  const { listAudioAssetsForUser, listAudioGenJobsForUser } = await import("libs/database/lab");

  // audio는 소유자 필터가 있는 조회만 쓴다(활성 자산 한정). 타인 자산은 조회되지 않고 warning으로만 남는다.
  const rawAssets = await listAudioAssetsForUser({
    uid: args.uid,
    assetIds: requestedAssetIds,
    limit: requestedAssetIds.length,
  });
  const rawAssetById = new Map(
    rawAssets.map((asset) => [toSafeString(toRecord(asset).assetId), toRecord(asset)]),
  );
  const orderedAssets = requestedAssetIds
    .map((assetId) => rawAssetById.get(assetId))
    .filter((asset): asset is UnknownRecord => Boolean(asset));

  requestedAssetIds.forEach((assetId) => {
    if (!rawAssetById.has(assetId)) warnings.push({ code: "ASSET_NOT_FOUND", assetId });
  });

  const assets = orderedAssets.map((asset) => buildAudioGenerationEvidenceAsset(asset, warnings));

  const assetJobIds = Array.from(new Set(assets.map((asset) => asset.jobId).filter(Boolean)));
  const rawJobs = assetJobIds.length
    ? await listAudioGenJobsForUser({ uid: args.uid, jobIds: assetJobIds, limit: assetJobIds.length })
    : [];
  const rawJobById = new Map(
    rawJobs.map((job) => [toSafeString(toRecord(job).jobId), toRecord(job)]),
  );

  assetJobIds.forEach((jobId) => {
    if (!rawJobById.has(jobId)) warnings.push({ code: "JOB_NOT_FOUND", jobId });
  });

  const ownedJobs = assetJobIds
    .map((jobId) => rawJobById.get(jobId))
    .filter((job): job is UnknownRecord => Boolean(job));

  const operationIdToJobId = new Map<string, string>();
  ownedJobs.forEach((job) => {
    const jobId = toSafeString(job.jobId);
    readJobBillingOperationIds(toRecord(job.billing)).forEach((operationId) => operationIdToJobId.set(operationId, jobId));
  });

  const jobs = ownedJobs.map((job) => {
    const request = toRecord(job.request);
    const billing = toRecord(job.billing);
    const jobId = toSafeString(job.jobId);
    const completedSegments = Array.isArray(job.completedSegments)
      ? job.completedSegments.map((value) => toSafeNumber(value)).filter((value) => Number.isInteger(value))
      : [];
    return {
      jobId,
      provider: toSafeString(job.provider),
      modelName: toSafeString(job.modelName),
      status: toSafeString(job.status),
      segmentCount: toSafeNumber(job.segmentCount),
      completedSegments,
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
      createdAt: job.createdAt || null,
      request: {
        templateKey: toSafeString(request.templateKey),
        sourceRevision: toSafeString(request.sourceRevision),
        sourceHash: toSafeString(request.sourceHash),
        manifestHash: toSafeString(request.manifestHash),
        format: toSafeString(request.format),
        speed: toSafeNumber(request.speed),
        silenceMs: toSafeNumber(request.silenceMs),
      },
      billing: {
        pricingRevision: toSafeString(billing.pricingRevision),
        reservedCoins: toSafeNumber(billing.reservedCoins ?? billing.estimatedCoins),
        actualCoins: toSafeNumber(billing.actualCoins),
        refundedCoins: toSafeNumber(billing.refundedCoins),
        reservedCharacters: toSafeNumber(billing.reservedCharacters),
        generatedCharacters: toSafeNumber(billing.generatedCharacters),
        settledCharacters: toSafeNumber(billing.settledCharacters),
        reconciliationRequired: billing.reconciliationRequired === true,
      },
    };
  });

  const operationIds = Array.from(operationIdToJobId.keys());
  const { fetchCoinUsageEvidenceByOperationIds } = await import("libs/server-utils/payment/coinUsageLedgerQuery");
  const rawLedger = operationIds.length
    ? await fetchCoinUsageEvidenceByOperationIds({ uid: args.uid, operationIds })
    : [];
  const ledger = rawLedger.map((row) => ({
    ledgerId: toSafeString(row._id),
    operationId: toSafeString(row.operationId),
    jobId: operationIdToJobId.get(toSafeString(row.operationId)) || "",
    billingKey: toSafeString(row.billingKey),
    coins: toSafeNumber(row.coins),
    entryType: toSafeString(row.entryType),
    state: toSafeString(row.state),
    createdAt: row.createdAt || null,
  }));
  const ledgerByJobId = new Map<string, typeof ledger>();
  ledger.forEach((row) => {
    const rows = ledgerByJobId.get(row.jobId) || [];
    rows.push(row);
    ledgerByJobId.set(row.jobId, rows);
  });

  assetJobIds.forEach((jobId) => {
    const rows = ledgerByJobId.get(jobId) || [];
    if (rows.length === 0) warnings.push({ code: "LEDGER_NOT_FOUND", jobId });
    const appliedDeductions = rows.filter((row) => isAppliedDeduction(row));
    if (appliedDeductions.length === 0 && rows.length > 0) warnings.push({ code: "APPLIED_CHARGE_NOT_FOUND", jobId });
    if (appliedDeductions.length > 1) warnings.push({ code: "MULTIPLE_APPLIED_CHARGES", jobId });
  });

  const allJobsHaveAppliedCharge =
    assetJobIds.length > 0 && assetJobIds.every((jobId) => (ledgerByJobId.get(jobId) || []).some((row) => isAppliedDeduction(row)));
  const allLedgerEntriesLinkedToJobs =
    ledger.length > 0 && ledger.every((row) => Boolean(row.jobId) && assetJobIds.includes(row.jobId));

  const foundJobIds = new Set(jobs.map((job) => job.jobId));
  const allAssetsFound = assets.length === requestedAssetIds.length;
  const allJobsFound = assetJobIds.length > 0 && assetJobIds.every((jobId) => foundJobIds.has(jobId));
  const allAssetsLinkedToJobs = allAssetsFound && assets.every((asset) => Boolean(asset.jobId) && foundJobIds.has(asset.jobId));

  return {
    bundleVersion: "1.0",
    assetKind: "audio" as const,
    generatedAt: new Date().toISOString(),
    requestedAssetIds,
    assets,
    jobs,
    ledger,
    integrity: {
      allAssetsFound,
      allJobsFound,
      allAssetsLinkedToJobs,
      allJobsHaveAppliedCharge,
      allLedgerEntriesLinkedToJobs,
      warnings,
    },
  };
}
