import { invalidateSystemPersonaClientCache } from "utils/ai";
import type {
  SystemPersonaLifecycleType,
  SystemPersonaPresetKindType,
  SystemPersonaSafetyProfileType,
  SystemPersonaServiceType,
  SystemPersonaTutorsPolicyDefaultsType,
  SystemPersonaUsageType,
} from "types/ai";
import fetchClient from "libs/api/fetchClient";
import { getResponseStatus, type UnknownRecord } from "utils/common/typeUtils";

type SystemPersonaEnvelope<T> = { ok?: boolean; data?: T; error?: string };
export type SystemPersonaDoc = {
  key: string;
  title: string;
  category?: string;
  summary?: string;
  prompt?: string;
  enabled: boolean;
  forUniverses?: SystemPersonaUsageType;
  tutorsPolicyDefaults?: SystemPersonaTutorsPolicyDefaultsType;
  universeId?: string | null;
  personaPid?: string | null;
  presetKind?: SystemPersonaPresetKindType;
  lifecycle?: SystemPersonaLifecycleType;
  selectableServices?: SystemPersonaServiceType[];
  runtimeResolvable?: boolean;
  replacementKey?: string;
  revision?: number;
  safetyProfile?: SystemPersonaSafetyProfileType;
} & UnknownRecord;

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/universe/system-personas) 호출 구성  응답/에러 정리 반환
 * @domain universe
 * @scope client
 */

const BASE_SYSTEM_PERSONA_API = "/universe/system-personas";

export interface ListSystemPersonaParams {
  q?: string;
  category?: string;
  enabled?: boolean;
  universeId?: string;
  personaPid?: string;
  forUniverses?: SystemPersonaUsageType; // 필요 시 필터용
  service?: SystemPersonaServiceType;
  selectableOnly?: boolean;
  includePrompt?: boolean;
}

export interface SystemPersonaPayload {
  key: string;
  title: string;
  category?: string;
  summary?: string;
  prompt: string;
  forUniverses?: SystemPersonaUsageType;
  tutorsPolicyDefaults?: SystemPersonaTutorsPolicyDefaultsType;
  enabled?: boolean;
  universeId?: string | null;
  personaPid?: string | null;
  presetKind?: SystemPersonaPresetKindType;
  lifecycle?: SystemPersonaLifecycleType;
  selectableServices?: SystemPersonaServiceType[];
  runtimeResolvable?: boolean;
  replacementKey?: string;
  revision?: number;
  safetyProfile?: SystemPersonaSafetyProfileType;
}

export interface SystemPersonaScope {
  universeId?: string | null;
  personaPid?: string | null;
}

const buildScopeParams = (scope?: SystemPersonaScope) => ({
  ...(scope?.universeId ? { universeId: scope.universeId } : {}),
  ...(scope?.personaPid ? { personaPid: scope.personaPid } : {}),
});

export async function listSystemPersonas(params?: ListSystemPersonaParams) {
  const out = await fetchClient.get<SystemPersonaEnvelope<SystemPersonaDoc[]>>(BASE_SYSTEM_PERSONA_API, {
    params: {
      ...(params?.q ? { q: params.q } : {}),
      ...(params?.category ? { category: params.category } : {}),
      ...(typeof params?.enabled === "boolean" ? { enabled: params.enabled } : {}),
      ...buildScopeParams(params),
      ...(params?.forUniverses && params.forUniverses !== "all" ? { forUniverses: params.forUniverses } : {}),
      ...(params?.service ? { service: params.service } : {}),
      ...(params?.selectableOnly ? { selectableOnly: true } : {}),
      ...(params?.includePrompt ? { includePrompt: true } : {}),
    },
    responseType: "auto",
  });
  return out.data?.data || [];
}

export async function getSystemPersona(key: string) {
  try {
    const out = await fetchClient.get<SystemPersonaEnvelope<SystemPersonaDoc>>(
      `${BASE_SYSTEM_PERSONA_API}/${encodeURIComponent(key)}`,
      { responseType: "auto" },
    );
    return out.data?.data;
  } catch (e: unknown) {
    if (getResponseStatus(e) === 404) return null;
    throw new Error("fetch_failed");
  }
}

export async function getSystemPersonaPrompt(key: string): Promise<string> {
  const doc = await getSystemPersona(key);
  return (doc?.prompt || "").trim();
}

export async function upsertSystemPersona(payload: SystemPersonaPayload): Promise<SystemPersonaDoc> {
  const out = await fetchClient.post<SystemPersonaEnvelope<SystemPersonaDoc>>(
    BASE_SYSTEM_PERSONA_API,
    payload,
    { responseType: "auto" },
  );
  const json = out.data;
  if (!json?.ok || !json.data) throw new Error(json?.error || "save_failed");

  // 어드민 저장 시 클라이언트 캐시 무효화
  invalidateSystemPersonaClientCache();
  return json.data;
}

export async function deleteSystemPersona(key: string, scope?: SystemPersonaScope) {
  await fetchClient.delete(`${BASE_SYSTEM_PERSONA_API}/${encodeURIComponent(key)}`, {
    params: {
      ...buildScopeParams(scope),
      ...(scope ? { scopeMode: "exact" } : {}),
    },
  });

  // 어드민 삭제 시 클라이언트 캐시 무효화
  invalidateSystemPersonaClientCache();
  return true;
}
