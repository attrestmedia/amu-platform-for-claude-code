import "server-only";
import type { PlatformCredentialPayload, QwenEndpointKind } from "types/secure/platformCredentials";
import { QWEN_DEFAULT_ENDPOINT_KIND, QWEN_LEGACY_ENDPOINT_KIND } from "types/secure/platformCredentials";

export const QWEN_CREDENTIAL_VERIFICATION_UNAVAILABLE = "CREDENTIAL_VERIFICATION_UNAVAILABLE";
export const QWEN_MODEL_STUDIO_METADATA_MODELS_URL = "https://dashscope-intl.aliyuncs.com/api/v1/models";
export const QWEN_MODEL_STUDIO_OPENAI_COMPATIBLE_BASE_URL =
  "https://ws-csdm9glk0bm8y6bo.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
export const QWEN_MODEL_STUDIO_DASHSCOPE_BASE_URL =
  "https://ws-csdm9glk0bm8y6bo.ap-southeast-1.maas.aliyuncs.com/api/v1";

/** 사용자 입력 host는 받지 않는다. 레거시 QwenCloud endpoint는 inference에서 차단한다. */
export const QWEN_ENDPOINTS = {
  // Legacy endpoint kinds remain parseable for migration only; they have no runtime host.
  qwencloud_payg: "",
  model_studio_singapore_payg: QWEN_MODEL_STUDIO_OPENAI_COMPATIBLE_BASE_URL,
} as const satisfies Record<QwenEndpointKind, string>;

export function resolveQwenEndpointBaseUrl(value: unknown): string | null {
  if (value !== QWEN_DEFAULT_ENDPOINT_KIND) return null;
  return QWEN_ENDPOINTS[QWEN_DEFAULT_ENDPOINT_KIND];
}

export function resolveQwenDashScopeBaseUrl(value: unknown): string | null {
  return value === QWEN_DEFAULT_ENDPOINT_KIND ? QWEN_MODEL_STUDIO_DASHSCOPE_BASE_URL : null;
}

export function getQwenCredentialPrefixHint(apiKeyValue: unknown, endpointKindValue: unknown): string | undefined {
  const apiKey = typeof apiKeyValue === "string" ? apiKeyValue.trim() : "";
  if (!apiKey || (endpointKindValue !== QWEN_LEGACY_ENDPOINT_KIND && endpointKindValue !== QWEN_DEFAULT_ENDPOINT_KIND)) return undefined;
  if (endpointKindValue === QWEN_LEGACY_ENDPOINT_KIND) return "QWEN_LEGACY_ENDPOINT_BLOCKED";
  if (endpointKindValue === QWEN_DEFAULT_ENDPOINT_KIND && apiKey.startsWith("sk-sp-")) {
    return "QWEN_KEY_PREFIX_MAY_NOT_MATCH_PAYG";
  }
  return undefined;
}

type QwenVerificationResult = { valid: boolean; unavailable?: boolean; code: string; hintCode?: string };

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** 조회 전용 List Models: success/schema가 정상일 때에만 키 인증 valid로 판정한다. */
export async function verifyQwenModelStudioCredential(payload: PlatformCredentialPayload): Promise<QwenVerificationResult> {
  const hintCode = getQwenCredentialPrefixHint(payload.apiKey, payload.endpointKind);
  if (payload.endpointKind === QWEN_LEGACY_ENDPOINT_KIND) {
    return { valid: false, unavailable: true, code: QWEN_CREDENTIAL_VERIFICATION_UNAVAILABLE, hintCode };
  }
  if (payload.endpointKind !== QWEN_DEFAULT_ENDPOINT_KIND || !payload.apiKey || payload.apiKey.startsWith("sk-sp-")) {
    return { valid: false, unavailable: true, code: QWEN_CREDENTIAL_VERIFICATION_UNAVAILABLE, hintCode };
  }

  const url = new URL(QWEN_MODEL_STUDIO_METADATA_MODELS_URL);
  url.searchParams.set("page_no", "1");
  url.searchParams.set("page_size", "1");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", Authorization: `Bearer ${payload.apiKey}` },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return {
      valid: false,
      unavailable: true,
      code: name === "TimeoutError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK_ERROR",
      ...(hintCode ? { hintCode } : {}),
    };
  }

  const body = readRecord(await response.json().catch(() => null));
  if (response.status === 401) return { valid: false, code: "QWEN_METADATA_AUTH_REJECTED" };
  if (!response.ok) {
    return {
      valid: false,
      unavailable: true,
      code: `QWEN_METADATA_HTTP_${response.status}`,
      ...(hintCode ? { hintCode } : {}),
    };
  }

  const output = readRecord(body.output);
  if (body.success !== true || !Array.isArray(output.models)) {
    return { valid: false, unavailable: true, code: "QWEN_METADATA_SCHEMA_UNEXPECTED" };
  }
  return { valid: true, code: "MODEL_LIST_AUTH_OK_ONLY" };
}
