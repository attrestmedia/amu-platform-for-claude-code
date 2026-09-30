import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getSharedTutorProgressForOwner } from "libs/services/tutors/sharedTutorProgress";

export const runtime = "nodejs";

async function getHandler(data: unknown, user: AuthenticatedUserType) {
  return getSharedTutorProgressForOwner(data, user);
}

export const GET = withAuth(getHandler, undefined, "tutors/progress/shared:get");
