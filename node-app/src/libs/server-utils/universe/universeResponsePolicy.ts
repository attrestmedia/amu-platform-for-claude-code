import "server-only";
import type { NextRequest } from "next/server";
import type { IUniverse } from "types/game";
import type { IUpdateUserData } from "types/user";
import { getAuthUser } from "libs/server-utils/auth/authUtils";
import { canEditUniverse, getUserFromDB } from "libs/server-utils/auth/userRoleUtils";

export async function resolveUniverseResponseViewer(request: NextRequest): Promise<IUpdateUserData | null> {
  const auth = await getAuthUser(request);
  if (!auth.verified) return null;
  const dbUser = await getUserFromDB(String(auth.user.ID));
  return (dbUser?.toObject?.() || auth.user) as IUpdateUserData;
}

export function sanitizeUniverseForViewer(universe: IUniverse, viewer: IUpdateUserData | null) {
  if (viewer && canEditUniverse(viewer, universe)) return universe;
  const { billingOwnerEmail: _owner, commerceAdmins: _admins, wallet: _wallet, ...publicUniverse } = universe;
  return publicUniverse;
}
