import { NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { UserSchema } from "models/user";
import type { IUserDocument } from "models/user";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { TUTORS_MAX_SELECTED } from "consts/app/services";
import { normalizeTutorsState, applyTutorsSelection } from "libs/services/tutors/tutorsState";
import { resolveTutorPersonaReadAccess } from "libs/services/tutors/tutorGiftGrants";
import { MONGODB_USERS_URL } from "consts/env/server";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { toUnknownRecord, pickString, toErrorMessage } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain tutors_state
 * @scope server_route
 */

const MAX_ID_LEN = 128;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
function normalizeSafeId(v: unknown) {
  const s = pickString(v);
  if (!s) return "";
  if (s.length > MAX_ID_LEN) return "";
  if (s.startsWith("$")) return "";
  if (s.includes(".")) return "";
  if (!SAFE_ID_RE.test(s)) return "";
  return s;
}

function normalizeNextSelected(input: unknown) {
  const arr = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: Array<{ personaId: string; universeId: string }> = [];

  for (const it of arr) {
    const item = toUnknownRecord(it);
    const personaId = normalizeSafeId(item.personaId);
    const universeId = normalizeSafeId(item.universeId);
    if (!personaId || !universeId) continue;
    if (seen.has(personaId)) continue;
    seen.add(personaId);
    out.push({ personaId, universeId });
    if (out.length >= TUTORS_MAX_SELECTED) break;
  }
  return out;
}

async function loadUserDoc(uid: string) {
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  const doc = await UserModel.findOne({ uid });
  return { UserModel, doc };
}

export async function getTutorsState(user: AuthenticatedUserType) {
  const uid = pickString((user as { uid?: unknown })?.uid);
  if (!uid) return NextResponse.json({ error: "인증 정보가 없습니다." }, { status: 401 });

  const { doc } = await loadUserDoc(uid);
  if (!doc) return NextResponse.json({ error: "유저 데이터를 찾을 수 없습니다." }, { status: 404 });

  const personas = toUnknownRecord((doc as unknown as { selectedPersonas?: unknown }).selectedPersonas);
  const raw = personas.tutors;
  return NextResponse.json({ state: normalizeTutorsState(raw) }, { status: 200 });
}

export async function updateTutorsState(data: unknown, user: AuthenticatedUserType) {
  const uid = pickString((user as { uid?: unknown })?.uid);
  if (!uid) return NextResponse.json({ error: "인증 정보가 없습니다." }, { status: 401 });

  const { doc } = await loadUserDoc(uid);
  if (!doc) return NextResponse.json({ error: "유저 데이터를 찾을 수 없습니다." }, { status: 404 });

  const personasPrev = toUnknownRecord((doc as unknown as { selectedPersonas?: unknown }).selectedPersonas);
  const prev = normalizeTutorsState(personasPrev.tutors);
  const nowIso = new Date().toISOString();
  const body = toUnknownRecord(data);
  const nextSelected = normalizeNextSelected(body.selected);

  try {
    const personaIds = [
      ...new Set([...prev.selected.map((item) => item.personaId), ...nextSelected.map((item) => item.personaId)]),
    ];
    const accessByPersonaId = new Map(
      await Promise.all(
        personaIds.map(async (personaId) => [personaId, await resolveTutorPersonaReadAccess(user, personaId)] as const),
      ),
    );

    const accessiblePrev: typeof prev.selected = [];
    for (const item of prev.selected) {
      const resolved = accessByPersonaId.get(item.personaId);
      if (resolved?.persona && resolved.access) accessiblePrev.push(item);
    }

    const allowedSelected = [];
    for (const item of nextSelected) {
      const resolved = accessByPersonaId.get(item.personaId);
      if (!resolved?.persona || !resolved.access) {
        if (prev.selected.some((prevItem) => prevItem.personaId === item.personaId)) continue;
        return NextResponse.json(
          { error: "접근할 수 없는 선생님입니다.", errorCode: "TUTORS_PERSONA_ACCESS_DENIED" },
          { status: 403 },
        );
      }

      allowedSelected.push({
        personaId: item.personaId,
        universeId: String(resolved.persona.universeId || item.universeId),
        ...(resolved.access.kind !== "public" ? { accessKind: resolved.access.kind } : {}),
        giftGrantId: resolved.access.kind === "gift" ? resolved.access.grant.grantId : undefined,
      });
    }

    const selected = applyTutorsSelection(accessiblePrev, allowedSelected, nowIso);

    const nextSettings = toUnknownRecord(body.settings);
    const nextState = normalizeTutorsState({
      ...prev,
      selected,
      ...(body.settings ? { settings: { ...prev.settings, ...nextSettings } } : {}),
      ...(body.knowledgeSources ? { knowledgeSources: body.knowledgeSources } : {}),
    });

    const mutable = doc as unknown as { selectedPersonas: Record<string, unknown> };
    mutable.selectedPersonas = mutable.selectedPersonas || {};
    mutable.selectedPersonas.tutors = nextState;
    doc.markModified("selectedPersonas");
    await doc.save();

    return NextResponse.json({ state: nextState }, { status: 200 });
  } catch (e: unknown) {
    const msg = toErrorMessage(e);
    if (msg === "LOCKED_PERSONA_CANNOT_BE_REMOVED") {
      return NextResponse.json(
        { error: "대화 시작 후 잠긴 선생님은 해제할 수 없습니다.", errorCode: msg },
        { status: 409 },
      );
    }
    if (msg === "LOCKED_PERSONA_UNIVERSE_IMMUTABLE") {
      return NextResponse.json(
        { error: "대화 시작 후 잠긴 선생님의 universeId는 변경할 수 없습니다.", errorCode: msg },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg || "상태 업데이트에 실패했습니다." }, { status: 400 });
  }
}
