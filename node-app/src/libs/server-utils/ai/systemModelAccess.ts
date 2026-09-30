import "server-only";

import { USER_ROLES } from "consts/auth";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import type { IUpdateUserData } from "types/user";

export type SystemModelAccessActor = { isAdministrator: boolean };

export type SystemModelSelectionBlockReason = "disabled" | "deprecated" | "administrator_required";

type SystemModelSelectionCandidate = {
  enabled?: unknown;
  deprecated?: unknown;
  adminOnly?: unknown;
};

/** 관리자 여부는 인증 경로에서 전달된 서버 user의 역할만으로 판정한다. */
export function resolveSystemModelAccessActor(user?: unknown): SystemModelAccessActor {
  const isAdministrator = Boolean(
    user && typeof user === "object" &&
      getUserRole(user as IUpdateUserData).includes(USER_ROLES.ADMINISTRATOR),
  );
  return { isAdministrator };
}

/** enabled/adminOnly에서 파생되는 launchState와 동일한 선택 가능 판정. */
export function getSystemModelSelectionBlockReason(
  item: SystemModelSelectionCandidate,
  access: SystemModelAccessActor,
): SystemModelSelectionBlockReason | null {
  if (item.enabled !== true) return "disabled";
  if (item.deprecated === true) return "deprecated";
  if (item.adminOnly === true && !access.isAdministrator) return "administrator_required";
  return null;
}

export function canSelectSystemModel(
  item: SystemModelSelectionCandidate,
  access: SystemModelAccessActor,
): boolean {
  return getSystemModelSelectionBlockReason(item, access) === null;
}

export function filterSelectableSystemModels<T extends SystemModelSelectionCandidate>(
  items: readonly T[],
  access: SystemModelAccessActor,
): T[] {
  return items.filter((item) => canSelectSystemModel(item, access));
}
