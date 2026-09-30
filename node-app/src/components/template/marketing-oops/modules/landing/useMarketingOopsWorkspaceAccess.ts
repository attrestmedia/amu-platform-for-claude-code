"use client";

import { useEffect, useState } from "react";
import { getUniverseList } from "libs/api/universe";
import { useUniverseAdminAccess } from "hooks/admin";
import { useAuthStore } from "store/auth";
import type { IUniverse } from "types/game";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 공개 랜딩 CTA를 권한 3분기(비로그인 / 로그인·무권한 / 운영 권한)로 나누기 위한 표시 판정
 * @process 로그인 여부 확인 → 유니버스 목록 조회 → useUniverseAdminAccess로 편집 가능 유니버스 계산
 * @domain marketing
 * @scope marketing-oops
 *
 * 워크스페이스 셸(MarketingOperationsShell)이 쓰는 것과 동일한 판정 로직이라
 * 랜딩에 표시한 CTA와 실제 진입 결과가 어긋나지 않는다.
 *
 * 주의: 이것은 표시 최적화일 뿐이며 권한의 권위가 아니다.
 * /workspace·/connections의 서버 권한 검사는 그대로 유지된다.
 * 조회 실패 시 universes가 빈 배열로 남아 자동으로 비권한 분기로 폴백한다(fail-safe).
 */
export function useMarketingOopsWorkspaceAccess() {
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const [universes, setUniverses] = useState<IUniverse[]>([]);
  const { isAdministrator, editableUniverses } = useUniverseAdminAccess(universes);

  useEffect(
    function loadUniversesForCtaBranch() {
      if (!isLoggedIn) return;

      async function fetchUniverses() {
        try {
          setUniverses(await getUniverseList({ enabledOnly: false, sortByOrder: true }));
        } catch (error) {
          // 랜딩 CTA 분기용 조회 — 실패해도 화면은 비권한 분기로 정상 동작한다
          logger.error("유니버스 목록 조회 실패:", error);
        }
      }

      void fetchUniverses();
    },
    [isLoggedIn],
  );

  return {
    isLoggedIn,
    canOpenWorkspace: isLoggedIn && (isAdministrator || editableUniverses.length > 0),
  };
}
