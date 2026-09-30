import "server-only";
import { USER_ROLES } from "consts/auth/userRoles";
import type { UserRoles } from "consts/auth/userRoles";

export const ALL_ROLES = new Set<UserRoles>(Object.values(USER_ROLES));

export function coerceUserRoles(input: unknown, fallback: UserRoles[] = []): UserRoles[] {
  if (Array.isArray(input)) {
    const out = input.filter((r): r is UserRoles => ALL_ROLES.has(r as UserRoles));
    return out.length ? out : fallback;
  }
  return fallback;
}
