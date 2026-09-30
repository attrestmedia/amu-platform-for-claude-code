import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { listFriendships, mutateFriendship, searchUsersForFriends } from "libs/services/social/friends";
import { toUnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("q")) return searchUsersForFriends(request, user);
  return listFriendships(_data, user);
}

async function handlePOST(body: unknown, user: AuthenticatedUserType) {
  return mutateFriendship(toUnknownRecord(body), user);
}

export const GET = withAuth(handleGET, undefined, "friends:get");
export const POST = withAuth(handlePOST, undefined, "friends:post");
