import { create } from "zustand";
import { persist } from "zustand/middleware";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain auth
 * @scope client-store
 */

interface IAuthState {
  isAuthenticated: boolean;
  user: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
  tokenExp: number | null; // 서버가 내려주는 exp만 저장
  hasHydrated: boolean;
  setHydrated: (hydrated: boolean) => void; // 하이드레이션 상태 설정을 위한 액션
  setAuth: (authenticated: boolean, userData?: unknown) => void;
  logout: () => void;
  isLogged: () => boolean;
  updateTokenExp: (exp: number | null) => void; // exp만 갱신
}

export const useAuthStore = create<IAuthState>()(
  persist(
    (set, get) => ({
      // 초기값
      isAuthenticated: false,
      user: null,
      tokenExp: null,
      hasHydrated: false,

      // 하이드레이션 상태 설정 액션
      setHydrated: (hydrated) => {
        const currentState = get();
        if (currentState.hasHydrated !== hydrated) {
          logger.log("Auth store 하이드레이션 상태 변경:", hydrated);
          set({ hasHydrated: hydrated });
        }
      },

      setAuth: (authenticated, payload = null) => {
        const current = get();

        // 서버 응답의 다양한 케이스를 유연하게 처리
        const p = toUnknownRecord(payload);
        const pData = toUnknownRecord(p.data);
        const pUser = toUnknownRecord(p.user);
        const pUserData = toUnknownRecord(pUser.data);
        const wpUser =
          toUnknownRecord(pUserData.user) ??
          toUnknownRecord(pData.user) ??
          toUnknownRecord(pData.userData) ?? // 혹시 모를 다른 키
          null;

        const wpUserHasFields = wpUser && (wpUser.ID || wpUser.display_name || wpUser.user_email);
        const minimalUserData = wpUserHasFields
          ? {
              id: typeof wpUser.ID === "string" || typeof wpUser.ID === "number" ? String(wpUser.ID) : undefined,
              name: typeof wpUser.display_name === "string" ? wpUser.display_name : undefined,
              email: typeof wpUser.user_email === "string" ? wpUser.user_email : undefined,
            }
          : null;

        // tokenExp만 읽어 반영
        const tokenExpFromServer: number | null = typeof pData.tokenExp === "number" ? (pData.tokenExp as number) : null;

        // 비인증 전환 시 무조건 user/tokenExp 초기화
        if (!authenticated) {
          if (current.isAuthenticated || current.user || current.tokenExp) {
            logger.log("Auth 로그아웃/만료에 따른 상태 초기화");
          }
          set({ isAuthenticated: false, user: null, tokenExp: null });
          return;
        }

        const shouldUpdate =
          current.isAuthenticated !== authenticated ||
          current.user?.id !== minimalUserData?.id ||
          (tokenExpFromServer !== null && current.tokenExp !== tokenExpFromServer);

        if (shouldUpdate) {
          logger.log("Auth 상태 업데이트:", {
            authenticated,
            userId: minimalUserData?.id,
            tokenExp: tokenExpFromServer ?? current.tokenExp,
          });

          set({
            isAuthenticated: authenticated,
            user: minimalUserData,
            tokenExp: tokenExpFromServer ?? current.tokenExp ?? null,
          });
        }
      },

      updateTokenExp: (exp) => {
        logger.log("tokenExp 갱신:", exp);
        set({ tokenExp: typeof exp === "number" ? exp : null });
      },

      logout: () => {
        logger.log("로그아웃 처리");
        set({ isAuthenticated: false, user: null, tokenExp: null });
      },

      // 서버 세션 방식으로 변경하고 판단 기준 완화
      isLogged: () => Boolean(get().hasHydrated && get().isAuthenticated && get().user?.id),
    }),
    {
      name: "amu-auth-store",
      // onRehydrateStorage에서 set 함수를 사용
      onRehydrateStorage: () => (state) => {
        // 즉시 하이드레이션 상태 설정
        if (state) {
          state.setHydrated(true);
          logger.log("Auth store 하이드레이션 완료");
        }
      },
    },
  ),
);
