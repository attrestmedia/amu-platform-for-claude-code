import { useCallback, useEffect, useRef, useMemo } from "react";
import { useAuthStore } from "store/auth";
import { useUserDataStore } from "store/game/userDataStore";

/**
 * @docHint
 * @purpose useUserData 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain auth
 * @scope global
 */

export const useUserData = () => {
  const { isLogged, user } = useAuthStore();
  const userData = useUserDataStore((state) => state.userData);
  const isLoading = useUserDataStore((state) => state.isLoading);
  const isReady = useUserDataStore((state) => state.isReady);
  const error = useUserDataStore((state) => state.error);
  const fetchUserData = useUserDataStore((state) => state.fetchUserData);
  const updateUserData = useUserDataStore((state) => state.updateUserData);
  const updatePersona = useUserDataStore((state) => state.updatePersona);
  const updateLastAccessedUniverse = useUserDataStore((state) => state.updateLastAccessedUniverse);
  const refetchUserData = useUserDataStore((state) => state.refetchUserData);
  const updateUserInfo = useUserDataStore((state) => state.updateUserInfo);
  const updateSelectedPersona = useUserDataStore((state) => state.updateSelectedPersona);
  const initializeUserPersonas = useUserDataStore((state) => state.initializeUserPersonas);
  const checkCharacterAvailable = useUserDataStore((state) => state.checkCharacterAvailable);
  const isCacheValid = useUserDataStore((state) => state.isCacheValid);
  const getPersonaData = useUserDataStore((state) => state.getPersonaData);
  const getPersonaType = useUserDataStore((state) => state.getPersonaType);
  const getTotalPersonaCount = useUserDataStore((state) => state.getTotalPersonaCount);
  const getUnlockedPersonaCount = useUserDataStore((state) => state.getUnlockedPersonaCount);
  const fetchPersonasData = useUserDataStore((state) => state.fetchPersonasData);
  const getCachedPersonasData = useUserDataStore((state) => state.getCachedPersonasData);
  const batchCheckCharacterAvailable = useUserDataStore((state) => state.batchCheckCharacterAvailable);

  // 권한 관련 값들만 메모이제이션 (자주 계산되는 값들)
  const userPermissions = useMemo(
    () => ({
      isFreeUser: userData?.accountType === "free",
      isProUser: userData?.accountType === "pro",
      isPremiumUser: userData?.accountType === "premium",
      isEnterpriseUser: userData?.accountType === "enterprise",
      isAdministrator: userData?.roles?.includes("administrator"),
    }),
    [userData?.accountType, userData?.roles],
  );

  // 유저 정보 온보딩 완료 체크
  const isOnboarded = useMemo(() => {
    const u = userData?.userInfo;
    return !!(u?.name && u?.birthdate); // 필요 시 gender 등 추가
  }, [userData?.userInfo]);

  // 중복 호출 방지를 위한 ref
  const isInitializingRef = useRef(false);

  // uid 기반 데이터 페칭 함수 래핑
  const fetchUserDataWrapper = useCallback(
    async (uid: string) => {
      return fetchUserData(uid);
    },
    [fetchUserData],
  );

  // 사용자 데이터 강제 새로고침
  const refetchUserDataWrapper = useCallback(async () => {
    if (isLogged() && user?.id) {
      return refetchUserData(user.id);
    }
    return null;
  }, [isLogged, user, refetchUserData]);

  // personas 데이터를 가져오는 래퍼 함수
  const getPersonasForUniverse = useCallback(
    async (universe: string, type: "personas" | "userPersonas" = "userPersonas") => {
      // 먼저 캐시 확인
      const cached = getCachedPersonasData(universe, type);
      if (cached) return cached;

      // 캐시가 없으면 API 호출
      return await fetchPersonasData(universe, type);
    },
    [fetchPersonasData, getCachedPersonasData],
  );

  // 컴포넌트 마운트/인증 변경 시 사용자 데이터 로드
  useEffect(() => {
    // 이미 초기화 중이거나, 로그인되지 않았거나, 이미 데이터가 있고 캐시가 유효한 경우 스킵
    if (isInitializingRef.current || !isLogged() || !user?.id) {
      return;
    }

    // 이미 유효한 데이터가 있으면 스킵
    if (userData && isCacheValid()) {
      return;
    }

    async function loadUserData() {
      if (isInitializingRef.current) return;

      isInitializingRef.current = true;

      try {
        if (user?.id) {
          await fetchUserData(user.id);
        }
      } catch (error) {
        console.warn("useUserData에서 사용자 데이터 로드 실패:", error);
      } finally {
        isInitializingRef.current = false;
      }
    }

    loadUserData();
  }, [isLogged, user?.id, userData, isCacheValid, fetchUserData]);

  return {
    userData,
    isLoading,
    isReady,
    error,
    isOnboarded,
    fetchUserData: fetchUserDataWrapper,
    updateUserData,
    updatePersona,
    updateLastAccessedUniverse,
    refetchUserData: refetchUserDataWrapper,
    updateUserInfo,
    updateSelectedPersona,
    initializeUserPersonas,
    checkCharacterAvailable,
    getPersonaData,
    getPersonaType,
    getTotalPersonaCount,
    getUnlockedPersonaCount,
    getPersonasForUniverse,
    batchCheckCharacterAvailable,
    getCachedPersonasData,
    fetchPersonasData,
    ...userPermissions,
  };
};
