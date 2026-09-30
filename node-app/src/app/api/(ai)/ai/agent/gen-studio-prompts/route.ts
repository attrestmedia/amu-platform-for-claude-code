import { NextRequest, NextResponse } from "next/server";
import { listGenStudioPromptCatalog, type GenStudioPromptCatalogType } from "libs/server-utils/api/genStudioPromptCatalog";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { logger } from "utils/log";
import {
  existsImagePromptKey,
  upsertImagePrompt,
  removeImagePrompt,
  removeImageTemplateKeyFromGroups,
  existsContentPromptKey,
  upsertContentPrompt,
  removeContentPrompt,
} from "libs/database/lab";
import { IMAGE_USAGE_TIP_MAX } from "consts/app";
import { normalizePromptAccessLevel } from "utils/app/promptAccess";
import { extractCodedError } from "utils/common";
import { rejectInvalidPromptTemplate } from "libs/server-utils/api/promptTemplateValidation";
import {
  hasLegacyImagePromptNegativeSection,
  normalizeImagePromptNegative,
  stripLegacyImagePromptNegativeSection,
} from "utils/lab";

export const runtime = "nodejs";

const AGENT_GEN_STUDIO_PROMPTS_ENDPOINT = "ai/agent/gen-studio-prompts";
const AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT = "ai/agent/gen-studio-prompts:write";
const AGENT_GEN_STUDIO_WRITE_LIMIT_PER_MINUTE = (() => {
  const raw = Number(process.env.AGENT_GEN_STUDIO_WRITE_REQUESTS_PER_MINUTE);
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : Math.max(6, AGENT_IMAGE_POLICY.maxListRequestsPerMinute);
})();

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

function toPromptType(raw: string | null): GenStudioPromptCatalogType | null {
  const value = toSafeString(raw).toLowerCase();
  if (!value) return "all";
  if (value === "all" || value === "image" || value === "content") return value;
  return null;
}

type WritePromptType = "image" | "content";

function toWritePromptType(raw: unknown): WritePromptType | null {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "image" || value === "content") return value;
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// 부분 패치 원칙: 호출자가 명시적으로 보내지 않은 필드는 undefined로 돌려보내
// upsertImagePrompt의 $setOnInsert 분기로 넘긴다(신규 생성 시에만 기본값 적용).
// defaultParams/sceneTemplate/inputPolicy를 항상 {}·""로 채워 반환하면, 이 필드들을
// 생략한 "가산 병합" 갱신 호출마다 기존 값이 빈 값으로 덮여쓰는 회귀가 재발한다
// (2026-08-20 natural-documentary-portrait 템플릿 갱신 중 inputPolicy.referenceImage,
// defaultParams.negative 유실로 실측 확인).
function sanitizeImagePromptPayload(body: Record<string, unknown>) {
  const rawTemplateText = String(body?.templateText || "").trim();
  const hasLegacyNegative = hasLegacyImagePromptNegativeSection(rawTemplateText);
  const defaultParamsProvided = isPlainObject(body?.defaultParams);
  const inputPolicyProvided = isPlainObject(body?.inputPolicy);
  const defaultParams = defaultParamsProvided ? { ...(body.defaultParams as Record<string, unknown>) } : {};
  const inputPolicy = inputPolicyProvided ? { ...(body.inputPolicy as Record<string, unknown>) } : {};
  const normalizedNegative = normalizeImagePromptNegative(
    typeof defaultParams?.negative === "string" ? defaultParams.negative : undefined,
  );
  if (hasLegacyNegative && !normalizedNegative) {
    return { ok: false as const, error: "legacy_negative_requires_manual_migration" };
  }
  // defaultParams는 (a) 호출자가 명시적으로 보냈거나 (b) 이번 호출에서 레거시 negative를
  // 새로 마이그레이션해야 할 때만 갱신 대상에 포함한다. 그 외에는 undefined로 두어
  // 기존 defaultParams(negative 등)를 건드리지 않는다.
  const nextDefaultParams =
    defaultParamsProvided || hasLegacyNegative ? { ...defaultParams, negative: normalizedNegative } : undefined;
  const sceneTemplateProvided = typeof body?.sceneTemplate === "string";
  return {
    ok: true as const,
    templateText: stripLegacyImagePromptNegativeSection(rawTemplateText),
    sceneTemplate: sceneTemplateProvided ? String(body.sceneTemplate).trim() : undefined,
    defaultParams: nextDefaultParams,
    inputPolicy: inputPolicyProvided ? inputPolicy : undefined,
  };
}

