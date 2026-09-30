import { NextRequest, NextResponse } from "next/server";
import { getUniverseById, listPublishedUniverseCanon } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { applyNarrativeOutcome, resolveNarrativeOutcome } from "libs/server-utils/narrative/narrativeReducer";
import { assertNarrativeCollectionAllowed, isNarrativeRuntimeEnabled } from "libs/server-utils/narrative/narrativeLifecycle";
import { getUserStoryState } from "libs/database/game";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 사용자 행동을 서버 권위 Outcome Resolver와 Personal Canon reducer로 전달
 * @process 인증 UID  published Canon 확인  action allowlist  idempotent event apply
 * @domain narrative-runtime
 * @scope account-api
 */

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function safeId(value: unknown, max = 160) {
  const item = String(value || "").trim();
  return Boolean(item && item.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(item));
}

function identityFrom(request: NextRequest, body: Record<string, unknown>) {
  const universeId = String(body.universeId || "").trim();
  const narrativeProfileId = String(request.headers.get("x-narrative-profile") || body.narrativeProfileId || "").trim();
  if (!safeId(universeId) || !safeId(narrativeProfileId)) throw new Error("NARRATIVE_IDENTITY_INVALID");
  return { universeId, narrativeProfileId };
}

function validateUserAction(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(action, "source") || Object.prototype.hasOwnProperty.call(action, "transition")) return null;
  if (action.type === "activate_arc" && Object.keys(action).length === 2 && safeId(action.arcId)) return { type: "activate_arc", arcId: action.arcId as string } as const;
  if (action.type === "discover_beat" && Object.keys(action).length === 2 && safeId(action.beatId)) return { type: "discover_beat", beatId: action.beatId as string } as const;
  if (action.type === "complete_beat" && Object.keys(action).length === 2 && safeId(action.beatId)) return { type: "complete_beat", beatId: action.beatId as string } as const;
  if (action.type === "set_relation_signal" && Object.keys(action).length === 3 && safeId(action.targetCharacterId) && typeof action.delta === "number" && Number.isInteger(action.delta) && action.delta >= -100 && action.delta <= 100) return { type: "set_relation_signal", targetCharacterId: action.targetCharacterId as string, delta: action.delta } as const;
  if (action.type === "set_flag" && Object.keys(action).length === 3 && safeId(action.key, 120) && !/^canon[.:]/i.test(String(action.key)) && ["string", "number", "boolean"].includes(typeof action.value)) return { type: "set_flag", key: action.key as string, value: action.value as string | number | boolean } as const;
  return null;
}

async function handleGET(_body: unknown, user: AuthenticatedUserType, request: NextRequest) {
  if (!isNarrativeRuntimeEnabled()) return NextResponse.json({ ok: false, errorCode: "NARRATIVE_RUNTIME_DISABLED" }, { status: 423 });
  const body = { universeId: request.nextUrl.searchParams.get("universeId"), narrativeProfileId: request.headers.get("x-narrative-profile") };
  try {
    const identity = identityFrom(request, body);
    await assertNarrativeCollectionAllowed(uidOf(user));
    return NextResponse.json({ ok: true, state: await getUserStoryState({ uid: uidOf(user), ...identity }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NARRATIVE_STATE_READ_FAILED";
    return NextResponse.json({ ok: false, errorCode: code }, { status: code.includes("CONSENT") ? 428 : 400 });
  }
}

async function handlePOST(body: unknown, user: AuthenticatedUserType, request: NextRequest) {
  if (!isNarrativeRuntimeEnabled()) return NextResponse.json({ ok: false, errorCode: "NARRATIVE_RUNTIME_DISABLED" }, { status: 423 });
  const input = toUnknownRecord(body);
  try {
    const identity = identityFrom(request, input);
    const action = validateUserAction(input.action);
    const idempotencyKey = String(request.headers.get("idempotency-key") || input.idempotencyKey || "").trim();
    if (!action || !safeId(idempotencyKey, 200)) throw new Error("NARRATIVE_EVENT_INPUT_INVALID");
    const universe = await getUniverseById(identity.universeId);
    if (!universe || universe.enabled === false) throw new Error("UNIVERSE_NOT_AVAILABLE");
    const canon = await listPublishedUniverseCanon(identity.universeId);
    if (!canon.length) throw new Error("NARRATIVE_CANON_NOT_PUBLISHED");
    const outcome = resolveNarrativeOutcome({ source: "user_action", action });
    if (!outcome) throw new Error("NARRATIVE_OUTCOME_EMPTY");
    const result = await applyNarrativeOutcome({
      uid: uidOf(user),
      ...identity,
      canonRevision: canon.reduce((max, item) => Math.max(max, Number(item.revision || 1)), 1),
      idempotencyKey,
      outcome,
    });
    return NextResponse.json({ ok: true, data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NARRATIVE_EVENT_FAILED";
    const status = code.includes("CONSENT") ? 428 : code.includes("CONFLICT") || code.includes("IN_PROGRESS") ? 409 : code.includes("NOT_AVAILABLE") || code.includes("NOT_PUBLISHED") ? 404 : 400;
    return NextResponse.json({ ok: false, errorCode: code }, { status });
  }
}

export const GET = withAuth(handleGET, undefined, "narrative/events:get", { bodyParser: "none" });
export const POST = withAuth(handlePOST, undefined, "narrative/events:post", { bodyParser: "json" });
