import "server-only";
import {
  TOSS_CERT_API_BASE_URL,
  TOSS_CERT_REQUEST_TIMEOUT_MS,
} from "./tossCertConfig";
import { TossCertApiError } from "./tossCertErrors";
import { createTossCertSession, type TossCertSession } from "./tossCertSession";
import { getTossCertAccessToken, type TossCertTokenDependencies } from "./tossCertToken";

type TossCertClientDependencies = {
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  tokenDependencies?: TossCertTokenDependencies;
  createSession?: () => TossCertSession;
};

export type TossCertIdentityRequest = {
  txId: string;
  authUrl: string;
  requestedDt: string;
};

export type TossCertIdentityStatus = { status: string };
export type TossCertIdentityResult = {
  status: string;
  completedDt: string | null;
  ageGroup: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function providerError(body: unknown) {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  return {
    errorCode: error?.errorCode,
    errorType: error?.errorType,
  };
}

function malformedResponse(httpStatus: number): TossCertApiError {
  return new TossCertApiError({ errorCode: "MALFORMED_RESPONSE", httpStatus });
}

async function callApi(
  path: "request" | "status" | "result",
  body: Record<string, unknown>,
  dependencies: TossCertClientDependencies,
): Promise<Record<string, unknown>> {
  const fetcher = dependencies.fetcher ?? fetch;
  const accessToken = dependencies.getAccessToken
    ? await dependencies.getAccessToken()
    : await getTossCertAccessToken({ ...dependencies.tokenDependencies, fetcher });

  let response: Response;
  try {
    response = await fetcher(`${TOSS_CERT_API_BASE_URL}/${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TOSS_CERT_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TossCertApiError({ errorCode: "NETWORK_ERROR", httpStatus: 0 });
  }

  const responseBody = await response.json().catch(() => null);
  if (!response.ok || !isRecord(responseBody) || responseBody.resultType !== "SUCCESS") {
    const provider = providerError(responseBody);
    throw new TossCertApiError({ ...provider, httpStatus: response.status });
  }

  if (!isRecord(responseBody.success)) throw malformedResponse(response.status);
  return responseBody.success;
}

export async function requestIdentityVerification(
  args: { requestUrl: string; nonce: string; expireSeconds: number },
  dependencies: TossCertClientDependencies = {},
): Promise<TossCertIdentityRequest> {
  const success = await callApi(
    "request",
    { requestType: "USER_NONE", requestUrl: args.requestUrl, nonce: args.nonce, expireSeconds: args.expireSeconds },
    dependencies,
  );
  if (
    typeof success.txId !== "string" ||
    typeof success.authUrl !== "string" ||
    typeof success.requestedDt !== "string"
  ) {
    throw malformedResponse(200);
  }
  return { txId: success.txId, authUrl: success.authUrl, requestedDt: success.requestedDt };
}

export async function getIdentityVerificationStatus(
  txId: string,
  dependencies: TossCertClientDependencies = {},
): Promise<TossCertIdentityStatus> {
  const success = await callApi("status", { txId }, dependencies);
  if (typeof success.status !== "string") throw malformedResponse(200);
  return { status: success.status };
}

export async function getIdentityVerificationResult(
  txId: string,
  dependencies: TossCertClientDependencies = {},
): Promise<TossCertIdentityResult> {
  const session = (dependencies.createSession ?? createTossCertSession)();
  const success = await callApi("result", { txId, sessionKey: session.sessionKey }, dependencies);
  if (typeof success.status !== "string") throw malformedResponse(200);

  const completedDt = typeof success.completedDt === "string" ? success.completedDt : null;
  if (success.status !== "COMPLETED") return { status: success.status, completedDt, ageGroup: null };

  const personalData = isRecord(success.personalData) ? success.personalData : null;
  if (!personalData || typeof personalData.ageGroup !== "string") throw malformedResponse(200);
  const ageGroupValue = personalData.ageGroup;
  const ageGroup =
    ageGroupValue === "ADULT" || ageGroupValue === "MINOR"
      ? ageGroupValue
      : session.decrypt(ageGroupValue);
  if (ageGroup !== "ADULT" && ageGroup !== "MINOR") throw malformedResponse(200);
  return { status: success.status, completedDt, ageGroup };
}
