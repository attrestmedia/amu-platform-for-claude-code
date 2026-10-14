import { USER_ROLES } from "consts/auth";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import type { IUpdateUserData } from "types/user";
import { toUnknownRecord } from "utils/common";

function normalizedId(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Auth identity is authoritative; mismatched merged IDs fail closed. */
export function resolveAgeAssuranceUid(user: unknown): string | null {
  const record = toUnknownRecord(user);
  const uid = normalizedId(record.uid);
  const id = normalizedId(record.ID);
  if (uid && id && uid !== id) return null;
  return uid || id || null;
}

export function isAgeAssuranceAdmin(user: unknown): boolean {
  return getUserRole(toUnknownRecord(user) as unknown as IUpdateUserData).includes(USER_ROLES.ADMINISTRATOR);
}
