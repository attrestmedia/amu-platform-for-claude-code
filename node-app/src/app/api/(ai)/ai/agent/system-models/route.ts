import { NextRequest, NextResponse } from "next/server";
import { listSystemModelControls } from "libs/server-utils/api/systemModelControl";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_SYSTEM_MODELS_ENDPOINT = "ai/agent/system-models";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toModality(value: unknown): "audio" | "image" | "text" | "video" | "" {
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

async function assertAgent(request: NextRequest) {
  const auth = validateAgentKey(request, { scope: "system:models:read" });
  if (!auth.valid) {
    return {
      auth,
      response: NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 }),
    };
  }

  await enforceAgentRequestRateLimit({
    uid: auth.uid,
    endpoint: AGENT_SYSTEM_MODELS_ENDPOINT,
    limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
    keyHash: auth.keyHash,
  });

  return { auth, response: null };
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
