import "server-only";

type NeisSchoolRow = {
  ATPT_OFCDC_SC_CODE?: string;
  SD_SCHUL_CODE?: string;
  SCHUL_NM?: string;
  SCHUL_KND_SC_NM?: string;
  LCTN_SC_NM?: string;
  ORG_RDNMA?: string;
};

type NeisMealRow = {
  ATPT_OFCDC_SC_CODE?: string;
  SD_SCHUL_CODE?: string;
  SCHUL_NM?: string;
  MLSV_YMD?: string;
  DDISH_NM?: string;
};

function optionalEnv(...keys: string[]) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function cleanText(value: unknown, limit = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanDate(value: unknown) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 8);
}

type NeisResultRecord = { CODE?: unknown; MESSAGE?: unknown };

function extractNeisResult(payload: unknown, datasetKey: string): NeisResultRecord | null {
  const root = (payload || {}) as Record<string, unknown>;
  const bucket = root[datasetKey];
  if (Array.isArray(bucket)) {
    const resultNode = bucket.find((item) => (item as { RESULT?: unknown })?.RESULT) as
      | { RESULT?: NeisResultRecord }
      | undefined;
    return resultNode?.RESULT || null;
  }
  return (root.RESULT as NeisResultRecord) || null;
}

function extractNeisRows<T = unknown>(payload: unknown, datasetKey: string): T[] {
  const root = (payload || {}) as Record<string, unknown>;
  const bucket = root[datasetKey];
  if (!Array.isArray(bucket)) return [];
  const rowNode = bucket.find((item) => Array.isArray((item as { row?: unknown })?.row)) as
    | { row?: T[] }
    | undefined;
  return Array.isArray(rowNode?.row) ? (rowNode.row as T[]) : [];
}

async function fetchNeisDataset<T = unknown>(datasetKey: string, params: Record<string, string>) {
  const apiKey = optionalEnv("NEIS_OPENAPI_KEY", "NEIS_API_KEY");
  if (!apiKey) {
    throw new Error("neis_api_key_missing");
  }

  const baseUrl = optionalEnv("NEIS_OPENAPI_BASE_URL") || "https://open.neis.go.kr/hub";
  const query = new URLSearchParams({
    KEY: apiKey,
    Type: "json",
    pIndex: "1",
    pSize: "100",
  });

  for (const [key, value] of Object.entries(params || {})) {
    if (!value) continue;
    query.set(key, value);
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/${datasetKey}?${query.toString()}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error("neis_fetch_failed");
  }

  const result = extractNeisResult(payload, datasetKey);
  const code = cleanText(result?.CODE, 32);
  if (code && code !== "INFO-000" && code !== "INFO-200") {
    throw new Error(`neis_result_${code.toLowerCase()}`);
  }

  return extractNeisRows<T>(payload, datasetKey);
}

export async function searchNeisSchools(args: { search: string; schoolType?: string; limit?: number }) {
  const search = cleanText(args.search, 80);
  if (!search) return [];

  const rows = await fetchNeisDataset<NeisSchoolRow>("schoolInfo", { SCHUL_NM: search });
  const schoolType = cleanText(args.schoolType, 40);
  const limit = Math.max(1, Math.min(20, Number(args.limit || 10)));

  return rows
    .map((row) => ({
      officeCode: cleanText(row.ATPT_OFCDC_SC_CODE, 20),
      schoolCode: cleanText(row.SD_SCHUL_CODE, 20),
      schoolName: cleanText(row.SCHUL_NM, 120),
      schoolType: cleanText(row.SCHUL_KND_SC_NM, 40),
      region: cleanText(row.LCTN_SC_NM, 40),
      address: cleanText(row.ORG_RDNMA, 160),
    }))
    .filter((row) => row.officeCode && row.schoolCode && row.schoolName)
    .filter((row) => (!schoolType ? true : row.schoolType === schoolType))
    .slice(0, limit);
}

export async function getNeisMeal(args: { officeCode: string; schoolCode: string; date: string }) {
  const officeCode = cleanText(args.officeCode, 20);
  const schoolCode = cleanText(args.schoolCode, 20);
  const date = cleanDate(args.date);

  if (!officeCode || !schoolCode || !date) {
    throw new Error("invalid_meal_request");
  }

  const rows = await fetchNeisDataset<NeisMealRow>("mealServiceDietInfo", {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    MLSV_YMD: date,
  });
  const row = rows[0] || null;

  return {
    officeCode,
    schoolCode,
    schoolName: cleanText(row?.SCHUL_NM, 120),
    mealDate: cleanDate(row?.MLSV_YMD || date),
    mealMenuText: cleanText(row?.DDISH_NM, 4000),
  };
}
