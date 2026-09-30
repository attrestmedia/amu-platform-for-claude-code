import "server-only";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { DEFAULT_ANCHOR_KEYWORD } from "consts/marketing/keywordCluster";

/**
 * @docHint
 * @purpose 네이버 데이터랩 검색어트렌드 API 클라이언트 — 자격증명 패널(naver_datalab slot) 기반 연결 해석
 * @process credential 복호화 → 헤더 인증으로 datalab search 호출 → 결과 그룹 반환
 * @domain marketing
 * @scope server
 */

const DATALAB_SEARCH_URL = "https://openapi.naver.com/v1/datalab/search";

export type NaverDatalabConnection = {
  universeId: string;
  enabled: boolean;
  anchorKeyword: string;
  clientId: string;
  clientSecret: string;
};

export type NaverTimeUnit = "date" | "week" | "month";
export type DatalabKeywordGroup = { groupName: string; keywords: string[] };
export type DatalabSeriesPoint = { period: string; ratio: number };
export type DatalabGroupResult = { title: string; keywords: string[]; data: DatalabSeriesPoint[] };

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
}

/** naver_datalab 자격증명 슬롯에서 연결을 해석한다. 미설정은 null. */
export async function resolveNaverDatalabConnection(universeId: string): Promise<NaverDatalabConnection | null> {
  const credential = await getDecryptedCredential(universeId, "naver_datalab");
  if (!credential) return null;

  const clientId = String(credential.clientId || "").trim();
  const clientSecret = String(credential.clientSecret || "").trim();
  if (!clientId || !clientSecret) return null;

  const extras = credential.extras || {};
  return {
    universeId,
    enabled: toBool(extras.enabled),
    anchorKeyword: String(extras.anchorKeyword ?? "").trim() || DEFAULT_ANCHOR_KEYWORD,
    clientId,
    clientSecret,
  };
}

export function buildNaverApiHeaders(connection: Pick<NaverDatalabConnection, "clientId" | "clientSecret">) {
  return {
    "X-Naver-Client-Id": connection.clientId,
    "X-Naver-Client-Secret": connection.clientSecret,
  };
}

/**
 * 데이터랩 검색어트렌드 조회.
 * 결과 ratio는 요청 범위 내 최대치=100의 상대값이므로, 요청 간 비교에는
 * 앵커 키워드 재정규화(naverTrendAnalysis.summarizeAgainstAnchor)를 사용해야 한다.
 */
export async function runDatalabSearchTrend(
  connection: NaverDatalabConnection,
  request: {
    startDate: string; // YYYY-MM-DD
    endDate: string;
    timeUnit: NaverTimeUnit;
    keywordGroups: DatalabKeywordGroup[]; // 최대 5그룹 (앵커 포함)
    device?: "pc" | "mo";
    gender?: "m" | "f";
    ages?: string[];
  },
): Promise<DatalabGroupResult[]> {
  if (request.keywordGroups.length < 1 || request.keywordGroups.length > 5) {
    throw new Error("keywordGroups must contain 1~5 groups");
  }

  const response = await fetch(DATALAB_SEARCH_URL, {
    method: "POST",
    headers: {
      ...buildNaverApiHeaders(connection),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`naver_datalab_error_${response.status}: ${text.slice(0, 300)}`);
  }

  const json = (await response.json()) as { results?: DatalabGroupResult[] };
  return json.results || [];
}
