import "server-only";
import type { PlatformCredentialPayload } from "types/secure/platformCredentials";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import {
  isTossCertTestCredential,
  TOSS_CERT_CREDENTIAL_KEY,
  TOSS_CERT_REQUEST_TIMEOUT_MS,
  TOSS_CERT_TOKEN_URL,
} from "./tossCertConfig";
import { TossCertApiError, TossCertLiveCredentialBlockedError } from "./tossCertErrors";

type ResolvedCredential = { payload: PlatformCredentialPayload; version: number };
type CachedToken = { accessToken: string; version: number; expiresAt: number };

export type TossCertTokenCache = Map<string, CachedToken>;
export type TossCertTokenDependencies = {
  fetcher?: typeof fetch;
  now?: () => number;
  resolveCredential?: (key: typeof TOSS_CERT_CREDENTIAL_KEY) => Promise<ResolvedCredential>;
  cache?: TossCertTokenCache;
};

const TOKEN_CACHE_TTL_MARGIN_MS = 300_000;
const tokenCache: TossCertTokenCache = new Map();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function providerErrorCode(body: unknown): unknown {
  if (!isRecord(body)) return undefined;
  if (typeof body.error === "string") return body.error;
  if (isRecord(body.error)) return body.error.errorCode ?? body.error.code;
  return undefined;
}

function providerErrorType(body: unknown): unknown {
  return isRecord(body) && isRecord(body.error) ? body.error.errorType : undefined;
}

function tokenErrorCode(status: number, body: unknown): string {
  const code = providerErrorCode(body);
  if (status === 401 || (typeof code === "string" && code.toLowerCase() === "invalid_client")) {
    return "INVALID_CLIENT";
  }
  if (status === 429) return "RATE_LIMITED";
  return typeof code === "string" ? code : "TOSS_CERT_UPSTREAM_ERROR";
}

export async function getTossCertAccessToken(dependencies: TossCertTokenDependencies = {}): Promise<string> {
  const resolveCredential = dependencies.resolveCredential ?? resolvePlatformCredential;
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => Date.now());
  const cache = dependencies.cache ?? tokenCache;
  const resolved = await resolveCredential(TOSS_CERT_CREDENTIAL_KEY);
  const { payload, version } = resolved;

  if (!isTossCertTestCredential(payload)) throw new TossCertLiveCredentialBlockedError();
  if (!payload.clientId || !payload.clientSecret) {
    throw new TossCertApiError({ errorCode: "CREDENTIAL_UNAVAILABLE", httpStatus: 0 });
  }

  const cached = cache.get(TOSS_CERT_CREDENTIAL_KEY);
  const nowMs = now();
  if (cached && cached.version === version && cached.expiresAt > nowMs) return cached.accessToken;
  if (cached) cache.delete(TOSS_CERT_CREDENTIAL_KEY);

  let response: Response;
  try {
    response = await fetcher(TOSS_CERT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "ca",
        client_id: payload.clientId,
        client_secret: payload.clientSecret,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TOSS_CERT_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TossCertApiError({ errorCode: "NETWORK_ERROR", httpStatus: 0 });
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new TossCertApiError({
      errorCode: tokenErrorCode(response.status, body),
      errorType: providerErrorType(body),
      httpStatus: response.status,
    });
  }

  const accessToken = isRecord(body) && typeof body.access_token === "string" ? body.access_token : "";
  const expiresIn = isRecord(body) ? Number(body.expires_in) : 0;
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new TossCertApiError({ errorCode: "MALFORMED_TOKEN_RESPONSE", httpStatus: response.status });
  }

  cache.set(TOSS_CERT_CREDENTIAL_KEY, {
    accessToken,
    version,
    expiresAt: now() + Math.max(0, expiresIn * 1000 - TOKEN_CACHE_TTL_MARGIN_MS),
  });
  return accessToken;
}