/**
 * @docHint
 * @purpose API 라우트(ai / agent / gen-studio-prompts) 기능 요청 처리
 * @process 요청 요청 파싱  agent 인증  Gen Studio 프롬프트 카탈로그 조회  JSON 응답 반환
 * @domain lab
 * @scope agent-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:prompts:read" });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_GEN_STUDIO_PROMPTS_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
      keyHash: auth.keyHash,
    });

    const searchParams = new URL(request.url).searchParams;
    const type = toPromptType(searchParams.get("type"));
    const enabled = toOptionalBool(searchParams.get("enabled"));

    if (type === null) {
      return NextResponse.json({ ok: false, error: "invalid_type", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    if (enabled === null) {
      return NextResponse.json({ ok: false, error: "invalid_enabled", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const result = await listGenStudioPromptCatalog({
      type,
      q: searchParams.get("q") || undefined,
      category: searchParams.get("category") || undefined,
      enabled,
      limit: toBoundedInt(searchParams.get("limit"), 50, 1, 100),
      includeTemplateText: toOptionalBool(searchParams.get("includeTemplateText")) === true,
    });

    logger.info("[agent-gen-studio-prompts] catalog fetched", {
      endpoint: AGENT_GEN_STUDIO_PROMPTS_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      type: result.type,
      q: result.q,
      category: result.category,
      enabled: result.enabled,
      includeTemplateText: result.includeTemplateText,
      count: result.items.length,
      countByType: result.countByType,
    });

    return NextResponse.json({
      ok: true,
      type: result.type,
      limit: result.limit,
      count: result.items.length,
      countByType: result.countByType,
      data: result.items,
    });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, {
      message: "Failed to fetch prompt catalog",
    });
    logger.error("[agent-gen-studio-prompts] failed", {
      endpoint: AGENT_GEN_STUDIO_PROMPTS_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

/**
 * @docHint
 * @purpose API 라우트(ai / agent / gen-studio-prompts) 쓰기 요청 처리
 * @process agent 인증  쓰기 rate-limit  type 분기(image|content)  payload 검증  upsert  JSON 응답
 * @domain lab
 * @scope agent-api
 */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:prompts:write" });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT,
      limitPerMinute: AGENT_GEN_STUDIO_WRITE_LIMIT_PER_MINUTE,
      keyHash: auth.keyHash,
    });

    const body = await request.json().catch(() => ({}));
    const promptType = toWritePromptType(body?.type);
    if (!promptType) {
      return NextResponse.json(
        { ok: false, error: "invalid_type", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const key = String(body?.key || "").trim();
    const title = String(body?.title || "").trim();
    const templateText = String(body?.templateText || "").trim();
    if (!key || !title || !templateText) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    // 부분 패치 원칙: 호출자가 실제로 보낸 필드만 값을 채우고, 생략된 필드는 undefined로
    // upsert 레이어에 전달한다. upsertImagePrompt/upsertContentPrompt가 undefined 필드를
    // $setOnInsert로 돌려 "신규 생성 시에만" 기본값을 적용하므로, 기존 문서를 갱신할 때
    // categories/tags/accessLevel/version/enabled 같은 생략 필드가 기본값으로 되돌아가
    // 기존 값을 지우는 사고를 막는다.
    const categories = Array.isArray(body?.categories)
      ? body.categories.map((c: unknown) => String(c).trim()).filter(Boolean)
      : undefined;
    const tags = Array.isArray(body?.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
      : undefined;
    const accessLevel = body?.accessLevel !== undefined ? normalizePromptAccessLevel(body.accessLevel) : undefined;
    const updatedBy = `agent:${auth.uid || ""}`;
    const version = body?.version !== undefined ? Number(body.version) : undefined;
    const enabled = typeof body?.enabled === "boolean" ? body.enabled : undefined;

    if (promptType === "image") {
      const usageTipProvided = typeof body?.usageTip === "string";
      const usageTip = usageTipProvided ? String(body.usageTip).trim() : undefined;
      if (usageTipProvided && Array.from(usageTip as string).length > IMAGE_USAGE_TIP_MAX) {
        return NextResponse.json(
          { ok: false, error: "usage_tip_too_long", errorCode: "INVALID_INPUT", max: IMAGE_USAGE_TIP_MAX },
          { status: 400 },
        );
      }
      const sanitized = sanitizeImagePromptPayload(body);
      if (!sanitized.ok) {
        return NextResponse.json(
          { ok: false, error: sanitized.error, errorCode: "INVALID_INPUT" },
          { status: 400 },
        );
      }
      const invalidTemplate = rejectInvalidPromptTemplate({
        templateText: sanitized.templateText,
        sceneTemplate: sanitized.sceneTemplate,
      });
      if (invalidTemplate) return invalidTemplate;
      if (body?.strictNew === true) {
        const dup = await existsImagePromptKey(key);
        if (dup) {
          return NextResponse.json(
            { ok: false, error: "duplicate_key", errorCode: "CONFLICT" },
            { status: 409 },
          );
        }
      }
      const saved = await upsertImagePrompt({
        key,
        title,
        categories,
        templateText: sanitized.templateText,
        sceneTemplate: sanitized.sceneTemplate,
        accessLevel,
        usageTip,
        defaultParams: sanitized.defaultParams,
        inputPolicy: sanitized.inputPolicy,
        tags,
        enabled,
        updatedBy,
        version,
      });
      logger.info("[agent-gen-studio-prompts] upsert image", {
        endpoint: AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT,
        uid: auth.uid,
        key,
      });
      return NextResponse.json({ ok: true, type: "image", data: saved });
    }

    /* type === "content" */
    const defaultParams = isPlainObject(body?.defaultParams) ? body.defaultParams : undefined;
    const invalidTemplate = rejectInvalidPromptTemplate({ templateText });
    if (invalidTemplate) return invalidTemplate;
    if (body?.strictNew === true) {
      const dup = await existsContentPromptKey(key);
      if (dup) {
        return NextResponse.json(
          { ok: false, error: "duplicate_key", errorCode: "CONFLICT" },
          { status: 409 },
        );
      }
    }
    const saved = await upsertContentPrompt({
      key,
      title,
      categories,
      templateText,
      accessLevel,
      ...(defaultParams !== undefined ? { defaultParams } : {}),
      tags,
      enabled,
      updatedBy,
      version,
    });
    logger.info("[agent-gen-studio-prompts] upsert content", {
      endpoint: AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT,
      uid: auth.uid,
      key,
    });
    return NextResponse.json({ ok: true, type: "content", data: saved });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "upsert_failed" });
    logger.error("[agent-gen-studio-prompts] upsert failed", {
      endpoint: AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

/**
 * @docHint
 * @purpose API 라우트(ai / agent / gen-studio-prompts) 삭제 요청 처리
 * @process agent 인증  쓰기 rate-limit  type 분기(image|content)  key 검증  DB 삭제  JSON 응답
 * @domain lab
 * @scope agent-api
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:prompts:write" });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT,
      limitPerMinute: AGENT_GEN_STUDIO_WRITE_LIMIT_PER_MINUTE,
      keyHash: auth.keyHash,
    });
    const body = await request.json().catch(() => ({}));
    const promptType = toWritePromptType(body?.type);
    const key = String(body?.key || "").trim();
    if (!promptType) {
      return NextResponse.json(
        { ok: false, error: "invalid_type", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "key_required", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }
    if (promptType === "image") {
      await removeImageTemplateKeyFromGroups(key);
      await removeImagePrompt(key);
    } else {
      await removeContentPrompt(key);
    }
    logger.info("[agent-gen-studio-prompts] delete", {
      endpoint: AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT,
      uid: auth.uid,
      key,
      type: promptType,
    });
    return NextResponse.json({ ok: true, type: promptType, key });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "delete_failed" });
    logger.error("[agent-gen-studio-prompts] delete failed", {
      endpoint: AGENT_GEN_STUDIO_PROMPTS_WRITE_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
