"use client";

import { useRef, useState } from "react";
import fetchClient from "libs/api/fetchClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { logger } from "utils/log";
import { extractApiErrorMessage } from "utils/common";
import { checkAuth } from "hooks/auth";
import { useAuthStore } from "store/auth";

type EmailLoginFormProps = {
  redirect?: string;
  onLoginSuccess?: () => void;
  onBack?: () => void; // 뒤로가기 콜백
};

// 이메일/비밀번호 로그인 폼: AllMyUniverse 계정으로 로그인
const EmailLoginForm = ({ redirect, onLoginSuccess, onBack }: EmailLoginFormProps) => {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const password = passwordInputRef.current?.value || "";

    try {
      const response = await fetchClient.post("/auth/login", { email, password }, {
        credentials: "include",
        loading: "global",
      });

      logger.log("Login response => ", response);

      if (response.status === 200) {
        setIsLoading(false);
        if (passwordInputRef.current) passwordInputRef.current.value = "";
        // 로그인 성공 즉시 auth 스토어를 갱신해 새로고침 없이 헤더 등 로그인 UI가 전환되도록 한다.
        void (async () => {
          const data = await checkAuth();
          if (data?.authenticated) {
            setAuth(true, data);
            window.dispatchEvent(new Event("auth-changed"));
          }
        })();
        if (onLoginSuccess) onLoginSuccess();
        router.replace(redirect || "/");
      }
    } catch (error: unknown) {
      const message = extractApiErrorMessage(error, lang({ ko: "알 수 없는 오류", en: "Unknown error" }));
      logger.error("로그인 오류:", message);
      void dialog.alert({ variant: "danger", message: lang({ ko: "로그인 실패: ", en: "Login failed: " }) + message });
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 로그인 폼 */}
      <form onSubmit={handleLogin} className="space-y-3">
        <label htmlFor="USER_ID" className="sr-only">
          <Lang text={{ ko: "이메일", en: "Email" }} />
        </label>
        <Input
          type="email"
          id="USER_ID"
          placeholder={lang({ ko: "이메일", en: "Email" })}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <label htmlFor="USER_PASSWORD" className="sr-only">
          <Lang text={{ ko: "비밀번호", en: "Password" }} />
        </label>
        <Input
          type="password"
          id="USER_PASSWORD"
          placeholder={lang({ ko: "비밀번호", en: "Password" })}
          ref={passwordInputRef}
          autoComplete="current-password"
          allowPasswordReveal
          required
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Lang text={{ ko: "비밀번호를 잊으셨나요?", en: "Forgot your password?" }} />
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isLoading} loading={isLoading}>
          <Lang text={{ ko: "로그인", en: "Log in" }} />
        </Button>
      </form>

      <div className="flex items-center justify-center gap-2 mt-4">
        {/* 뒤로가기 버튼 */}
        {onBack && (
          <Button variant="link" size="sm" className="text-gray-600" onClick={onBack}>
            <Lang text={{ ko: "돌아가기", en: "Back" }} />
          </Button>
        )}

        {/* 회원가입 버튼 */}
        <Button
          variant="link"
          size="sm"
          className="text-gray-600"
          onClick={() => {
            router.push(`/signup?next=${encodeURIComponent(redirect || "/")}`);
          }}
        >
          <Lang text={{ ko: "회원가입", en: "Sign up" }} />
        </Button>
      </div>
    </div>
  );
};

export default EmailLoginForm;
