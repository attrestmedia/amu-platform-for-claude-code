import { useCallback, useMemo } from "react";
import type { IUniverse } from "types/game";
import { useUserData } from "hooks/auth";

/**
 * @docHint
 * @purpose useUniverseAdminAccess 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain auth
 * @scope global
 */

type AccessResult = {
  isAdministrator: boolean;
  canEditUniverse: (u: IUniverse) => boolean;
  editableUniverses: IUniverse[];
};

const normEmail = (s?: string) => (s ?? "").toLowerCase().trim();

export function useUniverseAdminAccess(universes: IUniverse[] | null | undefined): AccessResult {
  const { userData } = useUserData();
  const roles = userData?.roles || [];
  const email = userData?.userEmail || ""; // 기존 스키마/스토어 호환

  const isAdministrator = roles.includes("administrator");

  const canEditUniverse = useCallback(
    (u: IUniverse) => {
      // 1) 최고 관리자면 모두 허용
      if (isAdministrator) return true;

      // 2) editor 권한자: commerce 타입 + 등록된 관리자 이메일일 때 허용
      if (u.type === "commerce" && Array.isArray(u.commerceAdmins)) {
        const adminSet = new Set(u.commerceAdmins.map(normEmail));
        return !!email && (adminSet.has(normEmail(email)) || normEmail(u.billingOwnerEmail) === normEmail(email));
      }

      // 3) 그 외에는 허용 안 함
      return false;
    },
    [isAdministrator, email],
  );

  const editableUniverses = useMemo(() => {
    if (!Array.isArray(universes)) return [];
    if (isAdministrator) return universes; // 관리자: 전체
    return universes.filter(canEditUniverse);
  }, [universes, isAdministrator, canEditUniverse]);

  return { isAdministrator, canEditUniverse, editableUniverses };
}
