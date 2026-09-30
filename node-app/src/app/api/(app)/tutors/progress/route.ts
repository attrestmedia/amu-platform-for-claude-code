import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getPersonaActorId } from "libs/server-utils/persona/personaPolicy";
import { getTutorProgressOverview } from "libs/database/tutors";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth/userRoles";

async function getHandler(_data: unknown, user: AuthenticatedUserType) {
  const actorId = getPersonaActorId(user);
  if (!actorId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const isAdmin = getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
  const progress = await getTutorProgressOverview(actorId, { isAdmin });
  return NextResponse.json({ ok: true, data: progress });
}

export const GET = withAuth(getHandler, undefined, "tutors/progress:get");
