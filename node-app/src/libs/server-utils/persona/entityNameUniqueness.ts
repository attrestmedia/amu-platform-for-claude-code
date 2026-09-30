import "server-only";

import { getUserKey } from "libs/services/tutors/tutorsCollectionKey";
import {
  findPersonaNameConflict,
  normalizePersonaName,
  releasePersonaName,
  reservePersonaName,
  type PersonaNameReserveResult,
} from "./personaNameRegistry";

/**
 * @docHint
 * @purpose 튜터/페르소나/캐릭터 이름 중복 검증의 공통 진입점
 * @process userKey 추출  공통 이름 레지스트리 조회  충돌 여부/유일 이름 반환
 * @domain persona-identity
 * @scope server
 *
 * - 이름 namespace는 "사용자별 하나"다: 같은 사용자의 Tutor/Play Character/AI Agent 등은
 *   같은 이름을 가질 수 없다. 다른 사용자는 같은 이름을 쓸 수 있다.
 * - userKey는 반드시 getUserKey(user)와 동일한 규칙(ID 우선)으로 산출해야
 *   튜터 컬렉션(tutors_{userKey})과 같은 네임스페이스를 공유한다.
 * - 실제 저장 시에는 reservePersonaName(releasePersonaName)을 호출해 레지스트리를
 *   원자적으로 갱신해야 하며, 여기서 제공하는 조회는 사전/UX용이다.
 */

export type EntityNameConflictScope = string;

export type EntityNameConflict = {
  taken: boolean;
  scope?: EntityNameConflictScope;
  existingPersonaId?: string;
};

// 사용자 객체에서 네임스페이스 키를 추출한다. getUserKey(user)와 동일하다.
export function resolveUserNameKey(user: unknown): string {
  return getUserKey(user);
}

export async function findEntityNameConflict(args: {
  userKey: string;
  name: string;
  excludeEntityId?: string;
}): Promise<EntityNameConflict> {
  const result = await findPersonaNameConflict({
    userKey: args.userKey,
    name: args.name,
    ...(args.excludeEntityId ? { excludePersonaId: args.excludeEntityId } : {}),
  });
  return {
    taken: result.taken,
    ...(result.personaType ? { scope: result.personaType } : {}),
    ...(result.personaId ? { existingPersonaId: result.personaId } : {}),
  };
}

// 이름이 겹치면 번호 suffix("2", "3", ...)를 붙여 유일한 이름을 반환한다.
// AI 초안 자동 생성 등 UX 단계에서 중복 없는 이름을 보장할 때 사용한다.
export async function resolveUniqueEntityName(args: {
  userKey: string;
  name: string;
  excludeEntityId?: string;
  maxAttempts?: number;
}): Promise<string> {
  const base = normalizePersonaName(args.name);
  if (!base) return String(args.name || "").trim();

  const maxAttempts = Math.max(1, Math.min(100, Number(args.maxAttempts || 20)));
  const first = await findEntityNameConflict({
    userKey: args.userKey,
    name: base,
    excludeEntityId: args.excludeEntityId,
  });
  if (!first.taken) return String(args.name || "").trim();

  for (let i = 2; i <= maxAttempts; i++) {
    const candidate = `${base} ${i}`;
    const next = await findEntityNameConflict({
      userKey: args.userKey,
      name: candidate,
      excludeEntityId: args.excludeEntityId,
    });
    if (!next.taken) return `${String(args.name || "").trim()} ${i}`;
  }

  return String(args.name || "").trim();
}

export { normalizePersonaName, releasePersonaName, reservePersonaName, type PersonaNameReserveResult };
