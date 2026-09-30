import "server-only";

import { USER_ROLES } from "consts/auth";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

type ImageAssetAccessLike = {
  scope?: string;
  uid?: string;
  universeId?: string;
};

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

export function getAuthenticatedUid(user: AuthenticatedUserType) {
  return toSafeString(user?.uid || user?.ID);
}

export function isAuthenticatedAdmin(user: AuthenticatedUserType) {
  const roles = getUserRole(user);
  return roles.includes(USER_ROLES.ADMINISTRATOR);
}

export async function canAccessImageAsset(user: AuthenticatedUserType, asset: ImageAssetAccessLike | null | undefined) {
  if (isAuthenticatedAdmin(user)) return true;

  const scope = toSafeString(asset?.scope);
  const ownerUid = toSafeString(asset?.uid);
  const isOwner = Boolean(ownerUid && ownerUid === getAuthenticatedUid(user));

  if (scope === "user") {
    return isOwner;
  }

  if (scope === "universe") {
    if (isOwner) return true;

    const universeId = toSafeString(asset?.universeId);
    if (!universeId) return false;
    const universe = await getUniverseById(universeId);
    if (!universe) return false;
    return canEditUniverse(user, universe);
  }

  return isOwner;
}
