import { useEffect } from "react";
import { useGlobalStore } from "store/global";
import type { LanguageType } from "types/language";
import { COOKIE_CONFIG } from "consts/token";
import Cookies from "js-cookie";

/**
 * @docHint
 * @purpose useLangDetection 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain i18n
 * @scope client
 */

export function useLangDetection() {
  const { language, setLanguage } = useGlobalStore();

  useEffect(() => {
    // 쿠키에서 언어 설정 가져오기
    const cookieLanguage = Cookies.get(COOKIE_CONFIG.LANGUAGE.name) as LanguageType | undefined;

    if (cookieLanguage && cookieLanguage !== language) {
      // 쿠키에 저장된 언어가 현재 스토어의 언어와 다르면 스토어 업데이트
      setLanguage(cookieLanguage);
    }

    // 언어 변경 시 HTML lang 속성도 업데이트 (접근성 및 SEO 향상)
    document.documentElement.lang = language;
  }, [language, setLanguage]);

  return { language };
}
