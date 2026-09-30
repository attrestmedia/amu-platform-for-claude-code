/**
 * @docHint
 * @purpose ai-model-tracker의 가격 문서 AI 추출(Gemini)을 서버에서 인증 주입해 대행(자격증명 비노출)
 * @process agent key + scope 검증 → model allowlist·프롬프트 상한 검증 → rate limit(fail-closed) → Gemini 자격증명 주입 → generateContent → envelope 반환
 * @domain integration
 * @scope agent-api
 */
import { NextRequest, NextResponse } from "next/server";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import {
  AGENT_PRICING_EXTRACTION_POLICY,
  enforceAgentRequestRateLimit,
} from "libs/server-utils/auth/agentRateLimit";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { logger } from "utils/log";
import { extractCodedError } from "utils/common";

export const runtime = "nodejs";

const ENDPOINT = "ai/agent/provider-pricing-extraction";
const REQUIRED_SCOPE = "ai:provider-catalog:extract";

// 외부 유료 호출이므로 모델을 저비용 추출용으로 고정한다. 클라이언트가 상위 모델로 올릴 수 없다.
// gemini-2.5-flash-lite는 제외한다 — 신규 사용자에게 제공되지 않아 이 자격증명으로는 404다
// ("no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite").
// 자동 승격 alias(gemini-flash-lite-latest)도 비용 예측이 어려워 넣지 않는다.
const ALLOWED_MODELS = new Set(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: REQUIRED_SCOPE });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      model?: unknown;
      prompt?: unknown;
      allowSearch?: unknown;
    };

    const model = toSafeString(body.model) || DEFAULT_MODEL;
    if (!ALLOWED_MODELS.has(model)) {
      return NextResponse.json(
        { ok: false, error: "model_not_allowed", errorCode: "INVALID_INPUT", allowedModels: [...ALLOWED_MODELS] },
        { status: 400 },
      );
    }

    const prompt = toSafeString(body.prompt);
    if (!prompt) {
      return NextResponse.json({ ok: false, error: "prompt_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    }
    if (prompt.length > AGENT_PRICING_EXTRACTION_POLICY.maxPromptChars) {
      return NextResponse.json(
        {
          ok: false,
          error: "prompt_too_long",
          errorCode: "INVALID_INPUT",
          maxPromptChars: AGENT_PRICING_EXTRACTION_POLICY.maxPromptChars,
        },
        { status: 400 },
      );
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: ENDPOINT,
      limitPerMinute: AGENT_PRICING_EXTRACTION_POLICY.maxRequestsPerMinute,
      keyHash: auth.keyHash,
      // 외부 유료 호출이므로 limiter 저장소 장애 시 차단한다(server-economy-security fail-closed).
      failClosed: true,
    });

    const { payload: cred } = await resolvePlatformCredential("ai.google.gemini");
    const apiKey = toSafeString(cred.apiKey);
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "provider_credential_incomplete", errorCode: "PLATFORM_CREDENTIAL_UNAVAILABLE" },
        { status: 503 },
      );
    }

    // tools와 generationConfig는 서버가 고정한다 — 클라이언트가 출력 상한을 올려 비용을 키울 수 없다.
    const tools: Record<string, unknown>[] = [{ url_context: {} }];
    if (body.allowSearch === true) tools.push({ google_search: {} });

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools,
          generationConfig: {
            temperature: 0,
            maxOutputTokens: AGENT_PRICING_EXTRACTION_POLICY.maxOutputTokens,
          },
        }),
        signal: AbortSignal.timeout(AGENT_PRICING_EXTRACTION_POLICY.upstreamTimeoutMs),
      },
    );

    const text = await upstream.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }

    if (!upstream.ok) {
      logger.warn("[provider-pricing-extraction] upstream error", { model, status: upstream.status });
      return NextResponse.json(
        { ok: false, model, status: upstream.status, errorCode: `UPSTREAM_HTTP_${upstream.status}`, data },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, model, status: upstream.status, data });
  } catch (e: unknown) {
    const { message, errorCode, status } = extractCodedError(e);
    logger.error("[provider-pricing-extraction] failed", { message, errorCode });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status: status || 500 });
  }
}
