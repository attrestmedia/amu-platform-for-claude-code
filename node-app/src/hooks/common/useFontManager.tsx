"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useGlobalStore } from "store/global";
import { DEFAULT_FANTASY_UNIVERSE } from "consts/app";
import { escapeRegExp } from "utils/normalize";

/**
 * @docHint
 * @purpose useFontManager 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain ui-theme
 * @scope client
 */

export function useFontManager() {
  const pathname = usePathname();
  const language = useGlobalStore((state) => state.language);

  useEffect(() => {
    // 언어 변경 시 document.documentElement.lang 동기화
    if (document.documentElement.lang !== language) {
      document.documentElement.lang = language;
    }

    // 유니버스별 전용 폰트 적용
    const fantasyId = String(DEFAULT_FANTASY_UNIVERSE || "").trim();
    const isFantasy = !!fantasyId && new RegExp(`^\\/${escapeRegExp(fantasyId)}(\\/|$)`).test(pathname);

    if (isFantasy) {
      const fontFamily = language.startsWith("ko") ? `"Stylish", sans-serif` : `"Boogaloo", sans-serif`;

      Object.assign(document.body.style, {
        fontFamily,
        fontWeight: "400",
        fontStyle: "normal",
      });
    } else {
      // 기본 폰트로 복원
      document.body.style.fontFamily = "";
      document.body.style.fontWeight = "";
      document.body.style.fontStyle = "";
    }
  }, [pathname, language]);
}
