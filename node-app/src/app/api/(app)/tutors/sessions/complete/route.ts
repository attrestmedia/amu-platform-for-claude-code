import { NextResponse } from "next/server";
import { TUTORS_NAMESPACE_KEY } from "consts/app";
import {
  TUTORS_SESSION_MIN_ASSISTANT_MESSAGES,
  TUTORS_SESSION_MIN_DURATION_MS,
  TUTORS_SESSION_MIN_USER_MESSAGES,
} from "consts/tutors";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL } from "consts/env/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getConversationMessageModel, getConversationSessionModel } from "libs/database/conversations";
import { settleTutorSessionReward } from "libs/database/tutors";
import { getModel } from "libs/database/modelCache";
import { deleteVoiceAssetByStorage } from "libs/server-utils/audio/voiceAssetStorage";
import { getPersonaActorId } from "libs/server-utils/persona/personaPolicy";
import { applyTutorSessionIntimacy } from "libs/services/tutors/tutorsProgress";
import { normalizeTutorsState } from "libs/services/tutors/tutorsState";
import { resolveTutorPersonaReadAccess } from "libs/services/tutors/tutorGiftGrants";
import { UserSchema, type IUserDocument } from "models/user";
import { getKstDateKey, normalizeTutorChatDates } from "utils/app/tutorsEditPolicy";
import { toUnknownRecord, type UnknownRecord } from "utils/common";

function safeId(value: unknown) {
  const text = String(value || "").trim();
  return /^[a-zA-Z0-9._:-]{1,160}$/.test(text) ? text : "";
}

async function cleanupTemporarySessionVoiceAssets(args: { serverUserId: string; personaId: string; sessionId: string }) {
  const MessageModel = await getConversationMessageModel(args.serverUserId);
  const rows = await MessageModel.find({
    userId: args.serverUserId,
    personaId: args.personaId,
    userPersonaId: TUTORS_NAMESPACE_KEY,
    sessionId: args.sessionId,
    role: "assistant",
    "audioMeta.storage.temporary": true,
  })
    .select("audioMeta.storage")
    .lean()
    .exec();

  await Promise.allSettled(
    rows.map(async (row) => {
      const storage = toUnknownRecord(toUnknownRecord(row).audioMeta).storage;
      if (await deleteVoiceAssetByStorage(storage)) {
        await MessageModel.updateOne(
          { _id: toUnknownRecord(row)._id },
          {
            $unset: {
              "audioMeta.storage": 1,
            },
          },
        ).exec();
      }
    }),
  );
}

async function postHandler(data: UnknownRecord, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  const serverUserId = String(user?.ID || "").trim();
  const uid = String(user?.uid || "").trim();
  const personaId = safeId(data.personaId);
  const sessionId = safeId(data.sessionId);
  if (!actorId || !serverUserId || !uid) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!personaId || !sessionId) {
    return NextResponse.json({ ok: false, error: "PERSONA_AND_SESSION_REQUIRED" }, { status: 400 });
  }

  const access = await resolveTutorPersonaReadAccess(user, personaId);
  if (!access.persona || !access.access) {
    return NextResponse.json({ ok: false, error: "TUTORS_PERSONA_ACCESS_DENIED" }, { status: 403 });
  }

  const SessionModel = await getConversationSessionModel(serverUserId);
  const session = await SessionModel.findOne({
    userId: serverUserId,
    personaId,
    userPersonaId: TUTORS_NAMESPACE_KEY,
    sessionId,
  }).exec();
  if (!session) return NextResponse.json({ ok: false, error: "TUTORS_SESSION_NOT_FOUND" }, { status: 404 });
  await cleanupTemporarySessionVoiceAssets({ serverUserId, personaId, sessionId });

  const durationMs = Math.max(0, new Date(session.lastMessageAt).getTime() - new Date(session.firstMessageAt).getTime());
  const eligible =
    Number(session.userMessageCount || 0) >= TUTORS_SESSION_MIN_USER_MESSAGES &&
    Number(session.assistantMessageCount || 0) >= TUTORS_SESSION_MIN_ASSISTANT_MESSAGES &&
    durationMs >= TUTORS_SESSION_MIN_DURATION_MS;
  if (!eligible) {
    return NextResponse.json(
      {
        ok: false,
        error: "TUTORS_SESSION_NOT_ELIGIBLE",
        requirements: {
          userMessages: TUTORS_SESSION_MIN_USER_MESSAGES,
          assistantMessages: TUTORS_SESSION_MIN_ASSISTANT_MESSAGES,
          durationMs: TUTORS_SESSION_MIN_DURATION_MS,
        },
        actual: {
          userMessages: Number(session.userMessageCount || 0),
          assistantMessages: Number(session.assistantMessageCount || 0),
          durationMs,
        },
      },
      { status: 409 },
    );
  }

  const settlement = await settleTutorSessionReward({
    actorId,
    personaId,
    sessionId,
    voiceUsed: Number(session.voiceInputCount || 0) > 0,
  });
  const event = settlement.event;
  await applyTutorSessionIntimacy({
    serverUserId,
    personaId,
    eventKey: event.eventKey,
    intimacyDelta: Number(event.intimacyDelta || 0),
  });

  session.completionStatus = "completed";
  session.completedAt = session.completedAt || new Date();
  session.completionEventKey = event.eventKey;
  await session.save();

  const UserModel = await getModel<IUserDocument>(
    MONGODB_USERS_URL,
    `${MONGODB_USER_MODEL_PREFIX}${uid}`,
    UserSchema,
    `${MONGODB_USER_MODEL_PREFIX}${uid}`,
  );
  const userDoc = await UserModel.findOne({ uid });
  if (userDoc) {
    const selectedPersonas = toUnknownRecord(userDoc.selectedPersonas);
    const nextState = normalizeTutorsState(toUnknownRecord(selectedPersonas.tutors));
    const selected = nextState.selected.find((item) => item.personaId === personaId);
    if (selected) {
      selected.chatDates = normalizeTutorChatDates([...(selected.chatDates || []), getKstDateKey()]);
      const mutableUser = userDoc as unknown as { selectedPersonas: Record<string, unknown> };
      mutableUser.selectedPersonas = { ...selectedPersonas, tutors: nextState };
      userDoc.markModified("selectedPersonas");
      await userDoc.save();
    }
  }

  return NextResponse.json({
    ok: true,
    duplicate: settlement.duplicate,
    data: {
      sessionId,
      eventKey: event.eventKey,
      xpDelta: Number(event.xpDelta || 0),
      intimacyDelta: Number(event.intimacyDelta || 0),
      creationCreditDelta: Number(event.creationCreditDelta || 0),
      ...(toUnknownRecord(event.payload)),
    },
  });
}

export const POST = withAuth(postHandler, undefined, "tutors/sessions:complete");
