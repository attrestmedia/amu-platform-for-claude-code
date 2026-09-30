import "server-only";
import {
  BACKGROUND_REMOVE_ALLOW_WATERMARKED_OUTPUT,
  BACKGROUND_REMOVE_FALLBACK_ENABLED,
  BACKGROUND_REMOVE_PROVIDER,
} from "consts/env/server";
import { removeBackgroundByPhotoRoom } from "libs/services/photoroom/removeBackground";
import { removeBackgroundByPixian } from "libs/services/pixian/removeBackground";
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProviderResult,
  BackgroundRemovalProviderType,
  BackgroundRemovalResult,
} from "./types";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import type { PlatformCredentialPayload } from "types/secure/platformCredentials";

const PROVIDERS: readonly BackgroundRemovalProviderType[] = ["photoroom", "pixian"];

export function getBackgroundRemovalProviderOrder(): BackgroundRemovalProviderType[] {
  const primary = BACKGROUND_REMOVE_PROVIDER;
  if (!BACKGROUND_REMOVE_FALLBACK_ENABLED) return [primary];
  return [primary, ...PROVIDERS.filter((provider) => provider !== primary)];
}

function isRetryable(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof TypeError) return true;
  const status = Number((error as { status?: unknown } | null)?.status || 0);
  return status === 408 || status === 429 || status >= 500;
}

function assertProviderAvailable(provider: BackgroundRemovalProviderType, payload: PlatformCredentialPayload) {
  if (provider === "pixian" && (!payload.apiId || !payload.apiSecret)) {
    throw Object.assign(new Error("Pixian API 자격 증명이 설정되어 있지 않습니다."), { status: 503 });
  }
  if (provider === "photoroom") {
    if (!payload.apiKey) {
      throw Object.assign(new Error("PhotoRoom API 자격 증명이 설정되어 있지 않습니다."), { status: 503 });
    }
    if (!BACKGROUND_REMOVE_ALLOW_WATERMARKED_OUTPUT && payload.apiKey.toLowerCase().startsWith("sandbox_")) {
      throw Object.assign(new Error("PhotoRoom sandbox의 워터마크 결과는 현재 정책에서 사용할 수 없습니다."), {
        status: 503,
      });
    }
  }
}

async function callProvider(params: {
  provider: BackgroundRemovalProviderType;
  file: File;
  options?: BackgroundRemovalOptions;
  timeoutMs?: number;
}): Promise<BackgroundRemovalProviderResult> {
  const { provider, file, options, timeoutMs } = params;
  if (provider === "pixian") {
    const { payload } = await resolvePlatformCredential("ai.pixian.remove-bg");
    assertProviderAvailable(provider, payload);
    return removeBackgroundByPixian({
      apiId: payload.apiId,
      apiSecret: payload.apiSecret,
      file,
      options,
      timeoutMs,
    });
  }
  const { payload } = await resolvePlatformCredential("ai.photoroom.remove-bg");
  assertProviderAvailable(provider, payload);
  return removeBackgroundByPhotoRoom({ apiKey: payload.apiKey, file, options, timeoutMs });
}

export async function removeBackground(params: {
  file: File;
  options?: BackgroundRemovalOptions;
  timeoutMs?: number;
}): Promise<BackgroundRemovalResult> {
  const attemptedProviders: BackgroundRemovalProviderType[] = [];
  let lastError: unknown;
  const order = getBackgroundRemovalProviderOrder();

  for (const provider of order) {
    attemptedProviders.push(provider);
    try {
      const result = await callProvider({ provider, ...params });
      return {
        ...result,
        provider,
        attemptedProviders,
        fallbackUsed: attemptedProviders.length > 1,
      };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
    }
  }

  throw lastError || Object.assign(new Error("사용 가능한 배경 제거 공급자가 없습니다."), { status: 503 });
}

export type { BackgroundRemovalOptions, BackgroundRemovalProviderType, BackgroundRemovalResult } from "./types";
