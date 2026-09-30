import "server-only";
import { composeAuthoritativeSystemPrompt } from "libs/server-utils/system-prompt/systemPromptComposer";
import { normalizeRouteHint } from "utils/normalize";
import type { RouteHintType, SystemPromptOptionsType } from "types/ai";
import { getUniverseById } from "libs/database/universe";
import { TUTORS_NAMESPACE_KEY, UNIVERSE_NAMESPACE_KEY, COMMERCE_NAMESPACE_KEY } from "consts/app";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import type { UniverseType } from "types/game";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process getSharedRequestBase 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함
 * @domain ai-system-prompt
 * @scope global
 */

function throwHttpError(message: string, errorCode: string, status: number): never {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  throw err;
}

function normalizeStringId(v: unknown) {
  if (typeof v !== "string") return "";
  return v.trim();
}

async function assertUniverseRouteConsistency(
  routeHint: RouteHintType,
  universeId: string,
  universeTypeHint?: string | null,
) {
  // commerce는 withGuestOrAuth에서 이미 존재/타입 검증을 끝냈으면 힌트로 중복 조회를 제거
  let t = String(universeTypeHint || "")
    .trim()
    .toLowerCase();
  if (!t) {
    const uni = await getUniverseById(universeId).catch(() => null);
    if (!uni) throwHttpError("유니버스를 찾을 수 없습니다.", "UNIVERSE_NOT_FOUND", 404);
    t = String(toUnknownRecord(uni).type || "")
      .trim()
      .toLowerCase();
  }
  const isCommerce = t === "commerce";

  // routeHint가 권위: ai/tutors에서 commerce 유니버스를 쓰면 우회 위험이 생길 수 있으니 차단
  if (routeHint !== "commerce" && isCommerce) {
    throwHttpError("커머스 유니버스는 commerce 라우트를 사용해야 합니다.", "ROUTE_UNIVERSE_MISMATCH", 400);
  }

  // commerce 라우트는 withGuestOrAuth에서 이미 type 검증을 하지만, 안전하게 한 번 더 체크해도 됨
  if (routeHint === "commerce" && !isCommerce) {
    throwHttpError("커머스 유니버스가 아닙니다.", "NOT_COMMERCE_UNIVERSE", 400);
  }
}

export function getSharedRequestBase(data: unknown) {
  const d = toUnknownRecord(data);
  const message = typeof d.message === "string" ? d.message : "";
  const history = Array.isArray(d.history) ? d.history : [];
  const universeId = normalizeStringId(d.universeId);
  const npcId = normalizeStringId(d.npcId);
  const routeHint: RouteHintType = normalizeRouteHint(d.routeHint);

  if (!universeId) throwHttpError("universeId가 필요합니다.", "UNIVERSE_ID_REQUIRED", 400);
  if (!npcId) throwHttpError("npcId가 필요합니다.", "NPC_ID_REQUIRED", 400);

  // validateRequest가 이미 message를 강제하더라도, _shared 단에서 fail-closed가 더 안전함
  if (!message) throwHttpError("message가 필요합니다.", "MESSAGE_REQUIRED", 400);

  return { message, history, universeId, npcId, routeHint };
}

export function getBillingContext(routeHint: RouteHintType) {
  const billToUniverse = routeHint === "commerce";
  const app =
    routeHint === "tutors" ? TUTORS_NAMESPACE_KEY : billToUniverse ? COMMERCE_NAMESPACE_KEY : UNIVERSE_NAMESPACE_KEY;
  return { billToUniverse, app };
}

export async function composeSystemPromptOrThrow(args: {
  routeHint: RouteHintType;
  universeId: string;
  npcId: string;
  user?: UnknownRecord;
  promptOptions?: SystemPromptOptionsType;
  universeTypeHint?: string | null;
}) {
  const { routeHint, universeId, npcId, user, promptOptions, universeTypeHint } = args;
  await assertUniverseRouteConsistency(routeHint, universeId, universeTypeHint);

  const { systemPrompt } = await composeAuthoritativeSystemPrompt({
    routeHint,
    universeId,
    npcId,
    user,
    promptOptions,
    universeTypeHint: universeTypeHint ? (universeTypeHint as UniverseType) : null,
  });

  const trimmed = String(systemPrompt || "").trim();
  if (!trimmed) throwHttpError("시스템 프롬프트 생성에 실패했습니다.", "SYSTEM_PROMPT_COMPOSE_FAILED", 503);

  return trimmed;
}
