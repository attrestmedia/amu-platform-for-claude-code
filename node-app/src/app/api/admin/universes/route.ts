import { NextResponse } from "next/server";
import { getUniverses } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";

/**
 * @docHint
 * @purpose 로그인 사용자가 관리할 수 있는 유니버스의 안전한 내비게이션 목록 조회
 * @process 인증 사용자 병합  서버 권한 검증  허용 유니버스 필터링  최소 필드 반환
 * @domain auth
 * @scope admin-api
 */

async function handleGET(_data: unknown, user: AuthenticatedUserType) {
  const universes = await getUniverses({ enabledOnly: false, sortByOrder: true });
  const accessibleUniverses = universes.filter((universe) => canEditUniverse(user, universe));

  return NextResponse.json({
    success: true,
    data: accessibleUniverses.map((universe) => ({
      id: universe.id,
      name: universe.name,
      type: universe.type,
    })),
  });
}

export const GET = withAuth(handleGET, undefined, "admin/universes:get", { bodyParser: "none" });
