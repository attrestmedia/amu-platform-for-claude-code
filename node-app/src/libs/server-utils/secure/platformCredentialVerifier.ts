import "server-only";
import {
  ANTHROPIC_BASE_URL,
  AWS_SES_NEWSLETTER_CONFIGURATION_SET,
  AWS_SES_NEWSLETTER_IDENTITY,
  AWS_SES_REGION,
  AWS_SES_TRANSACTIONAL_CONFIGURATION_SET,
  AWS_SES_TRANSACTIONAL_IDENTITY,
  DEEPSEEK_BASE_URL,
  OPENAI_BASE_URL,
  ZAI_BASE_URL,
  XAI_BASE_URL,
} from "consts/env/server";
import { wpApiUri } from "consts/env/runtime";
import { createUpbitAuthorizationHeader } from "libs/trading/upbitJwtSigner";
import {
  TossInvalidClientError,
  TossIpNotAllowedError,
  TossRateLimitError,
  TossTokenUpstreamError,
  requestTossAccessToken,
} from "libs/trading/tradingTokenManager";
import { tradeTokenManager } from "libs/trading/tossTokenManagerRuntime";
import type { PlatformCredentialKey } from "consts/secure/platformCredentials";
import type { PlatformCredentialPayload } from "types/secure/platformCredentials";
import {
  buildWordPressRequestHeaders,
  isCloudflareChallengeResponse,
} from "libs/server-utils/wordpressRequestHeaders";
import { ELEVENLABS_API_BASE_URL } from "libs/server-utils/audio/providers/elevenlabsSpeech";
import {
  classifyElevenLabsAuthStatus,
  readElevenLabsDetailStatus,
  readElevenLabsQuotaState,
} from "./elevenlabsCredentialVerification";
import { classifyZaiChatAuthStatus } from "./zaiCredentialVerification";
import {
  classifyTypesafeModelsStatus,
  TYPESAFE_API_BASE_URL,
  TYPESAFE_MODELS_PROBE_ENABLED,
  TYPESAFE_VERIFY_DEFERRED_CODE,
} from "./typesafeCredentialVerification";
import { verifyQwenModelStudioCredential } from "./qwenCredentialVerification";

type VerificationResult = {
  valid: boolean;
  code: string;
  unavailable?: boolean;
  hintCode?: string;
};

async function request(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json", ...init?.headers },
  });
}

function normalizeBaseUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function verifySesConfiguration(payload: PlatformCredentialPayload): VerificationResult {
  const expected: PlatformCredentialPayload = {
    region: AWS_SES_REGION,
    transactionalIdentity: AWS_SES_TRANSACTIONAL_IDENTITY,
    transactionalConfigurationSet: AWS_SES_TRANSACTIONAL_CONFIGURATION_SET,
    newsletterIdentity: AWS_SES_NEWSLETTER_IDENTITY,
    newsletterConfigurationSet: AWS_SES_NEWSLETTER_CONFIGURATION_SET,
  };

  for (const [field, value] of Object.entries(expected)) {
    if (payload[field] !== value) {
      return { valid: false, code: `SES_CONFIG_MISMATCH_${field.toUpperCase()}` };
    }
  }

  return { valid: true, code: "SES_CONFIG_OK" };
}

