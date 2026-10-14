import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getModel } from "libs/database/modelCache";
import { PersonaSchema } from "models/universe";
import type { IPersonaDocument } from "models/universe";
import { normalizeProfiles, normalizeSprite } from "libs/server-utils/api/apiSafetyHelper";
import {
  resolveClientProfileImageUrl,
  resolveStaleProfileImageUrls,
} from "libs/server-utils/lab/staleProfileImageUrlRepair";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { getTutorsCollectionName, getUserKey } from "libs/services/tutors/tutorsCollectionKey";
import { releasePersonaName } from "libs/server-utils/persona/entityNameUniqueness";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

type PersonaDocLike = Partial<IPersonaDocument> & UnknownRecord;
type PersonaClientView = UnknownRecord;

/**
 * @docHint
 * @purpose API 라우트(/api/game/personas/[pid]) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain tutors
 * @scope server_route
 */

export const runtime = "nodejs";

// (간단 응답용) - 목록/저장 route.ts와 동일한 형태로 유지
function toClientPersona(doc: PersonaDocLike | null | undefined) {
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
    tutorsAccess: { kind: "owner", canEdit: true, canUse: true },
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
  const collectionName = getTutorsCollectionName(user);
  const Model = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
  const doc = await Model.findOne({ pid, isTemplate: { $ne: true }, status: { $ne: "blocked" } }).lean();
  if (!doc) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  const view = toClientPersona(doc as PersonaDocLike);
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
export const GET = withAuth(handleGET, undefined, "game/personas:getOne");

async function handleDELETE(_data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const pid = decodeURIComponent(ctx.params.pid || "");
  const collectionName = getTutorsCollectionName(user);
  const Model = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
  const deleted = await Model.findOneAndDelete({ pid }).lean();
  if (!deleted) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });

  // 삭제된 사용자 소유 페르소나의 이름을 네임스페이스 레지스트리에서 해제한다.
  await releasePersonaName({ userKey: getUserKey(user), personaId: pid }).catch(() => null);

  return NextResponse.json({ success: true });
}
export const DELETE = withAuth(handleDELETE, undefined, "game/personas:delete");
