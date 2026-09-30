import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getModel } from "libs/database/modelCache";
import { PersonaSchema } from "models/universe";
import type { IPersonaDocument } from "models/universe";
import { UserSchema } from "models/user";
import type { IUserDocument } from "models/user";
import { normalizeProfiles, normalizeSprite } from "libs/server-utils/api/apiSafetyHelper";
import {
  resolveClientProfileImageUrl,
  resolveStaleProfileImageUrls,
} from "libs/server-utils/lab/staleProfileImageUrlRepair";
import { MONGODB_PERSONA_URL, MONGODB_USERS_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { TUTOR_CONVERSATION_LEVEL_OPTIONS, normalizeTutorConversationLevel } from "consts/tutors";
import { getTutorsCollectionName, getUserKey, TUTORS_SHARED_TEMPLATE_COLLECTION } from "libs/services/tutors/tutorsCollectionKey";
import { getPersonaActorId } from "libs/server-utils/persona/personaPolicy";
import { releasePersonaName } from "libs/server-utils/persona/entityNameUniqueness";
import { resolveTutorPersonaReadAccess, toTutorAccessMeta } from "libs/services/tutors/tutorGiftGrants";
import { removeTutorFromTutorsState } from "libs/services/tutors/tutorsState";
import { toUnknownRecord, type UnknownRecord } from "utils/common";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth/userRoles";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

type PersonaDocLike = Partial<IPersonaDocument> & UnknownRecord;
type PersonaClientView = UnknownRecord;

/**
 * @docHint
 * @purpose API 라우트((app) / tutors / personas / [pid]) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain tutors
 * @scope server_route
 */

export const runtime = "nodejs";

// (간단 응답용) - 목록/저장 route.ts와 동일한 형태로 유지
function toClientPersona(doc: PersonaDocLike | null | undefined, access?: ReturnType<typeof toTutorAccessMeta>) {
  if (!doc) return null;
  const base: PersonaClientView = {
    _id: doc._id ? String(doc._id) : undefined,
    pid: doc.pid,
    personaType: doc.personaType,
    name: doc.name,
    age: doc.age,
    appearance: doc.appearance,
    background: doc.background,
    personality: doc.personality,
    speechStyle: doc.speechStyle,
    summary: doc.summary,
    universeId: doc.universeId,
    systemPersonaKey: doc.systemPersonaKey,
    profiles: normalizeProfiles(doc.profiles),
    sprite: normalizeSprite(doc.sprite),
    tutorIntro: doc.tutorIntro ?? "",
    tutorsPolicy: doc.tutorsPolicy ?? null,
    tutorsUi: doc.tutorsUi ?? null,
    tutorGoalBlueprint: doc.tutorGoalBlueprint ?? null,
    tutorBehaviorAxes: doc.tutorBehaviorAxes ?? null,
    narrativeGenesis: doc.narrativeGenesis ?? null,
    ownerId: doc.ownerId ?? "",
    instanceOwnerId: doc.instanceOwnerId ?? "",
    visibility: doc.visibility ?? "private",
    editPolicy: doc.editPolicy ?? "owner-only",
    forkPolicy: doc.forkPolicy ?? "fork-on-use",
    status: doc.status ?? "active",
    version: typeof doc.version === "number" ? doc.version : 1,
    isTemplate: !!doc.isTemplate,
    sourcePersonaId: doc.sourcePersonaId ?? "",
    sourceVersion: typeof doc.sourceVersion === "number" ? doc.sourceVersion : undefined,
    sourceOwnerId: doc.sourceOwnerId ?? "",
    derivedFromSystemPersonaKey: doc.derivedFromSystemPersonaKey ?? "",
    lastSyncedAt: doc.lastSyncedAt ?? "",
    authorProfile: doc.authorProfile ?? null,
    credits: doc.credits ?? null,
    voiceProfile: doc.voiceProfile ?? null,
    tutorsAccess: access || { kind: "owner", canEdit: true, canUse: true },
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };

  if (doc.personaType === "human") {
    base.gender = doc.gender;
    base.nationality = doc.nationality;
    base.job = doc.job;
    base.values = doc.values;
    base.preferences = doc.preferences;
    base.language = doc.language;
  } else if (doc.personaType === "monster") {
    base.gender = doc.gender;
    base.species = doc.species;
    base.habitat = doc.habitat;
    base.threatLevel = doc.threatLevel;
    base.specialAbilities = doc.specialAbilities;
    base.artifact = doc.artifact;
  }
  return base;
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const pid = decodeURIComponent(ctx.params.pid || "");
  const isTemplateScope = new URL(_req.url).searchParams.get("scope") === "template";
  const collectionName = isTemplateScope ? TUTORS_SHARED_TEMPLATE_COLLECTION : getTutorsCollectionName(user);
  const Model = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
  const resolved = isTemplateScope
    ? { persona: await Model.findOne({ pid }).lean(), access: null }
    : await resolveTutorPersonaReadAccess(user, pid);
  const doc = resolved.persona;
  if (!doc) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  const view = toClientPersona(doc as PersonaDocLike, toTutorAccessMeta(resolved.access));
  if (view) {
    const repairedProfiles = await resolveStaleProfileImageUrls(view.profiles);
    view.profiles = repairedProfiles;
    const primaryProfileImageUrl = String(repairedProfiles.default?.[0] || "").trim();
    view.profileImageDisplayUrl = primaryProfileImageUrl
      ? await resolveClientProfileImageUrl(primaryProfileImageUrl, user)
      : "";
  }
  return NextResponse.json({ success: true, data: view });
}
export const GET = withAuth(handleGET, undefined, "tutors/personas:getOne");

async function handlePATCH(data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const pid = decodeURIComponent(ctx.params.pid || "");
  const body = toUnknownRecord(data);
  const rawConversationLevel = String(body.conversationLevel || "").trim();

  if (!pid) return NextResponse.json({ success: false, error: "pid_required", errorCode: "PID_REQUIRED" }, { status: 400 });
  if (!TUTOR_CONVERSATION_LEVEL_OPTIONS.some((option) => option.value === rawConversationLevel)) {
    return NextResponse.json(
      {
        success: false,
        error: "유효하지 않은 대화 수준입니다.",
        errorCode: "TUTORS_INVALID_LEARNING_DIFFICULTY",
      },
      { status: 400 },
    );
  }

  const resolved = await resolveTutorPersonaReadAccess(user, pid);
  if (!resolved.persona || !resolved.access) {
    return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  }
  if (!resolved.access.canEdit) {
    return NextResponse.json(
      {
        success: false,
        error: "선물받은 튜터의 대화 수준은 원본 소유자만 저장할 수 있습니다.",
        errorCode: "TUTORS_PERSONA_READONLY",
      },
      { status: 403 },
    );
  }

  const conversationLevel = normalizeTutorConversationLevel(rawConversationLevel);
  const Model = await getModel<IPersonaDocument>(
    MONGODB_PERSONA_URL,
    resolved.access.sourceCollection,
    PersonaSchema,
    resolved.access.sourceCollection,
  );
  const updated = await Model.findOneAndUpdate(
    { pid, isTemplate: { $ne: true }, status: { $ne: "blocked" } },
    { $set: { "tutorsPolicy.conversationLevel": conversationLevel } },
    { new: true },
  ).lean();

  if (!updated) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  const view = toClientPersona(updated as PersonaDocLike, toTutorAccessMeta(resolved.access));
  if (view) {
    const repairedProfiles = await resolveStaleProfileImageUrls(view.profiles);
    view.profiles = repairedProfiles;
    const primaryProfileImageUrl = String(repairedProfiles.default?.[0] || "").trim();
    view.profileImageDisplayUrl = primaryProfileImageUrl
      ? await resolveClientProfileImageUrl(primaryProfileImageUrl, user)
      : "";
  }
  return NextResponse.json({ success: true, data: view });
}
export const PATCH = withAuth(handlePATCH, undefined, "tutors/personas:patch");

async function handleDELETE(_data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const pid = decodeURIComponent(ctx.params.pid || "");
  const url = new URL(_req.url);
  const isTemplateScope = url.searchParams.get("scope") === "template";
  const collectionName = isTemplateScope ? TUTORS_SHARED_TEMPLATE_COLLECTION : getTutorsCollectionName(user);
  const Model = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
  const query: Record<string, unknown> = { pid };
  if (isTemplateScope) {
    const isAdmin = getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
    if (!isAdmin) query.ownerId = getPersonaActorId(user);
    query.isTemplate = true;
  }
  const deleted = await Model.findOneAndDelete(query).lean();
  if (!deleted) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });

  // 삭제된 사용자 소유 페르소나의 이름을 네임스페이스 레지스트리에서 해제한다.
  if (!isTemplateScope) {
    await releasePersonaName({ userKey: getUserKey(user), personaId: pid }).catch(() => null);
  }

  if (!isTemplateScope) {
    const uid = String((user as { uid?: unknown }).uid || "").trim();
    if (uid) {
      const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
      const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
      const userDoc = await UserModel.findOne({ uid });
      if (userDoc) {
        const selectedPersonas = toUnknownRecord(
          (userDoc as unknown as { selectedPersonas?: unknown }).selectedPersonas,
        );
        (userDoc as unknown as { selectedPersonas: Record<string, unknown> }).selectedPersonas = {
          ...selectedPersonas,
          tutors: removeTutorFromTutorsState(selectedPersonas.tutors, pid),
        };
        userDoc.markModified("selectedPersonas");
        await userDoc.save();
      }
    }
  }

  return NextResponse.json({ success: true });
}
export const DELETE = withAuth(handleDELETE, undefined, "tutors/personas:delete");
