import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * @docHint
 * @purpose Private Trade Lab — 업비트 Open API JWT 서명
 * @process 쿼리 직렬화  query_hash(SHA512)  payload 조립  HS256 서명
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md §4.1
 *
 * **서명 로직은 이 모듈 한 곳에만 둔다.** 공통 HTTP 클라이언트에 흩어지면
 * nonce 재사용이나 query_hash 불일치가 호출 지점마다 다르게 발생한다.
 *
 * 토스와 달리 토큰 캐시도 분산 락도 필요 없다 — 요청마다 독립적으로 서명한다.
 */

export type UpbitQueryValue = string | number | boolean | readonly string[] | readonly number[] | null | undefined;
export type UpbitQueryParams = Record<string, UpbitQueryValue>;

export type UpbitJwtInput = {
  accessKey: string;
  secretKey: string;
  /** 쿼리스트링 또는 본문 파라미터. 없으면 query_hash를 넣지 않는다 */
  query?: UpbitQueryParams;
  /** 테스트용 고정 nonce. 운영 경로에서는 넘기지 않는다 */
  nonce?: string;
};

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 업비트가 서버에서 다시 계산하는 것과 **같은 문자열**을 만들어야 한다.
 *
 * 배열 파라미터(`uuids[]`, `identifiers[]`)의 인코딩이 가장 흔한 서명 실패 지점이다.
 * 업비트는 `key[]=a&key[]=b` 형태를 기대하며, **키를 정렬하지 않는다** —
 * 실제로 전송한 쿼리스트링을 그대로 해시해야 하므로 삽입 순서를 유지한다.
 */
export function buildUpbitQueryString(query: UpbitQueryParams): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined) continue;
        parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(item))}`);
      }
      continue;
    }

    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return parts.join("&");
}

export function hashUpbitQuery(queryString: string): string {
  return createHash("sha512").update(queryString, "utf8").digest("hex");
}

/** 비어 있지 않은 쿼리가 있을 때만 query_hash를 포함한다 */
export function buildUpbitJwtPayload(input: UpbitJwtInput): Record<string, string> {
  const payload: Record<string, string> = {
    access_key: input.accessKey,
    nonce: input.nonce ?? randomUUID(),
  };

  const queryString = input.query ? buildUpbitQueryString(input.query) : "";
  if (queryString) {
    payload.query_hash = hashUpbitQuery(queryString);
    payload.query_hash_alg = "SHA512";
  }

  return payload;
}

export function createUpbitJwt(input: UpbitJwtInput): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(buildUpbitJwtPayload(input)));
  const signingInput = `${header}.${payload}`;
  const signature = base64Url(createHmac("sha256", input.secretKey).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

export function createUpbitAuthorizationHeader(input: UpbitJwtInput): string {
  return `Bearer ${createUpbitJwt(input)}`;
}
