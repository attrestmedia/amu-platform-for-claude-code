"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@amu-labs/ui";
import { useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function EmailConsentModal({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!open) return null;

  const retry = async (provider: "google" | "kakao" | "naver") => {
    try {
      setBusy(provider);
      // 구글은 prompt=consent로 재동의 강제 가능. (카카오/네이버는 무시될 수 있으나 해가 되진 않음)
      await signIn(provider, {
        callbackUrl: window.location.pathname || "/",
        ...(provider === "google" ? { prompt: "consent" } : {}),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h2 className="text-xl font-semibold">이메일 동의가 필요합니다</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          소셜 로그인 시 이메일 제공에 동의하지 않으면 서비스 이용이 제한될 수 있어요. 아래 버튼 중 사용한 제공자를 눌러
          재동의를 진행해주세요.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Button disabled={busy === "google"} onClick={() => retry("google")}>
            Google 재동의
          </Button>
          <Button disabled={busy === "kakao"} onClick={() => retry("kakao")}>
            Kakao 재동의
          </Button>
          <Button disabled={busy === "naver"} onClick={() => retry("naver")}>
            Naver 재동의
          </Button>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={() => router.refresh()}>다시 시도</Button>
        </div>
      </div>
    </div>
  );
}
