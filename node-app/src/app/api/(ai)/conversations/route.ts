import { NextRequest, NextResponse } from "next/server";
import { getConversationModel, getConversationSessionModel, getConversationMessageModel } from "libs/database/conversations";
import { PROMPT_LIMITS } from "consts/auth";
import { withGuestOrAuth } from "libs/server-utils/api/apiMiddleware";
import { clamp } from "libs/server-utils/chat/conversationMessageUtils";
import { saveConversationMessageServer } from "libs/server-utils/chat/saveConversationMessage";
import { toTimestamp, type UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

type SessionLean = {
  sessionId?: string;
  date?: Date | string | number;
  location?: string;
  summary?: unknown;
  lastMessageAt?: Date | string | number;
} & UnknownRecord;

type GroupedSessionMessages = {
  sessionId: string;
  total: number;
  messages: unknown[];
};

type ConversationView = {
  sessionId: string | undefined;
  date: Date | string | number | undefined;
  location: string;
  summary: unknown;
  messages: unknown[];
  originalMessageCount: number;
};

type ConversationThreadDoc = {
  userId?: string;
  personaId?: string;
  userPersonaId?: string;
  universeId?: string;
  relationship?: UnknownRecord;
  sharedContext?: UnknownRecord;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
};

type ConversationPostPayload = UnknownRecord & {
  personaId?: string;
  userPersonaId?: string;
  universeId?: string;
  sessionId?: string;
  message?: UnknownRecord & {
    role?: string;
    content?: string;
    clientId?: string;
    timestamp?: Date | string | number;
    translation?: string;
    systemCode?: unknown;
    productCode?: unknown;
    audioMeta?: unknown;
  };
  location?: string;
  relationshipUpdate?: {
    intimacyDeltaHint?: unknown;
    reason?: string;
    event?: { type?: string; description?: string };
  };
};

/**
 * @docHint
 * @purpose API 라우트((ai) / conversations) 기능 요청 처리
 * @process 요청 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain conversations
 * @scope global
 */

const MAX_FETCH_MESSAGES_PER_SESSION_HARD = 500; // 방어적 상한 (UI/토큰 정책과 별개)
const MAX_FETCH_SESSIONS_HARD = 100;
const MAX_ID_LEN = 128;

function parsePositiveInt(v: string | null | undefined) {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tooLong(v: string, max: number) {
  return typeof v === "string" && v.length > max;
}

function buildIdentityMatch({ serverUserId, personaId, isGuest, universeId, userPersonaId }: { serverUserId: string; personaId: string; isGuest: boolean; universeId: string; userPersonaId: string }) {
  return {
    userId: serverUserId,
    personaId,
    ...(isGuest ? { universeId } : { userPersonaId }),
  };
}

function buildRelationshipDefaults(now: Date) {
  return {
    intimacy: 0,
    intimacyLevel: "stranger",
    intimacyHistory: [],
    meetCount: 0,
    isControllable: false,
    isFriendship: false,
    isOwned: false,
    firstMet: now,
    lastInteraction: now,
    specialEvents: [],
  };
}

// GET
async function handleGet(_data: unknown, user: AuthenticatedUserType, request?: NextRequest): Promise<NextResponse> {
  if (!request) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const personaId = (searchParams.get("personaId") || "").trim();
  const universeId = (searchParams.get("universeId") || "").trim();
  const userPersonaId = (searchParams.get("userPersonaId") || "").trim();
  const maxMessagesRaw = searchParams.get("maxMessages");

  const serverUserId = String(user?.ID || "");
  const isGuest = serverUserId.startsWith("guest:");

  if (!personaId) return NextResponse.json({ error: "필수 파라미터(personaId) 누락" }, { status: 400 });
  if (tooLong(personaId, MAX_ID_LEN)) return NextResponse.json({ error: "personaId가 너무 깁니다." }, { status: 400 });

  if (isGuest) {
    if (!universeId) return NextResponse.json({ error: "게스트 조회는 universeId가 필요합니다." }, { status: 400 });
    if (tooLong(universeId, MAX_ID_LEN)) return NextResponse.json({ error: "universeId가 너무 깁니다." }, { status: 400 });
  } else {
    if (!userPersonaId) return NextResponse.json({ error: "로그인 조회는 userPersonaId가 필요합니다." }, { status: 400 });
    if (tooLong(userPersonaId, MAX_ID_LEN)) return NextResponse.json({ error: "userPersonaId가 너무 깁니다." }, { status: 400 });
  }

  const messageLimitParsed = parsePositiveInt(maxMessagesRaw);
  const messageLimit = clamp(messageLimitParsed ?? PROMPT_LIMITS.maxMessages, 1, Math.min(PROMPT_LIMITS.maxMessages, MAX_FETCH_MESSAGES_PER_SESSION_HARD));

  const ConversationModel = await getConversationModel(serverUserId);
  const SessionModel = await getConversationSessionModel(serverUserId);
  const MessageModel = await getConversationMessageModel(serverUserId);

  const match = buildIdentityMatch({ serverUserId, personaId, isGuest, universeId, userPersonaId });

  // thread(relationship/sharedContext) 로드
  const thread = await ConversationModel.findOne(match).select("userId personaId userPersonaId universeId relationship sharedContext createdAt updatedAt").sort({ updatedAt: -1 }).lean();

  // 세션 목록 - 최근 세션 우선
  const recentSessions = (await SessionModel.find(match).sort({ lastMessageAt: -1 }).limit(MAX_FETCH_SESSIONS_HARD).lean()) as SessionLean[];
  const sessions = [...recentSessions].sort((a, b) => toTimestamp(a.date) - toTimestamp(b.date));

  const sessionIds = sessions.map((s) => String(s.sessionId)).filter(Boolean);

  let conversations: ConversationView[] = [];
  let totalOriginalMessages = 0;

  if (sessionIds.length > 0) {
    // 메시지: $sort + $group (Mongo 버전 의존 $sortArray 제거)
    const grouped = await MessageModel.aggregate([
      { $match: { ...match, sessionId: { $in: sessionIds } } },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: "$sessionId",
          total: { $sum: 1 },
          messages: {
            $push: {
              role: "$role",
              content: "$content",
              timestamp: "$timestamp",
              clientId: "$clientId",
              translation: "$translation",
              systemCode: "$systemCode",
              productCode: "$productCode",
              audioMeta: "$audioMeta",
            },
          },
        },
      },
      {
        $project: {
          sessionId: "$_id",
          total: 1,
          messages: { $slice: ["$messages", -messageLimit] },
        },
      },
    ]);

    const map = new Map<string, GroupedSessionMessages>();
    (grouped as GroupedSessionMessages[]).forEach((g) => {
      map.set(String(g.sessionId), g);
      totalOriginalMessages += Number(g.total || 0);
    });

    conversations = sessions.map((s) => {
      const g = map.get(String(s.sessionId));
      return {
        sessionId: s.sessionId,
        date: s.date,
        location: s.location || "unknown",
        summary: s.summary,
        messages: g?.messages || [],
        originalMessageCount: g?.total || 0,
      };
    });
  }

  // relationship/sharedContext는 thread에서, 없으면 기본값
  const now = new Date();
  const threadDoc = (thread || null) as ConversationThreadDoc | null;
  const relationship = threadDoc?.relationship ?? buildRelationshipDefaults(now);
  const sharedContext = threadDoc?.sharedContext ?? { learnedInfo: [] };

  return NextResponse.json(
    {
      conversation: threadDoc
        ? {
            userId: threadDoc.userId,
            personaId: threadDoc.personaId,
            userPersonaId: threadDoc.userPersonaId,
            universeId: threadDoc.universeId,
            relationship,
            sharedContext,
            createdAt: threadDoc.createdAt,
            updatedAt: threadDoc.updatedAt,
            conversations,
          }
        : null,
      messageLimit,
      totalOriginalMessages,
    },
    { status: 200 },
  );
}

// POST
async function handlePost(data: ConversationPostPayload, user: AuthenticatedUserType): Promise<NextResponse> {
  return saveConversationMessageServer({
    user,
    personaId: String(data?.personaId || ""),
    userPersonaId: data?.userPersonaId,
    universeId: data?.universeId,
    sessionId: String(data?.sessionId || ""),
    message: data?.message as UnknownRecord,
    location: data?.location,
    relationshipUpdate: data?.relationshipUpdate,
  });
}

export const GET = withGuestOrAuth(handleGet, undefined, "conversations/get");
export const POST = withGuestOrAuth(handlePost, undefined, "conversations/post");
