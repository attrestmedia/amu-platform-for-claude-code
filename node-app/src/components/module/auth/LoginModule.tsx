"use client";

import React, { useMemo, useState } from "react";
import { Button, type ButtonSizeType, Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import Login from "./Login";
import Logout from "./Logout";
import { useAuthStore } from "store/auth";
import { useAuthCheck } from "hooks/auth";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { resolveSafeReturnTo } from "utils/payment";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

type LoginModuleProps = {
  redirect?: string;
  className?: string;
  loginButtonClassName?: string;
  loginButtonSize?: ButtonSizeType;
  loginNoticeTitle?: string;
  loginNoticeDescription?: string;
  loginNoticeClassName?: string;
  onLoginSuccess?: () => void;
  onLoginClick?: () => void;
  showLoginButton?: boolean;
  showAuthenticatedContent?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  useDrawer?: boolean;
};

const LoginModule = ({
  redirect = "",
  className,
  loginButtonClassName,
  loginButtonSize,
  loginNoticeTitle,
  loginNoticeDescription,
  loginNoticeClassName,
  onLoginSuccess,
  onLoginClick,
  showLoginButton = false,
  showAuthenticatedContent = true,
  onOpenChange,
  isOpen,
  useDrawer = true,
}: LoginModuleProps) => {
  useAuthCheck();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { isLogged } = useAuthStore();
  const [isLocalDrawerOpen, setLocalDrawerOpen] = useState(false);

  const isDrawerOpen = isOpen !== undefined ? isOpen : isLocalDrawerOpen;
  const setDrawerOpen = (value: boolean) => {
    if (onOpenChange) onOpenChange(value);
    else setLocalDrawerOpen(value);
  };

  const current = useMemo(() => {
    const q = searchParams?.toString();
    return pathname + (q ? `?${q}` : "");
  }, [pathname, searchParams]);

  // redirect 우선순위 처리
  const effectiveRedirect = useMemo(() => {
    const fromProp = resolveSafeReturnTo(redirect, { fallback: "" });
    const fromNext = resolveSafeReturnTo(searchParams?.get("next"), { fallback: "" });
    const fromCb = resolveSafeReturnTo(searchParams?.get("callbackUrl"), { fallback: "" });
    const fallback = pathname === "/login" ? "/" : resolveSafeReturnTo(current, { fallback: "" }) || "/";
    return fromProp || fromNext || fromCb || fallback;
  }, [redirect, searchParams, pathname, current]);

  const handleLoginClick = () => {
    onLoginClick?.();
    logger.log("login test");
  };

  const handleLoginSuccess = () => {
    // auth 스토어 갱신은 EmailLoginForm에서 수행하므로 여기서는 UI 전환만 처리한다.
    // 외부 콜백이 있으면 외부에서 처리
    if (onLoginSuccess) {
      onLoginSuccess();
    } else {
      // "/login" 페이지에서 "next로 이동" 기본 동작 제공
      if (pathname === "/login" && effectiveRedirect && effectiveRedirect !== current) {
        router.replace(effectiveRedirect);
        router.refresh();
      }
    }
    setDrawerOpen(false);
  };

  const renderAuthenticatedContent = () =>
    showAuthenticatedContent && (
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <p>
          <Lang text={{ ko: "환영합니다! 로그인 상태입니다.", en: "Welcome! You are logged in." }} />
          <br />
          <Lang text={{ ko: "잠시만 기다려 주세요.", en: "please wait for a moment." }} />
        </p>
        <Logout redirect={`/login?next=${encodeURIComponent(effectiveRedirect || "/")}`} />
      </div>
    );

  const renderLoginForm = () => <Login redirect={effectiveRedirect} onLoginSuccess={handleLoginSuccess} />;

  if (!useDrawer) {
    return <div className={className}>{isLogged() ? renderAuthenticatedContent() : renderLoginForm()}</div>;
  }

  return (
    <div className={cn("flex justify-end", className)}>
      {isLogged() ? (
        renderAuthenticatedContent()
      ) : (
        <div>
          <Drawer open={isDrawerOpen} onOpenChange={setDrawerOpen}>
            {showLoginButton && (
              <DrawerTrigger asChild>
                <Button
                  {...(loginButtonClassName && { className: loginButtonClassName })}
                  size={loginButtonSize ?? "md"}
                  onClick={handleLoginClick}
                >
                  <Lang text={{ ko: "로그인", en: "Log in" }} />
                </Button>
              </DrawerTrigger>
            )}
            <DrawerContent className="max-w-[25rem] rounded-t-[1.5rem] mx-auto">
              <DrawerHeader className="sr-only">
                <DrawerTitle className="text-left">
                  <Lang text={{ ko: "로그인", en: "Log in" }} />
                </DrawerTitle>
              </DrawerHeader>
              <DrawerDescription className="sr-only">
                <Lang text={{ ko: "로그인을 해주세요.", en: "Please log in." }} />
              </DrawerDescription>
              <div className="p-4">
                {loginNoticeTitle && loginNoticeTitle !== "" && (
                  <div className={cn("relative mb-6 pt-5 pb-2 rounded-2xl text-center", loginNoticeClassName)}>
                    {/* 아이콘 */}
                    <div className="relative flex justify-center mb-3">
                      <div className="p-3 rounded-full bg-primary/15 ring-4 ring-primary/5">
                        <Lock className="w-5 h-5 text-primary" />
                      </div>
                    </div>

                    {/* 메시지 텍스트 */}
                    <p className="relative text-base font-semibold text-foreground/90">{loginNoticeTitle}</p>
                    <p className="relative mt-1 text-xs text-muted-foreground">
                      {loginNoticeDescription ? (
                        loginNoticeDescription
                      ) : (
                        <Lang text={{ ko: "간편하게 로그인하고 계속 진행하세요", en: "Sign in easily to continue" }} />
                      )}
                    </p>
                  </div>
                )}
                {renderLoginForm()}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      )}
    </div>
  );
};

export default LoginModule;
