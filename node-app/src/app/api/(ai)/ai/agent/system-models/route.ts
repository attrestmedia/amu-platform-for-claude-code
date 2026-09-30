import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteSystemModelCatalogItems,
  listSystemModelControls,
  pickSystemModelControlSnapshotByKeys,
  upsertSystemModelCatalogItems,
  type SystemModelControlModalityType,
} from "libs/server-utils/api/systemModelControl";
import { createSystemControlAudit } from "libs/database/system";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_SYSTEM_MODELS_ENDPOINT = "ai/agent/system-models";

type SystemModelAgentInput = {
  provider?: string;
  modelName?: string;
  modality?: SystemModelControlModalityType;
  displayName?: string;
  upstreamModelName?: string;
  enabled?: boolean;
  adminOnly?: boolean;
  defaultModel?: boolean;
  recommendedModel?: boolean;
  supportsImageInput?: boolean;
  supportsAudioInput?: boolean;
  supportsAudioUnderstanding?: boolean;
  reasoningEffort?: string;
  status?: "active" | "deprecated";
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toModality(value: unknown): SystemModelControlModalityType | "" {
  const raw = toSafeString(value).toLowerCase();
  return raw === "audio" || raw === "image" || raw === "text" || raw === "video" ? raw : "";
}

function filterModels(
  models: Awaited<ReturnType<typeof listSystemModelControls>>,
  searchParams: URLSearchParams,
) {
  const provider = toSafeString(searchParams.get("provider")).toLowerCase();
  const modality = toModality(searchParams.get("modality"));
  const status = toSafeString(searchParams.get("status")).toLowerCase();
  const q = toSafeString(searchParams.get("q")).toLowerCase();

  return models.filter((item) => {
    if (provider && item.provider !== provider) return false;
    if (modality && item.modality !== modality) return false;
    if (status && item.status !== status) return false;
    if (q) {
      const haystack = `${item.key} ${item.provider} ${item.modelName} ${item.displayName} ${item.upstreamModelName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function normalizeInputItems(raw: unknown) {
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  return (items as SystemModelAgentInput[])
    .map((item) => {
      const provider = toSafeString(item.provider).toLowerCase();
      const modelName = toSafeString(item.modelName);
      const modality = toModality(item.modality);
      if (!provider || !modelName || !modality) return null;
      const status: "active" | "deprecated" = item.status === "deprecated" ? "deprecated" : "active";
      return {
        provider,
        modelName,
        modality,
        displayName: toSafeString(item.displayName),
        upstreamModelName: toSafeString(item.upstreamModelName),
        enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
        adminOnly: typeof item.adminOnly === "boolean" ? item.adminOnly : undefined,
        defaultModel: typeof item.defaultModel === "boolean" ? item.defaultModel : undefined,
        recommendedModel: typeof item.recommendedModel === "boolean" ? item.recommendedModel : undefined,
        supportsImageInput: typeof item.supportsImageInput === "boolean" ? item.supportsImageInput : undefined,
        supportsAudioInput: typeof item.supportsAudioInput === "boolean" ? item.supportsAudioInput : undefined,
        supportsAudioUnderstanding:
          typeof item.supportsAudioUnderstanding === "boolean" ? item.supportsAudioUnderstanding : undefined,
        reasoningEffort: typeof item.reasoningEffort === "string" ? item.reasoningEffort : undefined,
        status,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function assertAgent(request: NextRequest) {
  const auth = validateAgentKey(request, {
    scope: request.method === "GET" ? "system:models:read" : "system:models:write",
  });
  if (!auth.valid) {
    return { auth, response: NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 }) };
  }

  await enforceAgentRequestRateLimit({
    uid: auth.uid,
    endpoint: AGENT_SYSTEM_MODELS_ENDPOINT,
    limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
    keyHash: auth.keyHash,
  });

  return { auth, response: null };
}

async function createAgentModelAudit(args: {
  request: NextRequest;
  actionType: "model_upsert" | "model_delete";
  actorId: string;
  reason: string;
  beforeSnapshot: unknown[];
  afterSnapshot: unknown[];
  summary: string[];
}) {
  const requestId =
    String(args.request.headers.get("x-request-id") || args.request.headers.get("x-amu-request-id") || "").trim() ||
    randomUUID();
  await createSystemControlAudit({
    auditId: `sys-audit-${Date.now()}-${randomUUID().slice(0, 8)}`,
    requestId,
    targetType: "model_catalog",
    actionType: args.actionType,
    actorId: args.actorId,
    reason: args.reason,
    confirmPolicy: { type: "reason_only", phrase: "" },
    beforeSnapshot: { items: args.beforeSnapshot },
    afterSnapshot: { items: args.afterSnapshot },
    summary: args.summary,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { auth, response } = await assertAgent(request);
    if (response) return response;

    const searchParams = new URL(request.url).searchParams;
    const models = filterModels(await listSystemModelControls(), searchParams);

    logger.info("[agent-system-models] catalog listed", {
      endpoint: AGENT_SYSTEM_MODELS_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      count: models.length,
    });

    return NextResponse.json({ ok: true, count: models.length, models });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "Failed to list system models" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, response } = await assertAgent(request);
    if (response) return response;

    const body = await request.json();
    const reason = toSafeString(body?.reason);
    const items = normalizeInputItems(body?.models || body?.items || body?.model);
    if (!reason) {
      return NextResponse.json({ ok: false, error: "reason_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    }
    if (!items.length || items.length > 50) {
      return NextResponse.json({ ok: false, error: "invalid_models", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const targetKeys = items.map((item) => `${item.provider}:${item.modelName}:${item.modality}`);
    const beforeModels = await listSystemModelControls();
    const beforeSnapshot = pickSystemModelControlSnapshotByKeys(beforeModels, targetKeys);
    const models = await upsertSystemModelCatalogItems({ items });
    const afterSnapshot = pickSystemModelControlSnapshotByKeys(models, targetKeys);

    await createAgentModelAudit({
      request,
      actionType: "model_upsert",
      actorId: auth.uid,
      reason,
      beforeSnapshot,
      afterSnapshot,
      summary: targetKeys.map((key) => `model upsert: ${key}`),
    });

    logger.info("[agent-system-models] catalog upserted", {
      endpoint: AGENT_SYSTEM_MODELS_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      reason,
      count: items.length,
    });

    return NextResponse.json({ ok: true, count: models.length, models });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "Failed to upsert system models" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { auth, response } = await assertAgent(request);
    if (response) return response;

    const body = await request.json();
    const reason = toSafeString(body?.reason);
    const keys = Array.isArray(body?.keys) ? body.keys.map(toSafeString).filter(Boolean) : [];
    const targets = normalizeInputItems(body?.models || body?.items || body?.targets || body?.model).map((item) => ({
      provider: item.provider,
      modelName: item.modelName,
      modality: item.modality,
    }));
    const hardDelete = body?.hardDelete === true;

    if (!reason) {
      return NextResponse.json({ ok: false, error: "reason_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    }
    if (keys.length === 0 && targets.length === 0) {
      return NextResponse.json({ ok: false, error: "delete_target_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const targetKeys = [
      ...keys,
      ...targets.map((target) => `${target.provider}:${target.modelName}:${target.modality}`),
    ];
    const beforeModels = await listSystemModelControls();
    const beforeSnapshot = pickSystemModelControlSnapshotByKeys(beforeModels, targetKeys);
    const result = await deleteSystemModelCatalogItems({ keys, targets, hardDelete });
    const afterSnapshot = pickSystemModelControlSnapshotByKeys(result.models, targetKeys);

    await createAgentModelAudit({
      request,
      actionType: "model_delete",
      actorId: auth.uid,
      reason,
      beforeSnapshot,
      afterSnapshot,
      summary: result.targetKeys.map((key) => `model delete: ${key}`),
    });

    logger.info("[agent-system-models] catalog deleted", {
      endpoint: AGENT_SYSTEM_MODELS_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      reason,
      hardDelete,
      targetKeys: result.targetKeys,
      deletedCount: result.deletedCount,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "Failed to delete system models" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
