import type { IUniverse } from "types/game";
import { toUnknownRecord, pickArray, pickString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose permessionUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain auth
 * @scope client
 */

export function canEditUniverseClient(userData: unknown, universe?: IUniverse): boolean {
  if (!userData) return false;

  const user = toUnknownRecord(userData);
  const userRoles = pickArray<unknown>(user.roles).filter((r): r is string => typeof r === "string");

  // 1. administrator는 모든 유니버스 편집 가능
  if (userRoles.includes("administrator")) {
    return true;
  }

  // 2. editor 권한이 없으면 편집 불가
  if (!userRoles.includes("editor")) {
    return false;
  }

  // 3. universe 정보가 없으면 기본 접근 권한만 체크
  if (!universe) {
    return true;
  }

  // 4. commerce 타입이 아니면 editor는 편집 불가
  if (universe.type !== "commerce") {
    return false;
  }

  // 5. commerce 타입이고 해당 유니버스의 관리자로 등록된 경우만 편집 가능
  const userEmail = pickString(user.userEmail);

  if (!userEmail) {
    console.warn("사용자 이메일 정보를 찾을 수 없습니다:", userData);
    return false;
  }

  return universe.commerceAdmins?.includes(userEmail) || false;
}
