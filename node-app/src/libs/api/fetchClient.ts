import { DEFAULT_API_URL } from "consts/env/public";
import { globalLoadingManager } from "store/global/globalLoadingStore";
import { logger } from "utils/log";
import { toErrorLike, toErrorMessage } from "utils/common/typeUtils";
import { maskSensitiveLogValue } from "utils/log/tokenMasking";

type AxiosLikeErrorData = unknown;
type AxiosLikeError = Error & {
  response?: { status: number; data: AxiosLikeErrorData };
  status?: number;
  data?: AxiosLikeErrorData;
  request?: unknown;
  code?: string;
  errorCode?: string;
};

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain api-client
 * @scope global
 */

const TESTURL = process.env.NEXT_PUBLIC_API_URL;

type ApiParams = Record<string, unknown>;
export type LoadingMode = "none" | "local" | "global";

export type ApiRequestConfig = {
  params?: ApiParams;
  headers?: Record<string, string>;
  timeout?: number; // ms
  signal?: AbortSignal;
  credentials?: RequestCredentials; // 기본 include
  cache?: RequestCache;
  redirect?: RequestRedirect;
  responseType?: "auto" | "json" | "text" | "arrayBuffer"; // 기본 auto
  /** 전역 Preloader는 명시적으로 global을 지정한 요청만 표시한다. */
  loading?: LoadingMode;
};

// API 경계의 기본 제네릭은 호출자가 명시하지 않으면 `any`로 폴백한다.
// `unknown`으로 두면 다운스트림에서 매번 단언이 강제되어 호출 코드 전반에 파장이 큼.
// 호출 측에서 가능한 한 타입을 명시하여 사용하는 것이 권장된다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiResponse<T = any> = {
  data: T;
  status: number;
  ok: boolean;
  headers: Headers;
};

const DEFAULT_TIMEOUT = 30000;
let requestSequence = 0;

const createGlobalRequestId = () => {
  requestSequence += 1;
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
  return `fetch-client:${Date.now()}:${requestSequence}${randomId ? `:${randomId}` : ""}`;
};

// DEFAULT_API_URL + path 결합 (path가 절대 URL이면 그대로 사용)
const joinUrl = (base: string, path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const b = (base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
};

// 기존 query + params 병합
const buildUrlWithParams = (rawUrl: string, params?: ApiParams) => {
  if (!params) return rawUrl;

  const [base, qs] = rawUrl.split("?");
  const sp = new URLSearchParams(qs || "");

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        sp.append(k, String(item));
      }
      continue;
    }
    // 객체/배열이 아닌 값은 문자열로
    sp.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }

  const nextQs = sp.toString();
  return nextQs ? `${base}?${nextQs}` : base;
};

// json 안전 가드
async function readJsonSafe(res: Response): Promise<{ rawText: string; json: unknown | null }> {
  const txt = await res.text().catch(() => "");
  if (!txt) return { rawText: "", json: null };
  try {
    return { rawText: txt, json: JSON.parse(txt) };
  } catch {
    return { rawText: txt, json: null };
  }
}

