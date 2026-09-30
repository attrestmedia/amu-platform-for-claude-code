import { NextRequest, NextResponse } from "next/server";
import { getPersonaByKey, upsertPersona, removePersona, removePersonaByScope } from "libs/database/universe";
import {
  normalizeSystemPersonaLifecycleMetadata,
  normalizeSystemPersonaTutorsPolicyDefaults,
  normalizeSystemPersonaUsageType,
  SYSTEM_PERSONA_PRESET_KIND_VALUES,
  type SystemPersonaServiceType,
} from "types/ai";
import { normalizeKey } from "utils/normalize";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAuthUser } from "libs/server-utils/auth/authUtils";
import type { NextRouteContext } from "libs/server-utils/api/_helpers";
import { toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / system-personas / [key]) 기능 요청 처리
 * @process GET 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain system-personas
 * @scope global
 */

export const runtime = "nodejs";

const parseScopeValue = (value: string | null) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
};

// 단건 GET은 공개 (대화에 필요)
export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const key = normalizeKey(decodeURIComponent(params.key));
  const doc = await getPersonaByKey(key);
  if (!doc) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const auth = await getAuthUser(req);
  const adminPromptAccess = Boolean(auth.verified && isAdmin(auth.user));
  const record = toUnknownRecord(doc);
  const lifecycle = normalizeSystemPersonaLifecycleMetadata(record);
  return NextResponse.json({
    ok: true,
    data: {
      key: record.key,
      title: record.title,
      category: record.category ?? "core",
      summary: record.summary ?? "",
      ...(adminPromptAccess ? { prompt: record.prompt ?? "" } : {}),
      forUniverses: normalizeSystemPersonaUsageType(
        typeof record.forUniverses === "string" ? record.forUniverses : null,
      ),
      tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(record.tutorsPolicyDefaults),
      enabled: record.enabled !== false,
      universeId: record.universeId ?? null,
      personaPid: record.personaPid ?? null,
      ...lifecycle,
      ...(adminPromptAccess ? { updatedBy: record.updatedBy ?? "" } : {}),
    },
  });
}

function isAdmin(u: unknown) {
  const record = toUnknownRecord(u);
  return !!(record.isAdministrator || (Array.isArray(record.roles) && record.roles.includes("administrator")));
}

function resolveKeyFromContext(ctx: NextRouteContext) {
  const params = toUnknownRecord(ctx?.params);
  return normalizeKey(decodeURIComponent(String(params.key || "")));
}

function resolveScopeValue(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function validateSystemPersonaUpdatePayload(data: UnknownRecord) {
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  const prompt = typeof data?.prompt === "string" ? data.prompt.trim() : "";
  if (!title || title.length > 160 || !prompt || prompt.length > 50_000) {
    return { valid: false, error: "invalid_payload" };
  }
  if (data.lifecycle !== undefined && !["draft", "review", "published", "deprecated", "archived"].includes(String(data.lifecycle))) {
    return { valid: false, error: "invalid_lifecycle" };
  }
  if (data.presetKind !== undefined && !SYSTEM_PERSONA_PRESET_KIND_VALUES.includes(String(data.presetKind) as (typeof SYSTEM_PERSONA_PRESET_KIND_VALUES)[number])) {
    return { valid: false, error: "invalid_preset_kind" };
  }
  if (data.selectableServices !== undefined && (!Array.isArray(data.selectableServices) || data.selectableServices.some((value) => !["game", "tutors"].includes(String(value))))) {
    return { valid: false, error: "invalid_selectable_services" };
  }
  if (data.revision !== undefined && (!Number.isInteger(data.revision) || Number(data.revision) < 1)) {
    return { valid: false, error: "invalid_revision" };
  }
  return { valid: true };
}

export const DELETE = withAuth(
  async (_data: unknown, user: unknown, req: NextRequest, ctx: NextRouteContext) => {
    if (!isAdmin(user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const key = resolveKeyFromContext(ctx);
    const { searchParams } = new URL(req.url);
    const isExactScope = searchParams.get("scopeMode") === "exact";
    const universeId = parseScopeValue(searchParams.get("universeId"));
    const personaPid = parseScopeValue(searchParams.get("personaPid"));

    if (isExactScope) {
      await removePersonaByScope(key, { universeId, personaPid });
    } else {
      await removePersona(key);
    }
    return NextResponse.json({ ok: true });
  },
  undefined,
  "universe/system-personas/delete",
);

export const PUT = withAuth<UnknownRecord>(
  async (data, user, _req: NextRequest, ctx) => {
    if (!isAdmin(user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const key = resolveKeyFromContext(ctx);
    if (!data?.title || !data?.prompt) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const saved = await upsertPersona({
      key,
      title: String(data.title),
      prompt: String(data.prompt),
      category: typeof data.category === "string" ? data.category : undefined,
      summary: typeof data.summary === "string" ? data.summary : undefined,
      enabled: data.enabled !== false,
      forUniverses: normalizeSystemPersonaUsageType(typeof data.forUniverses === "string" ? data.forUniverses : null),
      tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(data.tutorsPolicyDefaults),
      presetKind: typeof data.presetKind === "string" ? data.presetKind : undefined,
      lifecycle: typeof data.lifecycle === "string" ? data.lifecycle : undefined,
      selectableServices: Array.isArray(data.selectableServices)
        ? data.selectableServices.filter((value): value is SystemPersonaServiceType => value === "game" || value === "tutors")
        : undefined,
      runtimeResolvable: typeof data.runtimeResolvable === "boolean" ? data.runtimeResolvable : undefined,
      replacementKey: typeof data.replacementKey === "string" ? data.replacementKey : undefined,
      revision: typeof data.revision === "number" ? data.revision : undefined,
      safetyProfile: typeof data.safetyProfile === "string" ? data.safetyProfile : undefined,
      universeId: resolveScopeValue(data.universeId),
      personaPid: resolveScopeValue(data.personaPid),
      version: typeof data.version === "number" ? data.version : undefined,
      updatedBy: user?.userEmail || "",
    });
    return NextResponse.json({ ok: true, data: saved });
  },
  validateSystemPersonaUpdatePayload,
  "universe/system-personas/put",
);
