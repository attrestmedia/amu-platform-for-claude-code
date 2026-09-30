import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { listStudioContentJobNotifications } from "libs/database/lab";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import {
  enqueueStudioContentJob,
  type StudioContentJobKindType,
} from "libs/server-utils/lab/studioContentJobQueue";
import type { ContentBasicBody, ContentCustomBody } from "libs/server-utils/api/contentBasicHandler";
import type { IUpdateUserData } from "types/user";
import { toUnknownRecord } from "utils/common";
import { resolveStudioGenerationSource } from "libs/server-utils/lab/studioGenerationSource";
import { getMagazineEmbedSession } from "libs/server-utils/magazine/magazineEmbedSession";

/**
 * @docHint
 * @purpose Gen Studio 콘텐츠 생성 Job 생성 및 알림 목록 조회
 * @process 요청 파싱  인증 사용자 확인  Job enqueue 또는 Job/Asset 목록 조회  JSON 응답 반환
 * @domain ai-content
 * @scope lab-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function resolveUid(user: AuthenticatedUserType) {
  const u = toUnknownRecord(user);
  return String(u.uid || u.ID || u.id || "").trim();
}

function parseSince(raw: string | null) {
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeKind(raw: unknown): StudioContentJobKindType | "" {
  const value = String(raw || "").trim();
  return value === "template-content" || value === "basic-content" ? value : "";
}

function validatePostBody(data: unknown) {
  const body = toUnknownRecord(data);
  const kind = normalizeKind(body.kind);
  const payload = toUnknownRecord(body.payload);
  if (!kind) return { valid: false, error: "kind_invalid" };
  if (!Object.keys(payload).length) return { valid: false, error: "payload_required" };
  if (kind === "template-content" && !String(payload.templateKey || "").trim()) {
    return { valid: false, error: "templateKey_required" };
  }
  if (kind === "basic-content" && !String(payload.prompt || "").trim()) {
    return { valid: false, error: "prompt_required" };
  }

  return { valid: true };
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = resolveUid(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const jobIds = String(sp.get("jobIds") || "")
    .split(",")
    .map((jobId) => jobId.trim())
    .filter(Boolean)
    .slice(0, 20);
  const jobs = await listStudioContentJobNotifications({
    uid,
    limit: Math.max(1, Math.min(20, Number(sp.get("limit") || 8))),
    unreadOnly: sp.get("unread") === "1" || sp.get("unread") === "true",
    includeRunning: sp.get("includeRunning") !== "0",
    since: parseSince(sp.get("since")),
    jobIds: jobIds.length > 0 ? jobIds : undefined,
  });

  return NextResponse.json({ ok: true, data: { jobs } });
}

async function validateMagazineContentEmbed(args: {
  kind: StudioContentJobKindType;
  payload: ContentBasicBody | ContentCustomBody;
}) {
  const source = args.payload.source;
  if (source?.surface !== "magazine-article-embed") return { ok: true as const, payload: args.payload };

  if (args.kind !== "template-content") {
    return { ok: false as const, status: 400, error: "MAGAZINE_EMBED_TEMPLATE_ONLY" };
  }

  const session = await getMagazineEmbedSession(args.payload.embedSessionId);
  if (!session || session.moduleType !== "content_embed" || session.serviceKey !== "gen-studio" || !session.templateKey) {
    return { ok: false as const, status: 403, error: "MAGAZINE_EMBED_SESSION_REQUIRED" };
  }

  if (String(args.payload.templateKey || "").trim() !== session.templateKey) {
    return { ok: false as const, status: 403, error: "MAGAZINE_TEMPLATE_NOT_ALLOWED" };
  }

  if (args.payload.templateScope && args.payload.templateScope !== "system") {
    return { ok: false as const, status: 400, error: "MAGAZINE_TEMPLATE_SCOPE_NOT_ALLOWED" };
  }

  if (args.payload.generationMode === "custom") {
    return { ok: false as const, status: 400, error: "MAGAZINE_EMBED_TEMPLATE_ONLY" };
  }

  if (args.payload.visibility && args.payload.visibility !== "private") {
    return { ok: false as const, status: 400, error: "MAGAZINE_EMBED_PRIVATE_ONLY" };
  }

  const variables = toUnknownRecord(args.payload.variables);
  const allowedKeys = new Set(session.allowedProps?.allowlistedInputKeys || []);
  const unknownKeys = Object.keys(variables).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return { ok: false as const, status: 400, error: "MAGAZINE_TEMPLATE_VARIABLE_NOT_ALLOWED" };
  }

  return {
    ok: true as const,
    payload: {
      ...args.payload,
      templateScope: "system" as const,
      generationMode: "template" as const,
      visibility: "private" as const,
      n: 1,
    },
  };
}

async function handlePOST(data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const body = toUnknownRecord(data);
  const kind = normalizeKind(body.kind);
  if (!kind) return NextResponse.json({ ok: false, error: "kind_invalid" }, { status: 400 });

  const payload = {
    ...toUnknownRecord(body.payload),
    // client source is deliberately discarded; the route derives it from the same-origin Referer.
    source: await resolveStudioGenerationSource(request, toUnknownRecord(body.payload).embedSessionId),
  } as ContentBasicBody | ContentCustomBody;
  const magazineValidation = await validateMagazineContentEmbed({ kind, payload });
  if (!magazineValidation.ok) return NextResponse.json({ ok: false, error: magazineValidation.error }, { status: magazineValidation.status });
  const trustedPayload = magazineValidation.payload;
  const clientRequestId = String(body.clientRequestId || "").trim();
  const universeId = String(trustedPayload.universeId || "").trim();

  if (universeId) {
    const universe = await getUniverseById(universeId);
    if (!universe) return NextResponse.json({ ok: false, error: "universe_not_found" }, { status: 404 });
    if (!canEditUniverse(user as unknown as IUpdateUserData, universe)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
  }

  const result = await enqueueStudioContentJob({ kind, payload: trustedPayload, user, clientRequestId });

  if (!result.ok) {
    const status = result.error === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, data: result.job }, { status: result.job.reused ? 200 : 202 });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-content-jobs:get", { bodyParser: "none" });
export const POST = withAuth(handlePOST, validatePostBody, "lab/studio-content-jobs:post", { bodyParser: "json" });
