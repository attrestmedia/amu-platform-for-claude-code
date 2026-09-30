import { NextRequest, NextResponse } from "next/server";
import { listGenStudioModelCatalog, type GenStudioModelCatalogType } from "libs/server-utils/api/genStudioModelCatalog";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { logger } from "utils/log";

import { extractCodedError } from "utils/common";
export const runtime = "nodejs";

const AGENT_GEN_STUDIO_MODELS_ENDPOINT = "ai/agent/gen-studio-models";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toModelType(raw: string | null): GenStudioModelCatalogType | null {
  const value = toSafeString(raw).toLowerCase();
  if (!value) return "all";
  if (value === "all" || value === "audio" || value === "image" || value === "text" || value === "video") return value;
  return null;
}

/**
 * @docHint
 * @purpose API 라우트(ai / agent / gen-studio-models) 기능 요청 처리
 * @process 요청 파싱  agent 인증  Gen Studio 모델 카탈로그 조회  JSON 응답 반환
 * @domain lab
 * @scope agent-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:models:read" });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_GEN_STUDIO_MODELS_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
      keyHash: auth.keyHash,
    });

    const searchParams = new URL(request.url).searchParams;
    const type = toModelType(searchParams.get("type"));

    if (type === null) {
      return NextResponse.json({ ok: false, error: "invalid_type", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const result = await listGenStudioModelCatalog({ type });

    logger.info("[agent-gen-studio-models] catalog fetched", {
      endpoint: AGENT_GEN_STUDIO_MODELS_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      type: result.type,
      imageProviders: result.image?.totalProviders || 0,
      imageModels: result.image?.totalModels || 0,
      textProviders: result.text?.totalProviders || 0,
      textModels: result.text?.totalModels || 0,
      videoProviders: result.video?.totalProviders || 0,
      videoModels: result.video?.totalModels || 0,
      audioProviders: result.audio?.totalProviders || 0,
      audioModels: result.audio?.totalModels || 0,
    });

    return NextResponse.json({
      ok: true,
      type: result.type,
      image: result.image || null,
      text: result.text || null,
      video: result.video || null,
      // EL-503 §11 — MCP list_models({modelType:"audio"})가 audio section을 받도록 additive로 내려보낸다.
      audio: result.audio || null,
    });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, {
      message: "Failed to fetch model catalog",
    });
    logger.error("[agent-gen-studio-models] failed", {
      endpoint: AGENT_GEN_STUDIO_MODELS_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
