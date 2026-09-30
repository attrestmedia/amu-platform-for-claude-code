import Cookies from "js-cookie";
import { useGlobalStore } from "store/global";
import { useAuthStore } from "store/auth";
import { COOKIE_CONFIG } from "consts/token";
import type { LanguageType } from "types/language";
import { useUserData } from "hooks/auth/useUserData";
import { getClientCookieOptions } from "utils/common";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose useLangChange 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain i18n
 * @scope client
 */

export function useLangChange() {
  const { setLanguage } = useGlobalStore();
  const { user } = useAuthStore();
  const { userData, updateUserInfo } = useUserData();
  const isLoggedIn = useAuthStore((state) => state.isLogged());

  // 언어 변경 함수
  const changeLanguage = async (newLanguage: LanguageType) => {
    // 1. 스토어 업데이트
    setLanguage(newLanguage);

    // 2. HTML lang 속성 업데이트
    document.documentElement.lang = newLanguage;

    // 3. 쿠키 업데이트 (비로그인 사용자용): 30일 유효 => proxy.ts
    Cookies.set(COOKIE_CONFIG.LANGUAGE.name, newLanguage, getClientCookieOptions(COOKIE_CONFIG.LANGUAGE));

    // 4. 로그인한 사용자는 MongoDB에도 저장
    if (isLoggedIn && user?.id && userData?.userInfo) {
      try {
        // 현재 사용자 정보에 언어 설정 업데이트
        const updatedUserInfo = {
          ...userData.userInfo,
          language: newLanguage,
        };

        // API를 통해 업데이트
        await updateUserInfo(updatedUserInfo);
        logger.log(`사용자 언어 설정이 '${newLanguage}'로 업데이트되었습니다.`);
      } catch (error) {
        logger.error("언어 설정 저장 실패:", error);
      }
    }
  };

  return { changeLanguage };
}
