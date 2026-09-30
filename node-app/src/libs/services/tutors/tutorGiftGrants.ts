import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { PersonaSchema } from "models/universe";
import type { IPersonaDocument } from "models/universe";
import { TutorGiftGrantSchema } from "models/tutors";
import type { ITutorGiftGrantDocument, TutorGiftGrantStatus } from "models/tutors";
import { MONGODB_PERSONA_URL, MONGODB_USERS_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { UserSchema } from "models/user";
import type { IUserDocument } from "models/user";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getPersonaActorId } from "libs/server-utils/persona/personaPolicy";
import { getTutorsCollectionName, isSafeTutorsCollectionName } from "libs/services/tutors/tutorsCollectionKey";
import { removeTutorFromTutorsState } from "libs/services/tutors/tutorsState";
import { assertAcceptedFriendship } from "libs/services/social/friends";
import { toUnknownRecord } from "utils/common/typeUtils";

export type TutorPersonaAccess =
  | { kind: "owner"; canEdit: true; grant: null; sourceCollection: string }
  | { kind: "gift"; canEdit: false; grant: ITutorGiftGrantDocument; sourceCollection: string }
  | { kind: "public"; canEdit: false; grant: null; sourceCollection: string };

export type TutorGiftPersonaEntry = {
  persona: IPersonaDocument;
  access: TutorPersonaAccess;
};

export type ResolvedTutorPersonaAccess = {
  persona: IPersonaDocument | null;
  access: TutorPersonaAccess | null;
};

const TUTOR_GIFT_GRANTS_COLLECTION = "tutor_gift_grants";

function safeShortText(value: unknown, maxLen: number) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

