"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Gamepad2, X } from "lucide-react";

// 닫기 상태는 사용자 설정(localStorage)에 기록해 재노출하지 않는다.
// 서버 사용자 설정 문서로 승격하는 것은 S9에서 결정한다(D10과 동일한 기준).
const FORGE_ONBOARDING_DISMISS_KEY = "amu-play-forge-onboarding-dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FORGE_ONBOARDING_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function ForgeOnboardingCard() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(FORGE_ONBOARDING_DISMISS_KEY, "1");
    } catch {
      // localStorage 사용 불가 시에도 메모리 상태로 닫힘 유지
    }
  };

  return (
    <div className="relative mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label={lang({ ko: "온보딩 카드 닫기", en: "Dismiss onboarding card" })}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-secondary-text hover:bg-surface-2 hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex flex-col items-center text-center">
        {/* 마스코트 일러스트: 전용 자산 확정 전까지 게임패드 글리프로 대체 */
        }
        <span aria-hidden className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Gamepad2 className="h-10 w-10" />
        </span>
        <h2 className="mt-3 text-[15px] font-bold">
          <Lang text={{ ko: "처음이신가요?", en: "New here?" }} />
        </h2>
        <p className="mt-1.5 text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "가이드를 따라 멋진 게임 세계를 만들어보세요!",
              en: "Follow the guide to build your own game world!",
            }}
          />
        </p>
        <Button className="mt-3 h-11 w-full rounded-[10px]" onClick={() => router.push("/assets-studio/character")}>
          <Lang text={{ ko: "가이드 시작하기", en: "Start the guide" }} />
        </Button>
      </div>
    </div>
  );
}
