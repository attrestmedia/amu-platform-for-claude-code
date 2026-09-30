import { NextRequest, NextResponse } from "next/server";
import { listGenStudioTemplateGroups } from "libs/database/lab";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";
import { logger } from "utils/log";
import type { GenStudioTemplateGroupPromptType } from "types/app";
import { mutateGenStudioTemplateGroup } from "libs/server-utils/lab/genStudioTemplateGroupMutationService";
import type { UnknownRecord } from "utils/common";

export const runtime = "nodejs";

const AGENT_GEN_STUDIO_TEMPLATE_GROUPS_ENDPOINT = "ai/agent/gen-studio-template-groups";
const AGENT_GEN_STUDIO_TEMPLATE_GROUPS_WRITE_ENDPOINT = "ai/agent/gen-studio-template-groups:write";
const AGENT_GEN_STUDIO_GROUP_WRITE_LIMIT_PER_MINUTE = (() => {
  const raw = Number(process.env.AGENT_GEN_STUDIO_WRITE_REQUESTS_PER_MINUTE);
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : Math.max(6, AGENT_IMAGE_POLICY.maxListRequestsPerMinute);
})();
type TemplateGroupCatalogType = "all" | GenStudioTemplateGroupPromptType;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toBoundedInt(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toOptionalBool(raw: string | null) {
  const value = toSafeString(raw).toLowerCase();
  if (!value) return undefined;
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return null;
}

function toGroupType(raw: string | null): TemplateGroupCatalogType | null {
  const value = toSafeString(raw).toLowerCase();
  if (!value) return "all";
  if (value === "all" || value === "image" || value === "content") return value;
  return null;
}

/**
 * @docHint
 * @purpose Gen Studio 운영 그룹 문서의 원본 멤버십·추천 등록 상태를 agent/MCP에 제공
 * @process agent 인증 -> rate-limit -> 그룹 원장 조회 -> type/q/service/enabled 필터 -> 원본 키 배열 반환
 * @domain lab
 * @scope agent-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:template-groups:read" });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_GEN_STUDIO_TEMPLATE_GROUPS_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
      keyHash: auth.keyHash,
    });

    const searchParams = new URL(request.url).searchParams;
    const type = toGroupType(searchParams.get("type"));
    const enabled = toOptionalBool(searchParams.get("enabled"));
    if (type === null) {
      return NextResponse.json(
        { ok: false, error: "invalid_type", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }
    if (enabled === null) {
      return NextResponse.json(
        { ok: false, error: "invalid_enabled", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const q = toSafeString(searchParams.get("q")).toLowerCase();
    const serviceKey = toSafeString(searchParams.get("serviceKey"));
    const limit = toBoundedInt(searchParams.get("limit"), 50, 1, 100);
    const groups = await listGenStudioTemplateGroups({
      enabled,
      serviceKey: serviceKey || undefined,
    });
    const matchedGroups = groups.filter((group) => {
      if (type !== "all" && group.promptType !== type) return false;
      if (!q) return true;
      const searchable = [
        group.key,
        group.title,
        group.description,
        ...group.serviceKeys,
        ...group.templateKeys,
        ...group.recommendedTemplateKeys,
      ]
        .join("\n")
        .toLowerCase();
      return searchable.includes(q);
    });
    const data = matchedGroups.slice(0, limit);
    const countByType = matchedGroups.reduce(
      (counts, group) => {
        counts[group.promptType] += 1;
        return counts;
      },
      { image: 0, content: 0, audio: 0 },
    );

    logger.info("[agent-gen-studio-template-groups] catalog fetched", {
      endpoint: AGENT_GEN_STUDIO_TEMPLATE_GROUPS_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      type,
      q,
      serviceKey,
      enabled,
      count: matchedGroups.length,
      returned: data.length,
      countByType,
    });

    return NextResponse.json({
      ok: true,
      type,
      q,
      serviceKey,
      enabled,
      limit,
      count: matchedGroups.length,
      returned: data.length,
      countByType,
      data,
    });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Failed to fetch template groups",
    });
    logger.error("[agent-gen-studio-template-groups] failed", {
      endpoint: AGENT_GEN_STUDIO_TEMPLATE_GROUPS_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

/**
 * @docHint
 * @purpose Agent/MCP가 Gen Studio 이미지·콘텐츠 템플릿 그룹을 생성·편집
 * @process agent write scope 인증 -> rate-limit -> 공용 mutation 검증 -> 그룹 원장 저장 -> 결과 반환
 * @domain lab
 * @scope agent-api
 */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:template-groups:write" });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_GEN_STUDIO_TEMPLATE_GROUPS_WRITE_ENDPOINT,
      limitPerMinute: AGENT_GEN_STUDIO_GROUP_WRITE_LIMIT_PER_MINUTE,
      keyHash: auth.keyHash,
    });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const result = await mutateGenStudioTemplateGroup(body, `agent:${auth.uid}`);
    const errorCode = result.ok
      ? undefined
      : result.status === 409
        ? "CONFLICT"
        : result.status === 404
          ? "NOT_FOUND"
          : "INVALID_INPUT";

    logger.info("[agent-gen-studio-template-groups] mutation completed", {
      endpoint: AGENT_GEN_STUDIO_TEMPLATE_GROUPS_WRITE_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      action: toSafeString(body.action),
      groupKey: toSafeString(body.key),
      reason: toSafeString(body.reason).slice(0, 200),
      ok: result.ok,
      status: result.status,
      error: result.ok ? "" : result.error,
    });

    const { status, ...payload } = result;
    return NextResponse.json(
      result.ok ? payload : { ...payload, errorCode },
      { status },
    );
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Failed to mutate template group",
    });
    logger.error("[agent-gen-studio-template-groups] mutation failed", {
      endpoint: AGENT_GEN_STUDIO_TEMPLATE_GROUPS_WRITE_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
