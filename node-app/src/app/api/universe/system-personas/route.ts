import { NextRequest, NextResponse } from "next/server";
import { listPersonas, listSelectablePersonas, upsertPersona } from "libs/database/universe";
import {
  normalizeSystemPersonaLifecycleMetadata,
  SYSTEM_PERSONA_PRESET_KIND_VALUES,
  normalizeSystemPersonaTutorsPolicyDefaults,
  normalizeSystemPersonaUsageType,
  type SystemPersonaServiceType,
} from "types/ai";
import { normalizeKey } from "utils/normalize";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAuthUser } from "libs/server-utils/auth/authUtils";
import { toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / system-personas) 기능 요청 처리
 * @process GET 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain system-personas
 * @scope global
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || undefined;
  const category = searchParams.get("category") || undefined;
  const enabled = searchParams.get("enabled");
  const enabledBool = enabled === null ? undefined : enabled === "true";
  const includePrompt = searchParams.get("includePrompt") === "true";
  const auth = includePrompt ? await getAuthUser(req) : null;
  const adminPromptAccess = Boolean(auth?.verified && isAdmin(auth.user));
  if (includePrompt && !adminPromptAccess) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const universeId = searchParams.get("universeId") || undefined;
  const personaPid = searchParams.get("personaPid") || undefined;
  const forUniversesRaw = searchParams.get("forUniverses");
  const forUniverses = forUniversesRaw ? normalizeSystemPersonaUsageType(forUniversesRaw) : undefined;
  const serviceRaw = searchParams.get("service");
  const service: SystemPersonaServiceType | undefined = serviceRaw === "game" || serviceRaw === "tutors" ? serviceRaw : undefined;
  const selectableOnly = searchParams.get("selectableOnly") === "true";

  const rows = selectableOnly && service
    ? await listSelectablePersonas({ service, q, category, enabled: enabledBool, universeId, personaPid })
    : await listPersonas({ q, category, enabled: enabledBool, universeId, personaPid, forUniverses });

  const data = (rows || []).map((entry) => {
    const r = toUnknownRecord(entry);
    const lifecycle = normalizeSystemPersonaLifecycleMetadata(r);
    return {
      key: r.key,
      title: r.title,
      category: r.category ?? "core",
      summary: r.summary ?? "",
      prompt: adminPromptAccess ? r.prompt ?? "" : "",
      forUniverses: normalizeSystemPersonaUsageType(typeof r.forUniverses === "string" ? r.forUniverses : null),
      tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(r.tutorsPolicyDefaults),
      enabled: !!r.enabled,
      universeId: r.universeId ?? null,
      personaPid: r.personaPid ?? null,
      ...lifecycle,
      updatedAt: r.updatedAt,
      ...(adminPromptAccess ? { updatedBy: r.updatedBy ?? "" } : {}),
    };
  });

  return NextResponse.json({ ok: true, data });
}

function isAdmin(u: unknown) {
  const record = toUnknownRecord(u);
  return !!(record.isAdministrator || (Array.isArray(record.roles) && record.roles.includes("administrator")));
}

function validateSystemPersonaPayload(data: UnknownRecord) {
  const key = typeof data?.key === "string" ? data.key.trim() : "";
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  const prompt = typeof data?.prompt === "string" ? data.prompt.trim() : "";
  if (!key || key.length > 160 || !title || title.length > 160 || !prompt || prompt.length > 50_000) {
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

export const POST = withAuth<UnknownRecord>(
  async (body, user) => {
    if (!isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    if (!body?.key || !body?.title || !body?.prompt) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const key = normalizeKey(String(body.key));
    if (!key) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }

    // 인증된 사용자 이메일 추출
    const updatedBy = user?.userEmail || user?.userEmailLower || "";

    // scope 처리: 빈 문자열은 null로 저장해서 global로 취급
    const universeId: string | null =
      typeof body.universeId === "string" && body.universeId.trim() ? body.universeId.trim() : null;
    const personaPid: string | null =
      typeof body.personaPid === "string" && body.personaPid.trim() ? body.personaPid.trim() : null;

    const saved = await upsertPersona({
      key,
      title: String(body.title).trim(),
      category: typeof body.category === "string" ? body.category : "core",
      summary: typeof body.summary === "string" ? body.summary : "",
      prompt: typeof body.prompt === "string" ? body.prompt : "",
      forUniverses: normalizeSystemPersonaUsageType(typeof body.forUniverses === "string" ? body.forUniverses : null),
      tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(body.tutorsPolicyDefaults),
      presetKind: typeof body.presetKind === "string" ? body.presetKind : undefined,
      lifecycle: typeof body.lifecycle === "string" ? body.lifecycle : undefined,
      selectableServices: Array.isArray(body.selectableServices)
        ? body.selectableServices.filter((value): value is SystemPersonaServiceType => value === "game" || value === "tutors")
        : undefined,
      runtimeResolvable: typeof body.runtimeResolvable === "boolean" ? body.runtimeResolvable : undefined,
      replacementKey: typeof body.replacementKey === "string" ? body.replacementKey : undefined,
      revision: typeof body.revision === "number" ? body.revision : undefined,
      safetyProfile: typeof body.safetyProfile === "string" ? body.safetyProfile : undefined,
      enabled: body.enabled !== false,
      updatedBy,
      universeId,
      personaPid,
    });

    return NextResponse.json({ ok: true, data: saved });
  },
  validateSystemPersonaPayload,
  "universe/system-personas",
);
