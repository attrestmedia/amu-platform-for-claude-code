"use client";

import { useState } from "react";
import { Button } from "@amu-labs/ui";
import { AmuSimbol, AmuLogo } from "@amu-labs/ui/icons/brand/amu";
import { Lang } from "components/module/i18n";
import { signIn } from "next-auth/react";
import { cn } from "utils/common";
import EmailLoginForm from "./EmailLoginForm";

type LoginProps = {
  redirect?: string;
  onLoginSuccess?: () => void;
};

/**
 * 소셜 로그인 우선 UI를 제공하는 Login 컴포넌트
 */
const Login = ({ redirect, onLoginSuccess }: LoginProps) => {
  const [showEmailForm, setShowEmailForm] = useState(false);

  // 이메일 폼으로 전환
  const handleShowEmailForm = () => {
    setShowEmailForm(true);
  };

  // 소셜 버튼으로 돌아가기
  const handleBackToSocial = () => {
    setShowEmailForm(false);
  };

  // 이메일 로그인 폼 표시 중이면 해당 컴포넌트 렌더링
  if (showEmailForm) {
    return <EmailLoginForm redirect={redirect} onLoginSuccess={onLoginSuccess} onBack={handleBackToSocial} />;
  }

  // 소셜 로그인 버튼들 렌더링
  return (
    <div className="space-y-3">
      {/* 구글 로그인 */}
      <Button
        variant="outline"
        size="lg"
        className={cn(
          "w-full",
          "bg-white hover:bg-gray-50",
          "ring-gray-300 dark:ring-white",
          "text-gray-700 font-medium",
          "flex items-center justify-center gap-2",
        )}
        onClick={() => signIn("google", { callbackUrl: redirect || "/", prompt: "consent" })}
      >
        {/* 구글 로고 SVG */}
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span>Google</span>
        <Lang text={{ ko: "Google로 로그인", en: "Login with Google" }} className="sr-only" />
      </Button>

      {/* 네이버 로그인 */}
      <Button
        size="lg"
        className={cn(
          "w-full",
          "bg-[#03C75A] hover:bg-[#02B350]",
          "text-white font-medium",
          "flex items-center justify-center gap-2",
        )}
        onClick={() => signIn("naver", { callbackUrl: redirect || "/" })}
      >
        {/* 네이버 로고 SVG */}
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#FFFFFF">
          <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
        </svg>
        <span>Naver</span>
        <Lang text={{ ko: "Naver로 로그인", en: "Login with Naver" }} className="sr-only" />
      </Button>

      {/* 카카오 로그인 */}
      <Button
        size="lg"
        className={cn(
          "w-full",
          "bg-[#FEE500] hover:bg-[#FDD835]",
          "text-[#000000] font-medium",
          "flex items-center justify-center gap-2",
        )}
        onClick={() => signIn("kakao", { callbackUrl: redirect || "/" })}
      >
        {/* 카카오 로고 SVG */}
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#000000">
          <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.7 1.68 5.1 4.32 6.54-.18.66-.66 2.4-.78 2.82-.12.48.18.48.36.36.18-.12 2.64-1.8 3.06-2.1.66.12 1.38.18 2.04.18 5.52 0 10-3.48 10-7.8S17.52 3 12 3z" />
        </svg>
        <span>Kakao</span>
        <Lang text={{ ko: "Kakao로 로그인", en: "Login with Kakao" }} className="sr-only" />
      </Button>

      {/* 구분선 */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-input" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 text-primary-text/60">
            <Lang text={{ ko: "또는", en: "OR" }} />
          </span>
        </div>
      </div>

      {/* AllMyUniverse 로그인 */}
      <Button size="lg" className="flex gap-2 w-full" onClick={handleShowEmailForm}>
        <AmuSimbol className="w-6 h-6" />
        <AmuLogo className="relative top-[2px] w-16 h-6" />
        <Lang text={{ ko: "All My Universe로 로그인", en: "Login with All My Universe" }} className="sr-only" />
      </Button>
    </div>
  );
};

export default Login;
