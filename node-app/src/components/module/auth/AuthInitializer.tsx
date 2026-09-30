"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "store/auth";
import { useGameCharacterStore } from "store/game";
import { checkAuth } from "hooks/auth";
import { logger } from "utils/log";
import { lang } from "components/module/i18n";
import { getResponseStatus } from "utils/common/typeUtils";
import {
  AMU_NATIVE_PUSH_TOKEN_EVENT,
  AMU_NATIVE_PUSH_TOKEN_STORAGE_KEY,
  type AmuNativePushTokenDetail,
} from "utils/native";
import PolicyReconsentGate from "./PolicyReconsentGate";

const AUTH_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const SESSION_EXPIRED_TOAST_ID = "auth-session-expired";

function getLoginRedirectUrl() {
  const current = `${window.location.pathname}${window.location.search}`;
  return `/login?next=${encodeURIComponent(current || "/")}`;
}

function showSessionExpiredToast() {
  toast.error(lang({ ko: "로그인 시간이 만료되었습니다.", en: "Your login session has expired." }), {
    id: SESSION_EXPIRED_TOAST_ID,
    description: lang({
      ko: "계속 이용하려면 다시 로그인해 주세요.",
      en: "Please sign in again to continue.",
    }),
    duration: 7000,
    position: "bottom-center",
    action: {
      label: lang({ ko: "로그인", en: "Sign in" }),
      onClick: () => {
        window.location.href = getLoginRedirectUrl();
      },
    },
  });
}

async function refreshAuthSession() {
  const response = await fetch("/api/auth/refresh", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const error: Error & { status?: number } = new Error(`auth refresh failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const { setAuth, updateTokenExp } = useAuthStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id || "");
  const clearSelectedCharacter = useGameCharacterStore((state) => state.clearSelectedCharacter);
  const pendingTokenRef = useRef<AmuNativePushTokenDetail | null>(null);
  const lastRegisteredRef = useRef<string>("");

  const registerNativePushToken = useCallback(
    async (detail: AmuNativePushTokenDetail | null) => {
      if (!detail || !isAuthenticated || !userId) return;

      const token = String(detail.token || "").trim();
      if (!token) return;

      const dedupeKey = `${userId}:${token}`;
      if (lastRegisteredRef.current === dedupeKey) return;

      try {
        const response = await fetch("/api/user/devices/push-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            token,
            platform: detail.platform || "unknown",
            appVersion: detail.appVersion || "",
            locale: detail.locale || "",
            timezone: detail.timezone || "",
          }),
        });

        if (!response.ok) {
          logger.warn("[AuthInitializer] native push token register failed", response.status);
          return;
        }

        lastRegisteredRef.current = dedupeKey;
        logger.log("[AuthInitializer] native push token registered");
      } catch (error) {
        logger.warn("[AuthInitializer] native push token register error", error);
      }
    },
    [isAuthenticated, userId],
  );

  useEffect(() => {
    const initAuth = async () => {
      // 저장된 인증 상태가 있는 경우 서버에 확인
      const wasAuthenticated = useAuthStore.getState().isAuthenticated;
      const data = await checkAuth();
      if (data && data.authenticated) {
        setAuth(true, data);
        logger.log("[AuthInitializer] 인증 상태 확인: 로그인됨", data?.user?.data?.user?.ID || data?.data?.user?.ID);
      } else {
        if (wasAuthenticated) showSessionExpiredToast();
        setAuth(false);
        logger.log("[AuthInitializer] 인증 상태 확인: 로그인되지 않음");
      }
      setIsAuthChecked(true);
    };

    initAuth();
  }, [setAuth]);

  useEffect(() => {
    if (!isAuthChecked || !isAuthenticated) return;

    let stopped = false;
    const runRefresh = async () => {
      try {
        const data = await refreshAuthSession();
        if (stopped) return;

        const newExp = data?.data?.tokenExp;
        if (typeof newExp === "number") updateTokenExp(newExp);
        logger.log("[AuthInitializer] 인증 토큰 자동 갱신 완료");
      } catch (error) {
        if (stopped) return;
        logger.warn("[AuthInitializer] 인증 토큰 자동 갱신 실패", error);
        const status = getResponseStatus(error);
        if (status === 401 || status === 403) {
          showSessionExpiredToast();
          setAuth(false);
        }
      }
    };

    const interval = window.setInterval(() => {
      void runRefresh();
    }, AUTH_REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void runRefresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAuthChecked, isAuthenticated, setAuth, updateTokenExp]);

  // 로그인 상태 변경 시 캐릭터 정보 초기화 추가
  useEffect(() => {
    // 인증 상태가 변경될 때 기존 캐릭터 선택 초기화
    const handleAuthChange = () => {
      logger.log("인증 상태 변경: 캐릭터 정보 초기화");
      clearSelectedCharacter();
    };

    // 글로벌 이벤트 리스너 등록
    window.addEventListener("auth-changed", handleAuthChange);

    return () => {
      window.removeEventListener("auth-changed", handleAuthChange);
    };
  }, [clearSelectedCharacter]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AMU_NATIVE_PUSH_TOKEN_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AmuNativePushTokenDetail;
      if (!parsed || typeof parsed !== "object") return;
      pendingTokenRef.current = parsed;
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onNativePushToken = (event: Event) => {
      const detail = (event as CustomEvent<AmuNativePushTokenDetail>).detail;
      if (!detail || typeof detail !== "object") return;

      pendingTokenRef.current = detail;

      try {
        localStorage.setItem(AMU_NATIVE_PUSH_TOKEN_STORAGE_KEY, JSON.stringify(detail));
      } catch {
        // ignore
      }

      void registerNativePushToken(detail);
    };

    window.addEventListener(AMU_NATIVE_PUSH_TOKEN_EVENT, onNativePushToken as EventListener);
    return () => {
      window.removeEventListener(AMU_NATIVE_PUSH_TOKEN_EVENT, onNativePushToken as EventListener);
    };
  }, [registerNativePushToken]);

  useEffect(() => {
    if (!isAuthChecked || !isAuthenticated) return;
    void registerNativePushToken(pendingTokenRef.current);
  }, [isAuthChecked, isAuthenticated, registerNativePushToken]);

  if (!isAuthChecked) {
    // 인증 확인 중 로딩 표시
    return null;
  }

  return (
    <>
      {children}
      <PolicyReconsentGate />
    </>
  );
}