function normalizeEmailLower(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

function buildGrantId(sourceOwnerId: string, sourcePersonaId: string, recipientActorId: string) {
  const raw = `${sourceOwnerId}:${sourcePersonaId}:${recipientActorId}`;
  return `tg_${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}

async function getTutorGiftGrantModel() {
  return getModel<ITutorGiftGrantDocument>(
    MONGODB_PERSONA_URL,
    "TutorGiftGrant",
    TutorGiftGrantSchema,
    TUTOR_GIFT_GRANTS_COLLECTION,
  );
}

async function getPersonaModel(collectionName: string) {
  if (!isSafeTutorsCollectionName(collectionName)) throw new Error("INVALID_TUTORS_COLLECTION");
  return getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
}

export function toTutorAccessMeta(access: TutorPersonaAccess | null) {
  if (!access) return undefined;
  if (access.kind === "owner") {
    return { kind: "owner" as const, canEdit: true, canUse: true };
  }

  if (access.kind === "public") {
    return { kind: "public" as const, canEdit: false, canUse: true };
  }

  return {
    kind: "gift" as const,
    grantId: access.grant.grantId,
    grantStatus: access.grant.status,
    sourceOwnerId: access.grant.sourceOwnerId,
    recipientActorId: access.grant.recipientActorId,
    canEdit: false,
    canUse: access.grant.status === "accepted",
  };
}

export function toTutorGiftGrantClient(grant: Partial<ITutorGiftGrantDocument>) {
  return {
    grantId: String(grant.grantId || ""),
    sourcePersonaId: String(grant.sourcePersonaId || ""),
    sourceOwnerId: String(grant.sourceOwnerId || ""),
    status: grant.status || "pending",
    message: grant.message || "",
    createdAt: grant.createdAt ? new Date(grant.createdAt).toISOString() : undefined,
    updatedAt: grant.updatedAt ? new Date(grant.updatedAt).toISOString() : undefined,
  };
}

export async function createTutorGiftGrant(body: Record<string, unknown>, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ success: false, error: "unauthorized_actor" }, { status: 401 });

  const sourcePersonaId = safeShortText(body.pid || body.sourcePersonaId, 128);
  const recipientActorId = safeShortText(body.recipientActorId, 160);
  const recipientEmailLower = normalizeEmailLower(body.recipientEmailLower || body.recipientEmail);
  const message = safeShortText(body.message, 240);

  if (!sourcePersonaId) {
    return NextResponse.json({ success: false, error: "pid는 필수입니다.", errorCode: "PID_REQUIRED" }, { status: 400 });
  }
  if (!recipientActorId) {
    return NextResponse.json(
      { success: false, error: "recipientActorId는 필수입니다.", errorCode: "RECIPIENT_REQUIRED" },
      { status: 400 },
    );
  }
  if (recipientActorId === actorId) {
    return NextResponse.json(
      { success: false, error: "자기 자신에게는 선물할 수 없습니다.", errorCode: "SELF_GIFT_NOT_ALLOWED" },
      { status: 400 },
    );
  }

  const isFriend = await assertAcceptedFriendship(actorId, recipientActorId, "giftTutors");
  if (!isFriend) {
    return NextResponse.json(
      { success: false, error: "친구로 승인된 사용자에게만 선물할 수 있습니다.", errorCode: "FRIEND_REQUIRED" },
      { status: 403 },
    );
  }

  const sourceCollection = getTutorsCollectionName(user);
  const PersonaModel = await getPersonaModel(sourceCollection);
  const source = await PersonaModel.findOne({
    pid: sourcePersonaId,
    isTemplate: { $ne: true },
    status: { $ne: "blocked" },
  }).lean();

  if (!source) {
    return NextResponse.json({ success: false, error: "source_not_found" }, { status: 404 });
  }
  if (source.ownerId && source.ownerId !== actorId) {
    return NextResponse.json({ success: false, error: "forbidden_source" }, { status: 403 });
  }

  const GrantModel = await getTutorGiftGrantModel();
  const grantId = buildGrantId(actorId, sourcePersonaId, recipientActorId);
  const grant = await GrantModel.findOneAndUpdate(
    { grantId },
    {
      $set: {
        grantId,
        sourcePersonaId,
        sourceCollection,
        sourceOwnerId: actorId,
        recipientActorId,
        recipientEmailLower,
        status: "pending",
        message,
      },
      $unset: {
        acceptedAt: "",
        rejectedAt: "",
        revokedAt: "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return NextResponse.json({ success: true, data: toTutorGiftGrantClient(grant || {}) });
}

export async function listTutorGiftGrantsForRecipient(user: AuthenticatedUserType, statuses: TutorGiftGrantStatus[]) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return [];

  const GrantModel = await getTutorGiftGrantModel();
  return GrantModel.find({ recipientActorId: actorId, status: { $in: statuses } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
}

export async function listGiftedTutorPersonasForRecipient(
  user: AuthenticatedUserType,
  statuses: TutorGiftGrantStatus[],
): Promise<TutorGiftPersonaEntry[]> {
  const grants = await listTutorGiftGrantsForRecipient(user, statuses);
  const out: TutorGiftPersonaEntry[] = [];

  for (const grant of grants) {
    if (!isSafeTutorsCollectionName(grant.sourceCollection)) continue;

    const SourceModel = await getPersonaModel(grant.sourceCollection);
    const persona = await SourceModel.findOne({
      pid: grant.sourcePersonaId,
      isTemplate: { $ne: true },
      status: { $ne: "blocked" },
    }).lean();
    if (!persona) continue;

    out.push({
      persona: persona as IPersonaDocument,
      access: {
        kind: "gift",
        canEdit: false,
        grant: grant as ITutorGiftGrantDocument,
        sourceCollection: grant.sourceCollection,
      },
    });
  }

  return out;
}

export async function resolveTutorPersonaReadAccess(
  user: AuthenticatedUserType | unknown,
  pid: string,
): Promise<ResolvedTutorPersonaAccess> {
  const sourcePersonaId = safeShortText(pid, 128);
  if (!sourcePersonaId) return { persona: null, access: null };

  const ownCollection = getTutorsCollectionName(user);
  const OwnModel = await getPersonaModel(ownCollection);
  const own = await OwnModel.findOne({
    pid: sourcePersonaId,
    isTemplate: { $ne: true },
    status: { $ne: "blocked" },
  })
    .lean()
    .exec();
  if (own) {
    return {
      persona: own as IPersonaDocument,
      access: { kind: "owner", canEdit: true, grant: null, sourceCollection: ownCollection },
    };
  }

  // 공개 템플릿은 Article Experience 같은 승인된 service entry에서만 읽기/사용할 수 있다.
  // 일반 사용자 소유 문서보다 뒤에서 조회하여 기존 권한 판정을 바꾸지 않는다.
  const SharedModel = await getPersonaModel("tutors_shared_personas");
  const shared = await SharedModel.findOne({
    pid: sourcePersonaId,
    isTemplate: true,
    visibility: "public",
    status: "active",
  })
    .lean()
    .exec();
  if (shared) {
    return {
      persona: shared as IPersonaDocument,
      access: { kind: "public", canEdit: false, grant: null, sourceCollection: "tutors_shared_personas" },
    };
  }

  const actorId = getPersonaActorId(user);
  if (!actorId) return { persona: null, access: null };

  const GrantModel = await getTutorGiftGrantModel();
  const grant = await GrantModel.findOne({
    recipientActorId: actorId,
    sourcePersonaId,
    status: "accepted",
  }).lean();
  if (!grant || !isSafeTutorsCollectionName(grant.sourceCollection)) {
    return { persona: null, access: null };
  }

  const SourceModel = await getPersonaModel(grant.sourceCollection);
  const persona = await SourceModel.findOne({
    pid: sourcePersonaId,
    isTemplate: { $ne: true },
    status: { $ne: "blocked" },
  }).lean();
  if (!persona) return { persona: null, access: null };

  return {
    persona: persona as IPersonaDocument,
    access: {
      kind: "gift",
      canEdit: false,
      grant: grant as ITutorGiftGrantDocument,
      sourceCollection: grant.sourceCollection,
    },
  };
}

export async function acceptTutorGiftGrant(body: Record<string, unknown>, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ success: false, error: "unauthorized_actor" }, { status: 401 });

  const grantId = safeShortText(body.grantId, 80);
  if (!grantId) return NextResponse.json({ success: false, error: "grantId는 필수입니다." }, { status: 400 });

  const GrantModel = await getTutorGiftGrantModel();
  const grant = await GrantModel.findOneAndUpdate(
    { grantId, recipientActorId: actorId, status: "pending" },
    { $set: { status: "accepted", acceptedAt: new Date() } },
    { new: true },
  ).lean();

  if (!grant) return NextResponse.json({ success: false, error: "gift_not_found" }, { status: 404 });
  return NextResponse.json({ success: true, data: toTutorGiftGrantClient(grant) });
}

export async function rejectTutorGiftGrant(body: Record<string, unknown>, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ success: false, error: "unauthorized_actor" }, { status: 401 });

  const grantId = safeShortText(body.grantId, 80);
  if (!grantId) return NextResponse.json({ success: false, error: "grantId는 필수입니다." }, { status: 400 });

  const GrantModel = await getTutorGiftGrantModel();
  const grant = await GrantModel.findOneAndUpdate(
    { grantId, recipientActorId: actorId, status: { $in: ["pending", "accepted"] } },
    { $set: { status: "rejected", rejectedAt: new Date() } },
    { new: true },
  ).lean();

  if (!grant) return NextResponse.json({ success: false, error: "gift_not_found" }, { status: 404 });

  const uid = String((user as { uid?: unknown })?.uid || "").trim();
  if (uid) {
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
    const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
    const userDoc = await UserModel.findOne({ uid });
    if (userDoc) {
      const selectedPersonas = toUnknownRecord((userDoc as unknown as { selectedPersonas?: unknown }).selectedPersonas);
      (userDoc as unknown as { selectedPersonas: Record<string, unknown> }).selectedPersonas = {
        ...selectedPersonas,
        tutors: removeTutorFromTutorsState(selectedPersonas.tutors, grant.sourcePersonaId),
      };
      userDoc.markModified("selectedPersonas");
      await userDoc.save();
    }
  }

  return NextResponse.json({ success: true, data: toTutorGiftGrantClient(grant) });
}
