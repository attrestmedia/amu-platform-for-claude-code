import { useEffect, useRef } from "react";
import { useAuthStore } from "store/auth";
import { useUserDataStore } from "store/game/userDataStore";
import { logger } from "utils/log";
import { secondsUntilExp } from "utils/ai";
import fetchClient from "libs/api/fetchClient";
import { TOKEN_REFRESH_THRESHOLD_SEC } from "consts/token";
import { trackGaEvent } from "utils/analytics/ga4";
import {
  getResponseStatus,
  isUnknownRecord,
  toUnknownRecord,
  type UnknownRecord,
} from "utils/common/typeUtils";

// 서버 응답이 `data?.user?.data?.user?.ID`처럼 깊은 체인으로 노출되어, 외부 호출자들이 다단계로 접근.
// any 사용을 피하면서 재귀 인덱스로 동일한 deep-chain 접근을 허용한다.
export type AuthCheckResponseType = {
  authenticated: boolean;
  tokenExp?: number | null;
  user?: AuthCheckResponseType;
  data?: AuthCheckResponseType;
  ID?: string | number;
  [key: string]: AuthCheckResponseType | boolean | number | string | null | undefined;
};

type AuthRefreshResponseType = {
  data?: { tokenExp?: number | null } & UnknownRecord;
} & UnknownRecord;

/**
 * @docHint
 * @purpose useAuthCheck 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain auth
 * @scope global
 */

export const checkAuth = async (): Promise<AuthCheckResponseType> => {
  try {
    const out = await fetchClient.get<AuthCheckResponseType>("/auth/me", { responseType: "auto" });
    const data = out.data;
    if (!isUnknownRecord(data)) {
      logger.error("잘못된 응답 형식: JSON이 아님");
      return { authenticated: false };
    }
    logger.log("checkAuth => ", data);
    if (toUnknownRecord(data.data).signupCompleted === true) {
      trackGaEvent("signup_complete", {
        registration_source: String(toUnknownRecord(data.data).registrationSource || "auth_me"),
      });
    }
    return data as AuthCheckResponseType;
  } catch (error: unknown) {
    if (getResponseStatus(error) === 401) {
      logger.log("인증되지 않은 사용자");
      return { authenticated: false };
    }
    logger.error("인증 확인 오류:", error);
    return { authenticated: false };
  }
};

const REFRESH_THRESHOLD_SEC = TOKEN_REFRESH_THRESHOLD_SEC; // 임계치: 만료 2시간 전부터 갱신 시도
const SAFETY_MARGIN_SEC = 5 * 60; // 만료 5분 전 강제 재시도(네트워크 지연 대비)

export const useAuthCheck = () => {
  const { setAuth, user, hasHydrated, updateTokenExp, isAuthenticated } = useAuthStore();
  const { fetchUserData, userData, isCacheValid } = useUserDataStore();

  const isCheckingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const scheduleOrRefresh = useRef(async () => {
    const currentExp = useAuthStore.getState().tokenExp;
    if (!currentExp) return;

    const left = secondsUntilExp(currentExp);
    logger.log(`JWT 남은 시간(초): ${left}`);

    // 임계치 이내면 즉시 리프레시(슬라이딩 쿠키 갱신)
    if (left > 0 && left <= REFRESH_THRESHOLD_SEC) {
      try {
        logger.log("만료 임박 → 즉시 토큰 갱신 시도");
        const out = await fetchClient.get<AuthRefreshResponseType>("/auth/refresh", { responseType: "auto" });
        const refreshPayload = toUnknownRecord(out.data?.data);

        // exp만 갱신
        const newExp = refreshPayload.tokenExp ?? null;
        if (typeof newExp === "number") {
          updateTokenExp(newExp);
          logger.log("tokenExp 자동 갱신 성공:", newExp);
        } else {
          logger.warn("리프레시: tokenExp 부재");
        }
      } catch (err) {
        logger.error("토큰 자동 갱신 실패:", err);
        setAuth(false);
      }
    }

    // 다음 갱신 타이머 예약
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const nextLeft = secondsUntilExp(useAuthStore.getState().tokenExp);
    if (nextLeft > 0) {
      const target = Math.max(nextLeft - REFRESH_THRESHOLD_SEC, SAFETY_MARGIN_SEC);
      refreshTimerRef.current = setTimeout(() => {
        scheduleOrRefresh.current();
      }, target * 1000);
      logger.log(`다음 자동 갱신 예약: ${target}초 후`);
    }
  });

  useEffect(() => {
    if (!hasHydrated) {
      logger.log("하이드레이션 대기 중...");
      return;
    }
    if (hasInitializedRef.current || isCheckingRef.current) {
      logger.log("인증 체크 스킵 - 이미 초기화됨 또는 진행 중");
      return;
    }
    if (user?.id && userData && isCacheValid()) {
      logger.log("인증 체크 스킵 - 이미 유효한 데이터 존재");
      hasInitializedRef.current = true;
      scheduleOrRefresh.current();
      return;
    }

    async function runCheckAuth() {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;
      logger.log("인증 체크 시작");

      try {
        const data = await checkAuth();

        if (data && data.authenticated) {
          // 서버 원본(data) 전체를 넘겨서 tokenExp 반영
          setAuth(true, data);

          // 캐시 로드 — 서버 응답의 깊은 체인 `data.user.data.user.ID`에서 추출
          const rawId = data.user?.data?.user?.ID;
          const uid = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
          if (uid && !isCacheValid()) {
            try {
              logger.log("사용자 데이터 로드 시작:", uid);
              await fetchUserData(uid);
              logger.log("사용자 데이터 로드 완료");
            } catch (error) {
              logger.warn("사용자 데이터 로드 실패:", error);
            }
          }

          scheduleOrRefresh.current();
        } else {
          setAuth(false);
        }

        hasInitializedRef.current = true;
      } catch (error) {
        logger.error("인증 체크 실행 오류:", error);
        setAuth(false);
      } finally {
        isCheckingRef.current = false;
      }
    }

    runCheckAuth();
    // hasInitializedRef로 1회성 초기화를 강제하므로 의도적으로 hasHydrated만 의존.
    // setAuth/fetchUserData/isCacheValid는 Zustand store에서 가져온 안정 참조이고,
    // user?.id/userData를 추가하면 인증 직후 의도치 않게 재실행됨.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  useEffect(() => {
    // 인증 해제되면 예약된 타이머 클리어
    if (!isAuthenticated && refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      logger.log("인증 해제됨 → 리프레시 타이머 해제");
    }
  }, [isAuthenticated]);
};
