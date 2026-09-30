import { useGlobalStore } from "store/global";
import type { LanguageType } from "types/language";
import { logger } from "../log";
import { DEFAULT_FANTASY_UNIVERSE } from "consts/app";

/**
 * @docHint
 * @purpose languageUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain i18n
 * @scope global
 */

// 현재 언어를 가져오는 헬퍼 함수
export const getCurrentLanguage = (): LanguageType => {
  try {
    return useGlobalStore.getState().language;
  } catch (error) {
    logger.warn("언어 설정을 가져오는데 실패했습니다. 기본값(en)을 사용합니다.", error);
    return "en"; // 기본값
  }
};

// language 코드를 해당 언어 문자열로 변환
export const toDisplayLang = (lang: LanguageType) => (lang === "ko" ? "한국어" : "English");

// NPC가 사용하는 언어를 문자열로 반환
export const normalizeNpcLanguage = (universeId: string, npcLanguage: string, userLang: LanguageType) => {
  if (universeId === DEFAULT_FANTASY_UNIVERSE) {
    // 가상 언어 → 사용자 현재 언어(사람이 읽는 명칭)로 고정
    return toDisplayLang(userLang);
  } else {
    return (npcLanguage ?? "").trim(); // NPC에 설정된 언어를 그대로 반환
  }
};
