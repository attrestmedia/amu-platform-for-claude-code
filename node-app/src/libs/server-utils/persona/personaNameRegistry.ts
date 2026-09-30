import "server-only";

import { dbConnect } from "libs/database/mongoose";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자가 소유한 Persona/Character 이름의 공통 네임스페이스 레지스트리
 * @process 이름 정규화  사용자별 레지스트리 조회/예약/해제  unique(userKey, normalizedName) 보장
 * @domain persona-identity
 * @scope server
 *
 * - AMU에서 사용자가 소유하는 재사용 가능한 Persona(Tutor/Play Character/AI Agent/Store 등)는
 *   서비스와 무관하게 "사용자별 하나의 이름 네임스페이스"를 공유한다.
 * - 공유 템플릿(tutors_shared_personas)은 사용자 소유 Persona가 아니므로 레지스트리에 없고,
 *   fork되어 사용자 소유 Persona가 되는 시점부터 이 규칙을 적용한다.
 * - DB 수준 unique(userKey, normalizedName)로 동시 요청 race까지 방지한다.
 */

const PERSONA_NAME_REGISTRY_COLLECTION = "persona_name_registry";

export function normalizePersonaName(name: string): string {
  return String(name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function getPersonaNameRegistryCollection() {
  const connection = await dbConnect(MONGODB_PERSONA_URL);
  if (!connection.db) throw new Error("PERSONA_NAME_REGISTRY_DB_NOT_READY");
  const col = connection.db.collection(PERSONA_NAME_REGISTRY_COLLECTION);
  await col.createIndex({ userKey: 1, normalizedName: 1 }, { unique: true }).catch(() => {});
  await col.createIndex({ userKey: 1, personaId: 1 }).catch(() => {});
  return col;
}

function isDuplicateKeyError(error: unknown) {
  const code = (error as { code?: number })?.code;
  return code === 11000;
}

export type PersonaNameReserveResult =
  | { ok: true; personaId: string }
  | { ok: false; conflict: { personaId: string; personaType: string } };

export async function reservePersonaName(args: {
  userKey: string;
  name: string;
  personaId: string;
  personaType: string;
}): Promise<PersonaNameReserveResult> {
  const userKey = String(args.userKey || "").trim();
  const normalizedName = normalizePersonaName(args.name);
  const personaId = String(args.personaId || "").trim();
  const personaType = String(args.personaType || "persona").trim();
  if (!userKey || !normalizedName || !personaId) {
    return { ok: false, conflict: { personaId: "", personaType: "" } };
  }

  const col = await getPersonaNameRegistryCollection();

  // 동일 personaId가 이미 같은 이름을 보유한 경우 멱등 성공으로 처리 (재시도 안전)
  const owned = toUnknownRecord(await col.findOne({ userKey, personaId }));
  if (owned && Object.keys(owned).length > 0) {
    if (String(owned.normalizedName) === normalizedName) {
      return { ok: true, personaId };
    }
    // 이름이 바뀐 경우(장래 rename 대비) 기존 행을 교체한다.
    await col.deleteOne({ userKey, personaId }).catch(() => {});
  }

  try {
    await col.insertOne({ userKey, normalizedName, personaId, personaType, createdAt: new Date() });
    return { ok: true, personaId };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = toUnknownRecord(await col.findOne({ userKey, normalizedName }));
      return {
        ok: false,
        conflict: {
          personaId: String(existing.personaId || ""),
          personaType: String(existing.personaType || ""),
        },
      };
    }
    throw error;
  }
}

export async function releasePersonaName(args: { userKey: string; personaId: string }): Promise<boolean> {
  const userKey = String(args.userKey || "").trim();
  const personaId = String(args.personaId || "").trim();
  if (!userKey || !personaId) return false;

  const col = await getPersonaNameRegistryCollection();
  const result = await col.deleteOne({ userKey, personaId });
  return Boolean(result.deletedCount);
}

export async function findPersonaNameConflict(args: {
  userKey: string;
  name: string;
  excludePersonaId?: string;
}): Promise<{ taken: boolean; personaId?: string; personaType?: string }> {
  const userKey = String(args.userKey || "").trim();
  const normalizedName = normalizePersonaName(args.name);
  if (!userKey || !normalizedName) return { taken: false };

  const col = await getPersonaNameRegistryCollection();
  const existing = toUnknownRecord(await col.findOne({ userKey, normalizedName }));
  if (!existing || Object.keys(existing).length === 0) return { taken: false };

  const existingPersonaId = String(existing.personaId || "");
  if (args.excludePersonaId && existingPersonaId === String(args.excludePersonaId)) {
    return { taken: false };
  }
  return { taken: true, personaId: existingPersonaId, personaType: String(existing.personaType || "") };
}
