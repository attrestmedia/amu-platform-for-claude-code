import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth, withGuestOrAuth } from "libs/server-utils/api/apiMiddleware";
import {
  resetAmuChatModelPreference,
  resolveChatModelPolicy,
  saveChatModelPreference,
} from "libs/server-utils/chat/chatModelPolicy";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import type { ChatModelServiceType } from "types/ai";
import { pickString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose AMU 일반 대화와 Tutors/Game의 AI 채팅 모델 정책 조회 및 선택 저장
 * @process 인증/게스트 분기  서비스/범위 검증  서버 모델 정책 해석  사용자 선호 upsert/reset  응답 반환
 * @domain ai-chat
 * @scope api
 */

function getUid(user: AuthenticatedUserType) {
  return pickString(user?.uid || user?.ID);
}

function toService(value: unknown): ChatModelServiceType {
  const service = pickString(value).toLowerCase();
  if (service === "amu" || service === "tutors" || service === "game") return service;
  const error = new Error("service가 유효하지 않습니다.") as Error & { errorCode: string; status: number };
  error.errorCode = "CHAT_MODEL_SERVICE_INVALID";
  error.status = 400;
  throw error;
}

async function handleGet(_data: unknown, user: AuthenticatedUserType, request?: NextRequest) {
  const params = request ? new URL(request.url).searchParams : null;
  const service = toService(params?.get("service"));
  // TUTORS-193 D1 — 조회 경로에서만 inputModality를 받는다. 서버가 다시 정규화하므로 여기서는 그대로 전달한다.
  const inputModality = params?.get("inputModality") ?? undefined;
  const result = await resolveChatModelPolicy(
    service === "amu"
      ? { uid: getUid(user), service, inputModality, actor: { user } }
      : {
          uid: getUid(user),
          service,
          actor: { user },
          universeId: params?.get("universeId") || "",
          personaId: params?.get("personaId") || "",
          inputModality,
        },
  );
  return NextResponse.json({ ok: true, data: result }, { status: 200 });
}

async function handlePost(data: unknown, user: AuthenticatedUserType) {
  const body = toUnknownRecord(data);
  const service = toService(body.service);
  const mode = pickString(body.mode || body.preferenceMode).toLowerCase();
  if (mode && mode !== "recommended" && mode !== "preference") {
    const error = new Error("선호 모델 적용 방식이 유효하지 않습니다.") as Error & { errorCode: string; status: number };
    error.errorCode = "CHAT_MODEL_PREFERENCE_MODE_INVALID";
    error.status = 400;
    throw error;
  }
  if (service !== "amu" && mode) {
    const error = new Error("AMU 일반 대화에서만 선호 모델 적용 방식을 변경할 수 있습니다.") as Error & {
      errorCode: string;
      status: number;
    };
    error.errorCode = "CHAT_MODEL_PREFERENCE_MODE_INVALID";
    error.status = 400;
    throw error;
  }
  if (service === "amu" && mode === "recommended") {
    const result = await resetAmuChatModelPreference({ uid: getUid(user), actor: { user } });
    return NextResponse.json({ ok: true, data: result }, { status: 200 });
  }
  if (service === "amu" && (!pickString(body.provider) || !pickString(body.modelName))) {
    const error = new Error("사용자 선호 모델을 선택해야 합니다.") as Error & { errorCode: string; status: number };
    error.errorCode = "CHAT_MODEL_PREFERENCE_REQUIRED";
    error.status = 400;
    throw error;
  }
  const result = await saveChatModelPreference({
    uid: getUid(user),
    service,
    actor: { user },
    universeId: pickString(body.universeId),
    personaId: pickString(body.personaId),
    requestedProvider: body.provider,
    requestedModelName: body.modelName,
  });
  return NextResponse.json({ ok: true, data: result }, { status: 200 });
}

const getAuthenticated = withAuth(handleGet, undefined, "ai/chat-models_get");
const getAmuWithGuest = withGuestOrAuth(handleGet, undefined, "ai/chat-models_get_amu", {
  bodyParser: "none",
  allowGuest: true,
});

export async function GET(request: NextRequest, context: NextRouteContext) {
  const service = new URL(request.url).searchParams.get("service")?.trim().toLowerCase();
  return service === "amu" ? getAmuWithGuest(request, context) : getAuthenticated(request, context);
}

export const POST = withAuth(handlePost, undefined, "ai/chat-models_post");
