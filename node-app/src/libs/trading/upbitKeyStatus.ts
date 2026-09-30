/**
 * @docHint
 * @purpose Private Trade Lab — 업비트 키 상태 실측 (api_keys 만료 + 출금 권한 프로브)
 * @process JWT 서명  GET /v1/api_keys  GET /v1/withdraws 프로브  공통 결과 조립
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §4.2 · §11-2. TL-105 getKeyStatus() 어댑터 메서드의 구현 로직.
 *
 * 업비트 API는 키 권한을 응답으로 주지 않으므로(공식 문서 /v1/api_keys = access_key·expire_at만),
 * 출금 권한은 **읽기 전용** 출금 목록 조회(GET /v1/withdraws)를 프로브로 호출해 판정한다.
 * - 200     → 출금 계열 접근 가능 = 출금 권한 보유(HR2 위반, invalid)
 * - 401/403 → out_of_scope = 출금 권한 없음
 * 주문·출금 실행 계열은 절대 호출하지 않는다(읽기 전용만).
 */

import { createUpbitAuthorizationHeader } from "libs/trading/upbitJwtSigner";
import {
  classifyWithdrawalProbe,
  latestKeyExpiry,
  parseUpbitApiKeysResponse,
  type UpbitApiKeyInfo,
  type WithdrawalPermissionProbe,
} from "libs/trading/tradingKeyStatus";

export type UpbitCredentials = { accessKey: string; secretKey: string };

export type UpbitKeyStatus = {
  accessKeys: UpbitApiKeyInfo[];
  /** 키 목록 중 가장 늦은 만료 시각(epoch ms). 비어 있거나 미확인이면 null */
  expiresAt: number | null;
  withdrawalProbe: WithdrawalPermissionProbe;
  fetchedAt: Date;
};

const UPBIT_API_BASE = "https://api.upbit.com";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function authedGet(path: string, credentials: UpbitCredentials, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(`${UPBIT_API_BASE}${path}`, {
    headers: {
      Authorization: createUpbitAuthorizationHeader({
        accessKey: credentials.accessKey,
        secretKey: credentials.secretKey,
      }),
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

/** GET /v1/api_keys — 키 목록과 각 만료일 */
export async function fetchUpbitApiKeys(
  credentials: UpbitCredentials,
  fetchImpl: FetchLike = fetch,
): Promise<UpbitApiKeyInfo[]> {
  const response = await authedGet("/v1/api_keys", credentials, fetchImpl);
  if (!response.ok) {
    throw new Error(`[upbitKeyStatus] GET /v1/api_keys 실패 — HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  return parseUpbitApiKeysResponse(body);
}

/**
 * GET /v1/withdraws — 읽기 전용 출금 권한 프로브.
 * 200이면 출금 권한 보유(HR2 위반 키). 401/403은 권한 부족. 그 외 unknown.
 */
export async function probeUpbitWithdrawalPermission(
  credentials: UpbitCredentials,
  fetchImpl: FetchLike = fetch,
): Promise<WithdrawalPermissionProbe> {
  let response: Response;
  try {
    response = await authedGet("/v1/withdraws", credentials, fetchImpl);
  } catch (error) {
    const name = error instanceof Error ? error.name : "UNKNOWN";
    if (name === "TimeoutError" || name === "AbortError") return "unknown";
    // 네트워크 오류도 확인 불가로 처리(fail-closed)
    return "unknown";
  }
  return classifyWithdrawalProbe(response.status);
}

/** TL-105 getKeyStatus() — 만료 + 출금 권한을 한 번에 조회한다 */
export async function getUpbitKeyStatus(
  credentials: UpbitCredentials,
  fetchImpl: FetchLike = fetch,
): Promise<UpbitKeyStatus> {
  const accessKeys = await fetchUpbitApiKeys(credentials, fetchImpl);
  const withdrawalProbe = await probeUpbitWithdrawalPermission(credentials, fetchImpl);
  return {
    accessKeys,
    expiresAt: latestKeyExpiry(accessKeys),
    withdrawalProbe,
    fetchedAt: new Date(),
  };
}
