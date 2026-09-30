import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LanguageType } from "types/language";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain global
 * @scope global
 */

// 전역 스토어 타입 정의
interface GlobalState {
  // 테마 상태
  theme: string;
  setTheme: (theme: string) => void;

  // 언어 상태
  language: LanguageType;
  setLanguage: (language: LanguageType) => void;
}

// Zustand 스토어 생성 (persist 미들웨어로 새로고침 후에도 설정 유지)
const useGlobalStore = create<GlobalState>()(
  persist(
    (set) => ({
      // 테마 상태
      theme: "light",
      setTheme: (theme: string) => set({ theme }),

      // 언어 상태 (기본값: 한국어)
      language: "ko" as LanguageType,
      setLanguage: (language: LanguageType) => set({ language }),
    }),
    {
      name: "global-storage",
    }
  )
);

export default useGlobalStore;
