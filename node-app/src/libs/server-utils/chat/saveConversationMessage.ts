import "server-only";
import { NextResponse } from "next/server";
import { getConversationModel, getConversationSessionModel, getConversationMessageModel } from "libs/database/conversations";
import {
  wasUpserted,
  clamp,
  buildSessionLocationUpdate,
  safeDate,
  normalizeStringArray,
  normalizeSystemCode,
  normalizeMessageAudioMeta,
} from "libs/server-utils/chat/conversationMessageUtils";
import { refreshConversationMemoryPipeline } from "./conversationMemoryPipeline";
import { logger } from "utils/log";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process saveConversationMessageServer 중심 처리  입력 검증  핵심 로직  결과 포맷팅  대화 저장/후처리 포함
 * @domain conversations
 * @scope server
 */

const MAX_ID_LEN = 128;
const MAX_CLIENT_ID_LEN = 160;
const MAX_CONTENT_LEN = 50000;

type StoredVoiceInput = {
  inputMode: "voice";
  voiceInputCount: 1;
};

function normalizeStoredVoiceInput(value: unknown): StoredVoiceInput | undefined {
  const record = toUnknownRecord(value);
  if (record.inputMode !== "voice" || Number(record.voiceInputCount) !== 1) return undefined;
  return { inputMode: "voice", voiceInputCount: 1 };
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

export async function saveConversationMessageServer({
  user,
  personaId: personaIdRaw,
  userPersonaId: userPersonaIdRaw,
  universeId: universeIdRaw,
  sessionId: sessionIdRaw,
  message,
  location,
  relationshipUpdate,
}: {
  user: unknown;
  personaId: string;
  userPersonaId?: string;
  universeId?: string;
  sessionId: string;
  message: UnknownRecord;
  location?: string;
  relationshipUpdate?: {
    intimacyDeltaHint?: unknown;
    reason?: string;
    event?: { type?: string; description?: string };
  };
}) {
  const personaId = String(personaIdRaw || "").trim();
  const sessionId = String(sessionIdRaw || "").trim();
  const universeId = String(universeIdRaw || "").trim();
  const userPersonaId = String(userPersonaIdRaw || "").trim();

  const serverUserId = String(toUnknownRecord(user).ID || "");
  const isGuest = serverUserId.startsWith("guest:");
  const now = new Date();

  if (!personaId || !sessionId || !message) {
    return NextResponse.json({ error: "필수 필드 누락(personaId, sessionId, message)" }, { status: 400 });
  }
  if (tooLong(personaId, MAX_ID_LEN) || tooLong(sessionId, MAX_ID_LEN)) {
    return NextResponse.json({ error: "personaId/sessionId가 너무 깁니다." }, { status: 400 });
  }

  if (isGuest) {
    if (!universeId) return NextResponse.json({ error: "게스트 저장은 universeId가 필요합니다." }, { status: 400 });
    if (tooLong(universeId, MAX_ID_LEN)) return NextResponse.json({ error: "universeId가 너무 깁니다." }, { status: 400 });
  } else {
    if (!userPersonaId) return NextResponse.json({ error: "로그인 저장은 userPersonaId가 필요합니다." }, { status: 400 });
    if (tooLong(userPersonaId, MAX_ID_LEN)) return NextResponse.json({ error: "userPersonaId가 너무 깁니다." }, { status: 400 });
  }

  const role = message?.role === "user" ? "user" : message?.role === "assistant" ? "assistant" : null;
  if (!role) return NextResponse.json({ error: "role은 user|assistant만 허용됩니다." }, { status: 400 });

  const content = String(message?.content ?? "");
  if (!content.trim()) return NextResponse.json({ error: "content가 비어있습니다." }, { status: 400 });
  if (tooLong(content, MAX_CONTENT_LEN)) return NextResponse.json({ error: "content가 너무 깁니다." }, { status: 413 });

  const clientId = String(message?.clientId ?? "").trim();
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다.", errorCode: "CLIENT_ID_REQUIRED" }, { status: 400 });
  }
  if (tooLong(clientId, MAX_CLIENT_ID_LEN)) return NextResponse.json({ error: "clientId가 너무 깁니다." }, { status: 400 });

  const ts = safeDate(message?.timestamp, now);
  const translation = String(message?.translation ?? "");
  const systemCode = role === "assistant" ? normalizeSystemCode(message?.systemCode) : [];
  const productCode = role === "assistant" ? normalizeStringArray(message?.productCode, { max: 50 }) : [];
  const voiceInput = role === "user" ? normalizeStoredVoiceInput(message?.voiceInput) : undefined;
  const audioMeta = role === "assistant" ? normalizeMessageAudioMeta(message?.audioMeta) : undefined;

  const ConversationModel = await getConversationModel(serverUserId);
  const SessionModel = await getConversationSessionModel(serverUserId);
  const MessageModel = await getConversationMessageModel(serverUserId);

  const match = buildIdentityMatch({ serverUserId, personaId, isGuest, universeId, userPersonaId });
  const sessionLocationUpdate = buildSessionLocationUpdate(location);

  // 1) thread upsert
  await ConversationModel.updateOne(
    match,
    {
      $setOnInsert: {
        ...match,
        relationship: buildRelationshipDefaults(now),
        sharedContext: { learnedInfo: [] },
        createdAt: now,
      },
      $set: { updatedAt: now },
      $unset: isGuest ? { userPersonaId: "" } : { universeId: "" },
    },
    { upsert: true },
  );

  // 2) session upsert
  const sessionUpsert = await SessionModel.updateOne(
    { ...match, sessionId },
    {
      $setOnInsert: {
        ...match,
        sessionId,
        date: now,
        ...sessionLocationUpdate.setOnInsert,
        messageCount: 0,
        userMessageCount: 0,
        assistantMessageCount: 0,
        voiceInputCount: 0,
        firstMessageAt: ts,
        createdAt: now,
      },
      $set: {
        updatedAt: now,
        ...sessionLocationUpdate.set,
        lastMessageAt: ts,
      },
    },
    { upsert: true },
  );

  // 3) message upsert (idempotent)
  let messageInserted = false;
  try {
    const msgUpsert = await MessageModel.updateOne(
      { ...match, sessionId, clientId },
      {
        $setOnInsert: {
          ...match,
          sessionId,
          clientId,
          role,
          content,
          timestamp: ts,
          translation,
          systemCode,
          productCode,
          ...(voiceInput ? { voiceInput } : {}),
          createdAt: now,
        },
        $set: {
          updatedAt: now,
          ...(voiceInput ? { voiceInput } : {}),
          ...(audioMeta ? { audioMeta } : {}),
        },
      },
      { upsert: true },
    );
    messageInserted = wasUpserted(msgUpsert);
  } catch (e: unknown) {
    if (String(toErrorLike(e).code) === "11000") {
      messageInserted = false;
      // unique clientId 경쟁에서 음성 요청이 먼저 삽입되지 않았어도 허용 메타만 보강한다.
      if (voiceInput) {
        await MessageModel.updateOne(
          { ...match, sessionId, clientId },
          { $set: { voiceInput, updatedAt: now } },
        );
      }
    } else {
      throw e;
    }
  }

  // 4) session messageCount +1 (실 insert일 때만)
  if (messageInserted) {
    const voiceInputUsed = role === "user" && voiceInput?.inputMode === "voice" && voiceInput.voiceInputCount === 1;
    await SessionModel.updateOne(
      { ...match, sessionId },
      {
        $inc: {
          messageCount: 1,
          ...(role === "user" ? { userMessageCount: 1 } : { assistantMessageCount: 1 }),
          ...(voiceInputUsed ? { voiceInputCount: 1 } : {}),
        },
        $set: { lastMessageAt: ts, updatedAt: now },
      },
    );
  }

  // 5) relationship update (assistant + inserted일 때만)
  let intimacyDelta = 0;
  if (messageInserted && role === "assistant" && relationshipUpdate?.intimacyDeltaHint) {
    const len = content.length;
    const magnitude = clamp(Math.floor(len / 240) + 1, 1, 5);
    const hasNeg = systemCode.includes("negative");
    const hasPos = systemCode.includes("positive") || systemCode.includes("good");
    const sign = hasNeg && !hasPos ? -1 : hasPos && !hasNeg ? 1 : 0;
    intimacyDelta = sign === 0 ? 0 : sign * magnitude;

    if (systemCode.includes("end-chat") || systemCode.includes("end-force")) intimacyDelta = 0;
  }

  const isNewSession = wasUpserted(sessionUpsert);
  if (messageInserted || isNewSession || relationshipUpdate?.event) {
    const historyEntry =
      intimacyDelta !== 0
        ? [
            {
              change: intimacyDelta,
              reason: String(relationshipUpdate?.reason || relationshipUpdate?.event?.type || "chat"),
              timestamp: now,
            },
          ]
        : [];

    await ConversationModel.updateOne(match, [
      {
        $set: {
          updatedAt: now,
          relationship: {
            $let: {
              vars: {
                curr: { $ifNull: ["$relationship", buildRelationshipDefaults(now)] },
                nextIntimacy: { $add: [{ $ifNull: ["$relationship.intimacy", 0] }, intimacyDelta] },
              },
              in: {
                $mergeObjects: [
                  "$$curr",
                  {
                    intimacy: "$$nextIntimacy",
                    intimacyLevel: {
                      $let: {
                        vars: { v: "$$nextIntimacy" },
                        in: {
                          $switch: {
                            branches: [
                              { case: { $gte: ["$$v", 900] }, then: "soulmate" },
                              { case: { $gte: ["$$v", 700] }, then: "best_friend" },
                              { case: { $gte: ["$$v", 400] }, then: "close_friend" },
                              { case: { $gte: ["$$v", 200] }, then: "friend" },
                              { case: { $gte: ["$$v", 100] }, then: "acquaintance" },
                              { case: { $gte: ["$$v", 50] }, then: "familiar_face" },
                            ],
                            default: "stranger",
                          },
                        },
                      },
                    },
                    meetCount: { $add: [{ $ifNull: ["$$curr.meetCount", 0] }, isNewSession ? 1 : 0] },
                    firstMet: { $ifNull: ["$$curr.firstMet", now] },
                    lastInteraction: now,
                    intimacyHistory: { $concatArrays: [{ $ifNull: ["$$curr.intimacyHistory", []] }, historyEntry] },
                    specialEvents: {
                      $concatArrays: [
                        { $ifNull: ["$$curr.specialEvents", []] },
                        relationshipUpdate?.event
                          ? [
                              {
                                eventType: relationshipUpdate.event.type,
                                date: now,
                                description: relationshipUpdate.event.description,
                              },
                            ]
                          : [],
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ]);
  }

  try {
    await refreshConversationMemoryPipeline({
      serverUserId,
      personaId,
      userPersonaId: isGuest ? undefined : userPersonaId,
      universeId: isGuest ? universeId : undefined,
      sessionId,
      role,
      messageInserted,
      systemCode,
    });
  } catch (error) {
    logger.warn("대화 memory 파이프라인 갱신 실패:", error);
  }

  return NextResponse.json({ success: true, inserted: messageInserted, isNewSession }, { status: 200 });
}
