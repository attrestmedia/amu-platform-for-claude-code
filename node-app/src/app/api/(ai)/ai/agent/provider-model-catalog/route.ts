/**
 * @docHint
 * @purpose ai-model-tracker의 provider 모델 목록 조회를 서버에서 인증 주입해 대행(자격증명 비노출)
 * @process agent key + scope 검증 → provider allowlist 판정 → rate limit → DB 자격증명 주입 → provider /models 조회 → envelope 반환
 * @domain integration
 * @scope agent-api
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ANTHROPIC_BASE_URL,
  DEEPSEEK_BASE_URL,
  OPENAI_BASE_URL,
  XAI_BASE_URL,
} from "consts/env/server";
import { ELEVENLABS_API_BASE_URL } from "libs/server-utils/audio/providers/elevenlabsSpeech";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import {
  AGENT_PROVIDER_CATALOG_POLICY,
  enforceAgentRequestRateLimit,
} from "libs/server-utils/auth/agentRateLimit";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import type { PlatformCredentialKey } from "consts/secure/platformCredentials";
import { logger } from "utils/log";
import { extractCodedError } from "utils/common";
import { TYPESAFE_API_BASE_URL } from "libs/server-utils/secure/typesafeCredentialVerification";

export const runtime = "nodejs";

const ENDPOINT = "ai/agent/provider-model-catalog";
const REQUIRED_SCOPE = "ai:provider-catalog:read";

/**
 * provider별 요청 URL과 인증 방식은 **서버가 소유한다.**
 * 클라이언트는 provider id만 보내며 URL·헤더를 지정할 수 없다 — 임의 호스트 호출(SSRF) 차단.
 */
type ProviderSpec = {
  credentialKey: PlatformCredentialKey;
  /** cursor는 provider가 직전 응답에서 돌려준 페이지 토큰이다. 서버가 provider별 파라미터명으로 매핑한다. */
  buildUrl: (cursor: string) => string;
  buildHeaders: (apiKey: string) => Record<string, string>;
};

function normalizeBaseUrl(baseUrl: string) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function bearerHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}

const PROVIDER_SPECS: Record<string, ProviderSpec> = {
  openai: {
    credentialKey: "ai.openai.default",
    buildUrl: () => `${normalizeBaseUrl(OPENAI_BASE_URL)}/models`,
    buildHeaders: bearerHeaders,
  },
  xai: {
    credentialKey: "ai.xai.default",
    buildUrl: () => `${normalizeBaseUrl(XAI_BASE_URL)}/models`,
    buildHeaders: bearerHeaders,
  },
  deepseek: {
    credentialKey: "ai.deepseek.default",
    buildUrl: () => `${normalizeBaseUrl(DEEPSEEK_BASE_URL)}/models`,
    buildHeaders: bearerHeaders,
  },
  anthropic: {
    credentialKey: "ai.anthropic.default",
    buildUrl: (cursor) => {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("after_id", cursor);
      return `${normalizeBaseUrl(ANTHROPIC_BASE_URL)}/models?${params}`;
    },
    buildHeaders: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    }),
  },
  // EL-201. tracker가 ElevenLabs 키를 직접 들고 있지 않도록 조회를 서버가 대행한다.
  // 모델 목록 조회일 뿐이며 합성·전사(크레딧 소비) endpoint는 대행하지 않는다.
  elevenlabs: {
    credentialKey: "ai.elevenlabs.default",
    buildUrl: () => `${ELEVENLABS_API_BASE_URL}/models`,
    buildHeaders: (apiKey) => ({ "xi-api-key": apiKey, Accept: "application/json" }),
  },
  // JEV-102 선행 계약: provider id만 받아 모델 목록 원문 JSON을 기존 envelope로 전달한다.
  // 이 경로는 판단 호출을 대행하지 않는다. GET /v1/models는 OD-JEV-05(2026-09-26)에 따라 과금 여부와 무관하게 허용한다.
  typesafe: {
    credentialKey: "ai.typesafe.default",
    buildUrl: () => `${TYPESAFE_API_BASE_URL}/models`,
    buildHeaders: bearerHeaders,
  },
  google: {
    credentialKey: "ai.google.gemini",
    buildUrl: (cursor) => {
      const params = new URLSearchParams({ pageSize: "1000" });
      if (cursor) params.set("pageToken", cursor);
      return `https://generativelanguage.googleapis.com/v1beta/models?${params}`;
    },
    // 키를 query string이 아니라 헤더로 보낸다 — URL 로그·리퍼러에 키가 남지 않게 한다.
    buildHeaders: (apiKey) => ({ "x-goog-api-key": apiKey, Accept: "application/json" }),
  },
};

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: REQUIRED_SCOPE });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { provider?: unknown; cursor?: unknown };
    const provider = toSafeString(body.provider).toLowerCase();
    const spec = PROVIDER_SPECS[provider];
    if (!spec) {
      return NextResponse.json(
        {
          ok: false,
          error: "unsupported_provider",
          errorCode: "INVALID_INPUT",
          allowedProviders: Object.keys(PROVIDER_SPECS),
        },
        { status: 400 },
      );
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: ENDPOINT,
      limitPerMinute: AGENT_PROVIDER_CATALOG_POLICY.maxRequestsPerMinute,
      keyHash: auth.keyHash,
      // 자격증명을 대행하는 경로이므로 limiter 저장소 장애 시 통과시키지 않는다.
      failClosed: true,
    });

    const { payload: cred } = await resolvePlatformCredential(spec.credentialKey);
    const apiKey = toSafeString(cred.apiKey);
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "provider_credential_incomplete", errorCode: "PLATFORM_CREDENTIAL_UNAVAILABLE", provider },
        { status: 503 },
      );
    }

    // cursor는 직전 provider 응답의 페이지 토큰만 허용한다. URLSearchParams가 인코딩하므로
    // 값이 URL 구조를 바꾸지 못한다.
    const cursor = toSafeString(body.cursor).slice(0, 512);

    const upstream = await fetch(spec.buildUrl(cursor), {
      method: "GET",
      headers: spec.buildHeaders(apiKey),
      signal: AbortSignal.timeout(AGENT_PROVIDER_CATALOG_POLICY.upstreamTimeoutMs),
    });

    const text = await upstream.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }

    if (!upstream.ok) {
      logger.warn("[provider-model-catalog] upstream error", { provider, status: upstream.status });
      return NextResponse.json(
        { ok: false, provider, status: upstream.status, errorCode: `UPSTREAM_HTTP_${upstream.status}`, data },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, provider, status: upstream.status, data });
  } catch (e: unknown) {
    const { message, errorCode, status } = extractCodedError(e);
    logger.error("[provider-model-catalog] failed", { message, errorCode });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status: status || 500 });
  }
}
