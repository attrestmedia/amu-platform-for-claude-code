"use client";

import fetchClient from "libs/api/fetchClient";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button, dialog, type ButtonSizeType, type ButtonVariantType } from "@amu-labs/ui";
import { useAuthStore } from "store/auth";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { AMU_NATIVE_PUSH_TOKEN_STORAGE_KEY } from "utils/native";
import { useState } from "react";

type LogoutProps = {
  redirect?: string;
  variant?: ButtonVariantType;
  size?: ButtonSizeType;
  className?: string;
  icon?: React.ReactNode;
};

const Logout = ({ redirect, variant = "text", size = "md", className, icon }: LogoutProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { logout } = useAuthStore();
  const { status } = useSession();
  const isSocial = status === "authenticated";
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 명시된 redirect가 없으면 '/login?next=<현재페이지>'로 이동
  const current = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
  const dest = redirect || `/login?next=${encodeURIComponent(current)}`;

  const hardNavigate = (to: string) => {
    try {
      router.replace(to); // App Router 네비게이션
      router.refresh(); // 서버 컴포넌트 재요청
    } catch {
      window.location.assign(to); // 최후 수단
    }
  };

  const unregisterNativePushToken = async () => {
    if (typeof window === "undefined") return;

    let token = "";
    try {
      const raw = localStorage.getItem(AMU_NATIVE_PUSH_TOKEN_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { token?: string };
      token = String(parsed?.token || "").trim();
    } catch {
      return;
    }

    if (!token) return;

    try {
      const response = await fetch("/api/user/devices/push-token", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        logger.warn("[Logout] push token unregister failed", response.status);
      }
    } catch (error) {
      logger.warn("[Logout] push token unregister error", error);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await unregisterNativePushToken();

      if (isSocial) {
        // NextAuth(소셜) 세션 해제 + 즉시 이동
        await signOut({ redirect: true, callbackUrl: dest });
        // signOut이 redirect 처리(거의 실행되지 않지만 안전 가드)
        logout();
        return;
      }

      // WP-JWT 로그아웃 (쿠키 삭제)
      await fetchClient.post("/auth/logout", {}, { credentials: "include", loading: "global" }).catch((e) => {
        // 400 등은 쿠키가 없을 때도 발생 가능하기 때문에 무시
        if (e?.response?.status !== 400) throw e;
      });

      // 클라이언트 상태 정리
      logout();
      window.dispatchEvent(new Event("auth-changed")); // 구독중인 컴포넌트 갱신용

      // 반드시 이동/새로고침 실행
      hardNavigate(dest);
    } catch (error) {
      logger.error("로그아웃 오류:", error);
      void dialog.alert({ variant: "danger", message: "로그아웃 중 오류가 발생했습니다." });
      logout(); // 오류가 있어도 상태는 정리하고 로그인 화면으로 이동
      hardNavigate(dest);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <Button
      variant={icon ? "blank" : variant}
      size={size}
      onClick={handleLogout}
      className={cn("logout-button", className)}
      disabled={status === "loading" || isLoggingOut}
      loading={isLoggingOut}
    >
      {icon ? icon : "Logout"}
    </Button>
  );
};

export default Logout;
