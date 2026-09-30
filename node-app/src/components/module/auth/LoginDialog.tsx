"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";
import LoginModule from "./LoginModule";

export type LoginDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoginSuccess?: () => void;
  title?: string;
  description?: string;
};

/**
 * 프로젝트 전역 로그인 Dialog.
 * TopBar와 동일한 중앙 팝업(Dialog) 방식을 사용하며,
 * 로그인 완료 시 자동으로 닫힙니다.
 *
 * @example
 * const [loginOpen, setLoginOpen] = useState(false);
 * <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
 */
export default function LoginDialog({ open, onOpenChange, onLoginSuccess, title, description }: LoginDialogProps) {
  const { isLogged } = useAuthStore();

  // 로그인 완료 시 자동 닫기
  useEffect(() => {
    if (!open) return;
    if (isLogged()) onOpenChange(false);
  }, [open, isLogged, onOpenChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isLogged() && next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="break-keep min-w-[20rem] max-w-[25rem]">
        <DialogHeader>
          <DialogTitle className="sr-only">
            <Lang text={{ ko: "로그인 안내", en: "Login Guide" }} />
          </DialogTitle>
          <div className="flex flex-col gap-4 p-4 text-center">
            <DialogDescription className="text-lg text-block">
              <span className="flex-x-center text-2xl font-bold text-primary mb-2">
                {title || <Lang text={{ ko: "로그인이 필요해요.", en: "You need to log in." }} />}
              </span>
              {description || (
                <Lang text={{ ko: "로그인 후 모든 기능을 이용하세요!", en: "Log in to access all features." }} />
              )}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2">
          {open && (
            <LoginModule
              className="p-0 w-full"
              loginButtonClassName="w-full"
              loginButtonSize="lg"
              showLoginButton={true}
              useDrawer={false}
              onLoginSuccess={() => {
                onOpenChange(false);
                onLoginSuccess?.();
              }}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
