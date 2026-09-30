import { NextRequest, NextResponse } from "next/server";
import { withGuestOrAuth } from "libs/server-utils/api/apiMiddleware";
import fetchClient from "libs/api/fetchClient";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common";

type ConversationListResponse = {
  conversation?: {
    conversations?: Array<{ sessionId?: string } & UnknownRecord>;
  } & UnknownRecord;
} & UnknownRecord;

/**
 * @docHint
 * @purpose API 라우트((ai) / conversations / [personaId]) 기능 요청 처리
 * @process 요청 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain conversations
 * @scope global
 */

// /api/conversations와 동일 정책으로 통일, 필요 시 sessionId만 필터링
export const GET = withGuestOrAuth(
  async (_data, _user, request?: NextRequest) => {
    if (!request) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const url = new URL(request.url);
    const personaIdFromPath = url.pathname.split("/").pop() || "";

    let personaId = personaIdFromPath;
    try {
      personaId = decodeURIComponent(personaIdFromPath);
    } catch {
      // malformed encoding이면 raw 사용
      personaId = personaIdFromPath;
    }

    const universeId = url.searchParams.get("universeId") || "";
    const userPersonaId = url.searchParams.get("userPersonaId") || "";
    const maxMessages = url.searchParams.get("maxMessages") || "";
    const sessionId = url.searchParams.get("sessionId") || "";

    const params = new URLSearchParams();
    params.set("personaId", personaId);
    if (universeId) params.set("universeId", universeId);
    if (userPersonaId) params.set("userPersonaId", userPersonaId);
    if (maxMessages) params.set("maxMessages", maxMessages);

    // sessionId 필터는 현재 /api/conversations가 “전체 세션 + 메시지”를 반환
    const origin = request.nextUrl?.origin ?? new URL(request.url).origin;
    const targetUrl = `${origin}/api/conversations?${params.toString()}`;

    // 서버 fetch는 credentials 옵션이 의미 없고, 인증은 cookie / x-guest-id 전달이 핵심
    const forwardedHeaders: Record<string, string> = {};
    const cookie = request.headers.get("cookie");
    const xGuest = request.headers.get("x-guest-id");
    const auth = request.headers.get("authorization");
    const xAuthToken = request.headers.get("x-auth-token");
    const xReqId = request.headers.get("x-request-id");

    if (cookie) forwardedHeaders.cookie = cookie;
    if (xGuest) forwardedHeaders["x-guest-id"] = xGuest;
    if (auth) forwardedHeaders.authorization = auth;
    if (xAuthToken) forwardedHeaders["x-auth-token"] = xAuthToken;
    if (xReqId) forwardedHeaders["x-request-id"] = xReqId;

    let body: ConversationListResponse | undefined;
    try {
      const r = await fetchClient.get<ConversationListResponse>(targetUrl, {
        headers: forwardedHeaders,
        cache: "no-store",
        credentials: "omit",
        timeout: 15_000,
      });
      body = r.data;
    } catch (e) {
      const errLike = toErrorLike(e);
      const response = toUnknownRecord(errLike.response);
      const status = Number(response.status) || 500;
      const fallback = {
        error: typeof errLike.message === "string" && errLike.message ? errLike.message : "Failed to fetch conversations",
      };
      const data = response.data ?? fallback;
      return NextResponse.json(data, { status });
    }

    if (sessionId && body?.conversation?.conversations) {
      body.conversation.conversations = body.conversation.conversations.filter((s) => s?.sessionId === sessionId);
    }

    return NextResponse.json(body, { status: 200 });
  },
  undefined,
  "conversations/persona/get"
);
