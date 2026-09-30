import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { ANTHROPIC_BASE_URL, DEEPSEEK_BASE_URL, OPENAI_BASE_URL, XAI_BASE_URL, ZAI_BASE_URL } from "consts/env/server";
import { resolvePlatformCredential } from "./platformCredentialResolver";
import { resolveQwenEndpointBaseUrl } from "./qwenCredentialVerification";

type VersionedClient<T> = { version: number; client: T };

let openAIClient: VersionedClient<OpenAI> | null = null;
let anthropicClient: VersionedClient<Anthropic> | null = null;
let googleClient: VersionedClient<GoogleGenAI> | null = null;
let xAIClient: VersionedClient<OpenAI> | null = null;
let deepSeekClient: VersionedClient<OpenAI> | null = null;
let zaiClient: VersionedClient<OpenAI> | null = null;
let qwenClient: VersionedClient<OpenAI> | null = null;

export async function getPlatformOpenAIClient() {
  const credential = await resolvePlatformCredential("ai.openai.default");
  if (openAIClient?.version === credential.version) return openAIClient.client;
  const client = new OpenAI({ apiKey: credential.payload.apiKey, baseURL: OPENAI_BASE_URL });
  openAIClient = { version: credential.version, client };
  return client;
}

export async function getPlatformAnthropicClient() {
  const credential = await resolvePlatformCredential("ai.anthropic.default");
  if (anthropicClient?.version === credential.version) return anthropicClient.client;
  // SDK는 baseURL 미지정 시 env ANTHROPIC_BASE_URL(`…/v1`, fetch 경로용)을 읽고 `/v1/messages`를 덧붙인다.
  // 그대로 두면 `/v1/v1/messages` 404(not_found_error)가 되므로 `/v1`을 떼어 명시한다.
  const client = new Anthropic({
    apiKey: credential.payload.apiKey,
    baseURL: ANTHROPIC_BASE_URL.replace(/\/+$/, "").replace(/\/v1$/, ""),
  });
  anthropicClient = { version: credential.version, client };
  return client;
}

export async function getPlatformGoogleClient() {
  const credential = await resolvePlatformCredential("ai.google.gemini");
  if (googleClient?.version === credential.version) return googleClient.client;
  const client = new GoogleGenAI({ apiKey: credential.payload.apiKey });
  googleClient = { version: credential.version, client };
  return client;
}

export async function getPlatformXAIClient() {
  const credential = await resolvePlatformCredential("ai.xai.default");
  if (xAIClient?.version === credential.version) return xAIClient.client;
  const client = new OpenAI({ apiKey: credential.payload.apiKey, baseURL: XAI_BASE_URL });
  xAIClient = { version: credential.version, client };
  return client;
}

export async function getPlatformDeepSeekClient() {
  const credential = await resolvePlatformCredential("ai.deepseek.default");
  if (deepSeekClient?.version === credential.version) return deepSeekClient.client;
  const client = new OpenAI({ apiKey: credential.payload.apiKey, baseURL: DEEPSEEK_BASE_URL });
  deepSeekClient = { version: credential.version, client };
  return client;
}

export async function getPlatformZaiClient() {
  const credential = await resolvePlatformCredential("ai.zai.default");
  if (zaiClient?.version === credential.version) return zaiClient.client;
  const client = new OpenAI({ apiKey: credential.payload.apiKey, baseURL: ZAI_BASE_URL });
  zaiClient = { version: credential.version, client };
  return client;
}

/**
 * Model Studio client uses only the saved Singapore workspace allowlist entry.
 * The D2 release/consent/price gates must run before this is requested.
 */
export async function getPlatformQwenOpenAIClient() {
  const credential = await resolvePlatformCredential("ai.qwen.default");
  const baseURL = resolveQwenEndpointBaseUrl(credential.payload.endpointKind);
  if (!baseURL) {
    throw Object.assign(new Error("Qwen 자격증명 endpoint 종류가 런타임 허용 목록과 다릅니다."), {
      errorCode: "QWEN_LEGACY_ENDPOINT_BLOCKED",
      status: 409,
    });
  }
  if (qwenClient?.version === credential.version) return qwenClient.client;
  const client = new OpenAI({ apiKey: credential.payload.apiKey, baseURL, timeout: 150_000, maxRetries: 0 });
  qwenClient = { version: credential.version, client };
  return client;
}