async function verifyBearerModels(baseUrl: string, apiKey: string): Promise<VerificationResult> {
  const response = await request(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return response.ok
    ? { valid: true, code: "MODELS_OK" }
    : { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
}

async function verifyNoChargeUploadAuth(
  url: string,
  headers: Record<string, string>,
): Promise<VerificationResult> {
  const response = await request(url, { method: "POST", headers, body: new FormData() });
  if (response.status === 401 || response.status === 403) {
    return { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
  }
  if (response.ok || response.status === 400 || response.status === 415 || response.status === 422) {
    return { valid: true, code: `AUTH_ACCEPTED_HTTP_${response.status}` };
  }
  return { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
}

/**
 * ElevenLabs는 **조회 전용 GET /v1/models**로만 확인한다. 합성·전사 endpoint는 크레딧을 소비하므로
 * 검증에 쓰지 않는다 (rules/platform-credentials.md §3).
 *
 * 키가 유효하면 구독 조회로 잔여 크레딧까지 한 번 더 본다. Grant는 33,000,000 크레딧·12개월 한정이라
 * "키는 맞는데 크레딧이 없다"가 실제 실패 원인이 된다 (EL-004). 구독 조회 권한이 없으면 unknown이며
 * 이를 소진으로 해석하지 않는다 — 검증 실패로 바꾸지 않고 코드만 나눈다.
 */
async function verifyElevenLabsApiKey(apiKey: string): Promise<VerificationResult> {
  const headers = { "xi-api-key": apiKey };
  const response = await request(`${ELEVENLABS_API_BASE_URL}/models`, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return classifyElevenLabsAuthStatus(response.status, readElevenLabsDetailStatus(body));
  }

  const subscription = await request(`${ELEVENLABS_API_BASE_URL}/user/subscription`, { headers }).catch(() => null);
  if (!subscription?.ok) return { valid: true, code: "MODELS_OK" };
  const quota = readElevenLabsQuotaState(await subscription.json().catch(() => null));
  return { valid: true, code: quota === "exhausted" ? "MODELS_OK_QUOTA_EXHAUSTED" : "MODELS_OK" };
}

async function verifyTypesafeApiKey(apiKey: string): Promise<VerificationResult> {
  if (!TYPESAFE_MODELS_PROBE_ENABLED) {
    return { valid: false, code: TYPESAFE_VERIFY_DEFERRED_CODE };
  }

  const response = await request(`${TYPESAFE_API_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return classifyTypesafeModelsStatus(response.status);
}

// Z.ai chat completions에는 결제·생성이 발생하지 않는 빈 POST를 보내 인증만 확인한다.
async function verifyZaiChatAuth(apiKey: string): Promise<VerificationResult> {
  const response = await request(`${normalizeBaseUrl(ZAI_BASE_URL)}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return classifyZaiChatAuthStatus(response.status);
}

export async function verifyPlatformCredential(
  credentialKey: PlatformCredentialKey,
  payload: PlatformCredentialPayload,
): Promise<VerificationResult> {
  try {
    switch (credentialKey) {
      case "ai.openai.default":
        return verifyBearerModels(OPENAI_BASE_URL, payload.apiKey);
      case "ai.xai.default":
        return verifyBearerModels(XAI_BASE_URL, payload.apiKey);
      case "ai.deepseek.default":
        return verifyBearerModels(DEEPSEEK_BASE_URL, payload.apiKey);
      case "ai.zai.default":
        return verifyZaiChatAuth(payload.apiKey);
      case "ai.elevenlabs.default":
        return verifyElevenLabsApiKey(payload.apiKey);
      case "ai.typesafe.default":
        return verifyTypesafeApiKey(payload.apiKey);
      case "ai.anthropic.default": {
        const response = await request(`${normalizeBaseUrl(ANTHROPIC_BASE_URL)}/models`, {
          headers: {
            "x-api-key": payload.apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        return response.ok
          ? { valid: true, code: "MODELS_OK" }
          : { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
      }
      case "ai.google.gemini": {
        const params = new URLSearchParams({ key: payload.apiKey, pageSize: "1" });
        const response = await request(`https://generativelanguage.googleapis.com/v1beta/models?${params}`);
        return response.ok
          ? { valid: true, code: "MODELS_OK" }
          : { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
      }
      case "ai.qwen.default":
        // Singapore Model Studio List Models GET은 조회 전용이다. 성공은 키 인증만 증명한다.
        return verifyQwenModelStudioCredential(payload);
      case "ai.photoroom.remove-bg":
        return verifyNoChargeUploadAuth("https://sdk.photoroom.com/v1/segment", {
          "x-api-key": payload.apiKey,
        });
      case "ai.pixian.remove-bg": {
        const authorization = Buffer.from(`${payload.apiId}:${payload.apiSecret}`, "utf8").toString("base64");
        return verifyNoChargeUploadAuth("https://api.pixian.ai/api/v2/remove-background", {
          Authorization: `Basic ${authorization}`,
        });
      }
      case "integration.wordpress.rest": {
        const authorization = Buffer.from(
          `${payload.username}:${payload.applicationPassword}`,
          "utf8",
        ).toString("base64");
        const url = `${normalizeBaseUrl(wpApiUri())}/users/me?context=edit`;
        const response = await request(url, {
          headers: buildWordPressRequestHeaders(url, { Authorization: `Basic ${authorization}` }),
        });
        if (response.ok) return { valid: true, code: "WP_ME_OK" };
        if (isCloudflareChallengeResponse(response)) {
          return { valid: false, code: "WP_CLOUDFLARE_CHALLENGE" };
        }

        const body = await response.json().catch(() => null);
        const wpCode =
          body && typeof body === "object" && "code" in body
            ? String(body.code || "")
            : "";
        if (wpCode === "incorrect_password") {
          return { valid: false, code: "WP_INCORRECT_PASSWORD" };
        }
        if (wpCode === "rest_not_logged_in") {
          return { valid: false, code: "WP_NOT_AUTHENTICATED" };
        }
        return { valid: false, code: `WP_HTTP_${response.status}` };
      }
      case "infra.aws.ses":
        // SES SDK·IAM 호출은 SES-310/320에서 검증한다. 여기서는 승인된 비밀 아닌 설정의 일치만 확인한다.
        return verifySesConfiguration(payload);
      case "stock.pexels.search": {
        const response = await request("https://api.pexels.com/v1/search?query=test&per_page=1", {
          headers: { Authorization: payload.apiKey },
        });
        return response.ok
          ? { valid: true, code: "SEARCH_OK" }
          : { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
      }
      case "stock.pixabay.search": {
        const params = new URLSearchParams({
          key: payload.apiKey,
          q: "test",
          image_type: "photo",
          per_page: "3",
          safesearch: "true",
        });
        const response = await request(`https://pixabay.com/api/?${params}`);
        return response.ok
          ? { valid: true, code: "SEARCH_OK" }
          : { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
      }
      case "stock.unsplash.search": {
        const response = await request("https://api.unsplash.com/search/photos?query=test&per_page=1", {
          headers: { Authorization: `Client-ID ${payload.apiKey}` },
        });
        return response.ok
          ? { valid: true, code: "SEARCH_OK" }
          : { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
      }
      case "trading.upbit.exchange": {
        // 조회 전용 엔드포인트다. 주문 계열은 호출하지 않는다.
        // /v1/api_keys는 만료일까지 함께 주므로 TL-105의 키 만료 감시가 같은 경로를 재사용한다.
        const response = await request("https://api.upbit.com/v1/api_keys", {
          headers: {
            Authorization: createUpbitAuthorizationHeader({
              accessKey: payload.accessKey,
              secretKey: payload.secretKey,
            }),
          },
        });
        if (response.ok) return { valid: true, code: "UPBIT_KEY_OK" };
        // 자격증명 문제와 IP 문제를 구분한다 — 후자는 키를 다시 발급해도 해결되지 않는다.
        if (response.status === 401) {
          const body = await response.text();
          if (body.includes("no_authorization_i_p")) return { valid: false, code: "UPBIT_IP_NOT_ALLOWED" };
          return { valid: false, code: "UPBIT_INVALID_KEY" };
        }
        return { valid: false, code: `UPSTREAM_HTTP_${response.status}` };
      }
      case "trading.toss.securities": {
        // **결합점(TL-102)**: 이 검증은 **토큰을 발급**한다. 토스는 클라이언트당 유효 토큰 1개라는 전제이므로
        // 발급한 토큰을 Redis 캐시에 기록해야 한다. 누락하면 관리자가 검증 버튼을 누를 때마다
        // worker 토큰이 무효화되어 매매가 잠깐 멈춘다.
        try {
          const token = await requestTossAccessToken({
            clientId: payload.clientId,
            clientSecret: payload.clientSecret,
          });
          await tradeTokenManager.recordTossAccessToken({
            credentials: { clientId: payload.clientId, clientSecret: payload.clientSecret },
            accessToken: token.accessToken,
            expiresIn: token.expiresIn,
          });
          return { valid: true, code: "TOSS_TOKEN_OK" };
        } catch (error) {
          if (error instanceof TossIpNotAllowedError) {
            // 403은 IP allowlist 문제 — 자격증명 재발급으로 해결되지 않는다. 즉시 paused 강등 + 재시도 중단.
            await tradeTokenManager.signalPaused("toss_securities_ip_not_allowed").catch(() => null);
            return { valid: false, code: "TOSS_IP_NOT_ALLOWED" };
          }
          if (error instanceof TossInvalidClientError) {
            return { valid: false, code: "TOSS_INVALID_CLIENT" };
          }
          if (error instanceof TossRateLimitError) {
            return { valid: false, code: "UPSTREAM_HTTP_429" };
          }
          if (error instanceof TossTokenUpstreamError) {
            return { valid: false, code: `UPSTREAM_HTTP_${error.status}` };
          }
          return { valid: false, code: "UPSTREAM_NETWORK_ERROR" };
        }
      }
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : "UNKNOWN";
    return { valid: false, code: name === "TimeoutError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK_ERROR" };
  }
}