const parseBody = async (res: Response, responseType: ApiRequestConfig["responseType"] = "auto") => {
  const rt = responseType ?? "auto";
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const isJsonHeader = ct.includes("application/json") || ct.includes("+json");

  // explicit
  if (rt === "arrayBuffer") {
    try {
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }

  if (rt === "text") {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }

  // json / auto (json-like): readJsonSafe로 "본문이 JSON이면 파싱" + "파싱 실패 시 rawText 폴백"
  if (rt === "json" || (rt === "auto" && isJsonHeader)) {
    const { rawText, json } = await readJsonSafe(res);
    if (json != null) return json;
    // JSON 헤더인데 파싱 실패/빈 응답이면 null로 (기존 res.json 실패 시 null과 유사)
    if (!rawText || !rawText.trim()) return null;
    return rawText;
  }

  // auto (non-json header): 본문이 JSON 문자열이면 파싱, 아니면 text 그대로
  const { rawText, json } = await readJsonSafe(res);
  return json != null ? json : rawText;
};

// axios 호환 형태의 에러 생성 후 throw
// - error.response.status / error.response.data
const throwAxiosLikeError = (args: {
  status?: number;
  data?: AxiosLikeErrorData;
  message: string;
  request?: unknown;
  code?: string; // axios 호환용 (ECONNABORTED, ERR_NETWORK 등)
}): never => {
  const err: AxiosLikeError = new Error(args.message);
  if (args.status !== undefined) {
    err.response = { status: args.status, data: args.data };
    err.status = args.status;
    err.data = args.data;
  }
  if (args.request) err.request = args.request;
  if (args.code) {
    err.code = args.code;
    err.errorCode = args.code;
  }
  throw err;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const request = async <T = any>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  config?: ApiRequestConfig,
): Promise<ApiResponse<T>> => {
  const url = buildUrlWithParams(joinUrl(DEFAULT_API_URL, path), config?.params);

  const timeoutMs = config?.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  let timeoutFired = false;

  logger.log("[fetchClient]", maskSensitiveLogValue({ DEFAULT_API_URL, url, timeoutMs, TESTURL }));

  // 외부 signal이 있으면 내부 controller와 연결
  if (config?.signal) {
    const sig = config.signal as AbortSignal & { reason?: unknown };
    if (sig.aborted) controller.abort(sig.reason);
    else sig.addEventListener("abort", () => controller.abort(sig.reason), { once: true });
  }

  const timer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          timeoutFired = true;
          controller.abort("timeout");
        }, timeoutMs)
      : null;

  const headers: Record<string, string> = {
    ...(config?.headers || {}),
  };

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const hasBody = body !== undefined;
  const globalRequestId = config?.loading === "global" ? createGlobalRequestId() : null;

  // JSON 요청일 때만 Content-Type 지정 (FormData는 브라우저가 boundary 포함해 자동 지정)
  if (!isFormData && hasBody) {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  // 혹시라도 FormData인데 Content-Type이 들어오면 제거 (boundary 깨짐 방지)
  if (isFormData) {
    if (headers["Content-Type"]) delete headers["Content-Type"];
    if (headers["content-type"]) delete headers["content-type"];
  }

  if (globalRequestId) globalLoadingManager.start(globalRequestId);

  try {
    const res = await fetch(url, {
      method,
      headers,
      credentials: config?.credentials ?? "include",
      signal: controller.signal,
      cache: config?.cache,
      redirect: config?.redirect,
      ...(hasBody
        ? {
            body: isFormData
              ? (body as BodyInit)
              : typeof body === "string"
                ? body
                : JSON.stringify(body),
          }
        : {}),
    });

    const data = (await parseBody(res, config?.responseType ?? "auto")) as T;

    if (!res.ok) {
      logger.error("API 응답 에러:", res.status, maskSensitiveLogValue(data));
      const dataObj = (data && typeof data === "object" ? (data as { message?: unknown; error?: unknown }) : null);
      const msg =
        (typeof dataObj?.message === "string" ? dataObj.message : "") ||
        (typeof dataObj?.error === "string" ? dataObj.error : "") ||
        (typeof data === "string" && data.trim()) ||
        `요청 실패 (HTTP ${res.status})`;
      return throwAxiosLikeError({ status: res.status, data, message: msg });
    }

    return { data, status: res.status, ok: true, headers: res.headers };
  } catch (e: unknown) {
    const err = toErrorLike(e);
    // axios-like 형태로 만들어진(HTTP 에러 포함) 에러면 그대로 던져서 status/data 보존
    if (err.response && typeof (err.response as { status?: unknown }).status === "number") throw e;

    const errName = (e as { name?: unknown })?.name;
    const errMessage = toErrorMessage(e);
    // timeout / 네트워크 오류
    const isTimeout = timeoutFired || errName === "AbortError" || errMessage.includes("timeout");
    if (isTimeout) {
      logger.error("API 요청 에러 (타임아웃):", maskSensitiveLogValue(url));
      return throwAxiosLikeError({
        message: "서버로부터 응답이 없습니다. 서버 상태 또는 네트워크 연결을 확인해주세요.",
        request: { url, method },
        code: "ECONNABORTED",
      });
    }
    logger.error("API 요청 에러:", maskSensitiveLogValue(errMessage || e));
    return throwAxiosLikeError({
      message: `요청 준비 중 오류: ${errMessage || "unknown"}`,
      request: { url, method },
      code: "ERR_NETWORK",
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (globalRequestId) globalLoadingManager.end(globalRequestId);
  }
};

/* eslint-disable @typescript-eslint/no-explicit-any */
// 외부 API 호출 래퍼는 호출자가 응답 타입을 지정하지 않을 수 있어 `any`를 기본값으로 둔다.
const fetchClient = {
  get: <T = any>(path: string, config?: ApiRequestConfig) => request<T>("GET", path, undefined, config),
  post: <T = any>(path: string, body?: unknown, config?: ApiRequestConfig) => request<T>("POST", path, body, config),
  put: <T = any>(path: string, body?: unknown, config?: ApiRequestConfig) => request<T>("PUT", path, body, config),
  patch: <T = any>(path: string, body?: unknown, config?: ApiRequestConfig) => request<T>("PATCH", path, body, config),
  delete: <T = any>(path: string, config?: ApiRequestConfig) => request<T>("DELETE", path, undefined, config),
  deleteWithBody: <T = any>(path: string, body?: unknown, config?: ApiRequestConfig) =>
    request<T>("DELETE", path, body, config),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export default fetchClient;
