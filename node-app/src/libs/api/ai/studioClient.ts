import fetchClient from "libs/api/fetchClient";
import { parseJsonSafe } from "utils/data";
import { toErrorLike, toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain ai
 * @scope client
 */

export type StudioKind = "basic-image" | "template-image" | "template-content" | "basic-content";

type StudioOk<T> = { ok: true; data: T };
type StudioErr = { ok: false; error: string; errorCode?: string };

function resolveEndpoint(kind: StudioKind, universeId?: string) {
  const ns = universeId ? "commerce" : "ai";
  return `${ns}/generate/${kind}`;
}

export async function studioRequest<T>(args: {
  kind: StudioKind;
  body: UnknownRecord;
  universeId?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<StudioOk<T> | StudioErr> {
  // commerce 계열은 서버가 body.universeId를 요구, 클라 강제 주입
  const body = args.universeId ? { ...(args.body || {}), universeId: args.universeId } : args.body || {};

  // generate prefix
  const endpoint = resolveEndpoint(args.kind, args.universeId);
  const path = `/${endpoint}`;

  let status = 0;
  let httpOk = false;
  let rawText = "";
  let data: UnknownRecord = {};

  try {
    const out = await fetchClient.post<string>(path, body, {
      headers: { ...(args.headers || {}) },
      signal: args.signal,
      timeout: args.timeoutMs,
      responseType: "text",
    });
    status = out.status;
    httpOk = true;
    rawText = typeof out.data === "string" ? out.data : "";
    data = (parseJsonSafe(rawText) as UnknownRecord) || {};
  } catch (e: unknown) {
    const err = toErrorLike(e);
    const response = toUnknownRecord(err.response);
    status = typeof response.status === "number" ? response.status : 0;
    httpOk = false;
    const respData = response.data as unknown;
    if (typeof respData === "string") {
      rawText = respData;
      data = (parseJsonSafe(rawText) as UnknownRecord) || {};
    } else if (respData && typeof respData === "object") {
      data = respData as UnknownRecord;
      rawText = "";
    } else {
      rawText = toErrorMessage(e);
      data = (parseJsonSafe(rawText) as UnknownRecord) || {};
    }
  }

  if (!httpOk) {
    return {
      ok: false,
      error: (data?.error as string) || rawText || `HTTP_${status}`,
      errorCode: data?.errorCode as string | undefined,
    };
  }
  if (!data?.ok) {
    return { ok: false, error: (data?.error as string) || "API_ERROR", errorCode: data?.errorCode as string | undefined };
  }
  return { ok: true, data: data.data as T };
}

export async function studioRequestOrThrow<T>(args: Parameters<typeof studioRequest<T>>[0]): Promise<T> {
  const out = await studioRequest<T>(args);
  if (!out.ok) {
    const err = new Error(out.error || "API_ERROR") as Error & { errorCode?: string };
    err.errorCode = out.errorCode;
    throw err;
  }
  return out.data;
}
