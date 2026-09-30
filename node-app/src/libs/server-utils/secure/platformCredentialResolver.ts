import "server-only";
import type { PlatformCredentialKey } from "consts/secure/platformCredentials";
import { getActiveDecryptedPlatformCredential } from "libs/database/secure/platformCredentials";
import type { PlatformCredentialPayload } from "types/secure/platformCredentials";

type CachedCredential = {
  payload: PlatformCredentialPayload;
  version: number;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000;
const credentialCache = new Map<PlatformCredentialKey, CachedCredential>();

function unavailableError(credentialKey: PlatformCredentialKey) {
  return Object.assign(new Error(`활성 플랫폼 자격증명이 없습니다: ${credentialKey}`), {
    errorCode: "PLATFORM_CREDENTIAL_UNAVAILABLE",
    status: 503,
  });
}

export async function resolvePlatformCredential(
  credentialKey: PlatformCredentialKey,
): Promise<{ payload: PlatformCredentialPayload; version: number }> {
  const cached = credentialCache.get(credentialKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { payload: { ...cached.payload }, version: cached.version };
  }

  const resolved = await getActiveDecryptedPlatformCredential(credentialKey);
  if (!resolved) {
    credentialCache.delete(credentialKey);
    throw unavailableError(credentialKey);
  }

  credentialCache.set(credentialKey, {
    payload: resolved.payload,
    version: resolved.version,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return { payload: { ...resolved.payload }, version: resolved.version };
}

export function invalidatePlatformCredentialCache(credentialKey?: PlatformCredentialKey) {
  if (credentialKey) {
    credentialCache.delete(credentialKey);
    return;
  }
  credentialCache.clear();
}
