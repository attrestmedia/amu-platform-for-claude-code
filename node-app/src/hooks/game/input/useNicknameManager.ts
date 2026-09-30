import { useCallback, useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useUserData } from "hooks/auth";
import { useUniverseData } from "../core";
import type { IExtendedNpcData } from "types/game";
import type { IPersonaItem } from "types/ai";
import { useAuthStore } from "store/auth";
import { lang } from "components/module/i18n";
import { logger } from "utils/log";
import { getDisplayName as getUserPersonaDisplayName, hasNickname as checkHasNickname } from "utils/game";

/**
 * @docHint
 * @purpose useNicknameManager 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-persona
 * @scope universe
 */

interface UseNicknameManagerResult {
  // 별명 저장
  saveNickname: (characterId: string, nickname: string) => Promise<void>;

  // 캐릭터의 현재 별명 가져오기
  getNickname: (characterId: string) => Promise<string | undefined>;

  // 캐릭터의 표시용 이름 가져오기 (별명 우선) - 동기 버전
  getDisplayName: (character: IExtendedNpcData) => string;

  // 닉네임 여부 체크
  hasNickname: (character: IExtendedNpcData) => boolean;

  // 별명 편집 가능 여부 확인
  canEditNickname: (characterId: string) => Promise<boolean>;

  // 해당 캐릭터가 userPersonas에 있는지 확인
  isUserPersona: (characterId: string) => Promise<boolean>;

  // 캐릭터 데이터 가져오기
  getCharacterPersona: (characterId: string) => Promise<IPersonaItem | null>;

  // 캐시된 유저 페르소나 데이터
  cachedUserPersonas: IPersonaItem[];

  // 캐시된 페르소나 데이터
  cachedPersonas: IPersonaItem[];

  // 통합된 데이터 (userPersonas 우선)
  allCachedPersonas: IPersonaItem[];

  // 로딩 상태
  isLoading: boolean;
}

export const useNicknameManager = (): UseNicknameManagerResult => {
  const { updatePersona, getPersonaData, fetchPersonasData } = useUserData();
  const { universeId, isCommerceUniverse } = useUniverseData();
  const isLogged = useAuthStore((s) => s.isLogged);

  // 캐시된 userPersonas 상태
  const [cachedUserPersonas, setCachedUserPersonas] = useState<IPersonaItem[]>([]);
  const [cachedPersonas, setCachedPersonas] = useState<IPersonaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 통합된 캐시 데이터 (userPersonas 우선, personas는 보완)
  const allCachedPersonas = useMemo(() => {
    const userPersonaIds = new Set(cachedUserPersonas.map((p) => p.pid));

    // userPersonas가 우선, personas에서 userPersonas에 없는 것만 추가
    const combinedPersonas = [...cachedUserPersonas, ...cachedPersonas.filter((p) => !userPersonaIds.has(p.pid))];

    return combinedPersonas;
  }, [cachedUserPersonas, cachedPersonas]);

  // universeId가 사라질 때 캐시 비우기 — render-time prev 비교로 effect 내부 동기 setState(set-state-in-effect) 회피
  const [prevUniverseId, setPrevUniverseId] = useState(universeId);
  if (prevUniverseId !== universeId) {
    setPrevUniverseId(universeId);
    if (!universeId) {
      setCachedUserPersonas([]);
      setCachedPersonas([]);
    }
  }

  // userPersonas와 personas 데이터 모두 가져오기
  useEffect(() => {
    if (!universeId) return;
    let cancelled = false;

    const loadAllPersonasData = async () => {
      setIsLoading(true);
      try {
        // userPersonas와 personas 병렬 로드
        const [userPersonas, personas] = await Promise.all([
          fetchPersonasData(universeId, "userPersonas"),
          fetchPersonasData(universeId, "personas"),
        ]);
        if (cancelled) return;
        setCachedUserPersonas(userPersonas || []);
        setCachedPersonas(personas || []);

        logger.log("[useNicknameManager] 데이터 로드 완료:", {
          userPersonas: userPersonas?.length || 0,
          personas: personas?.length || 0,
        });
      } catch (error) {
        if (cancelled) return;
        logger.error("personas 데이터 로드 실패:", error);
        setCachedUserPersonas([]);
        setCachedPersonas([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadAllPersonasData();
    return () => {
      cancelled = true;
    };
  }, [universeId, fetchPersonasData]);

  // 별명 저장 함수
  const saveNickname = useCallback(
    async (characterId: string, nickname: string) => {
      if (!characterId || !universeId) {
        toast.error(lang({ ko: "필수 정보가 누락되었습니다.", en: "Required information is missing." }));
        return;
      }

      try {
        // userPersonas에서 현재 페르소나 데이터 가져오기
        const currentPersonaData = await getPersonaData(universeId, characterId, "userPersonas");
        if (!currentPersonaData) {
          toast.error(lang({ ko: "캐릭터 데이터를 찾을 수 없습니다.", en: "Character data not found." }));
          return;
        }

        // 별명만 업데이트된 새로운 페르소나 데이터 생성
        const updatedPersonaData = {
          ...currentPersonaData,
          nickname: nickname.trim() || undefined,
        };

        await updatePersona({
          universe: universeId,
          personaData: updatedPersonaData,
          type: "userPersonas",
        });

        // 로컬 캐시도 업데이트
        setCachedUserPersonas((prev) =>
          prev.map((p) => (p.pid === characterId ? { ...p, nickname: nickname.trim() || undefined } : p)),
        );

        // 별명 변경 이벤트 발생을 게임 스테이지에 알림
        window.dispatchEvent(
          new CustomEvent("nicknameChanged", {
            detail: {
              characterId,
              newNickname: nickname.trim() || undefined,
              universeId,
            },
          }),
        );

        if (nickname.trim()) {
          toast.success(lang({ ko: "별명이 저장되었습니다.", en: "Your nickname has been saved." }));
        } else {
          toast.success(lang({ ko: "별명이 제거되었습니다.", en: "Nickname has been removed." }));
        }
      } catch (error) {
        logger.error("별명 저장 실패:", error);
        toast.error(lang({ ko: "별명 저장에 실패했습니다.", en: "Failed to save nickname." }));
        throw error;
      }
    },
    [updatePersona, getPersonaData, universeId],
  );

  // 캐릭터의 현재 별명 가져오기 (비동기)
  const getNickname = useCallback(
    async (characterId: string): Promise<string | undefined> => {
      if (!universeId || !characterId) return undefined;
      try {
        const personaData = await getPersonaData(universeId, characterId, "userPersonas");
        return personaData?.displayName;
      } catch (error) {
        logger.error("별명 가져오기 실패:", error);
        return undefined;
      }
    },
    [getPersonaData, universeId],
  );

  // 캐릭터의 표시용 이름 가져오기 (동기 - 캐시된 데이터 사용)
  const getDisplayName = useCallback(
    (character: IExtendedNpcData): string => {
      return getUserPersonaDisplayName(character, allCachedPersonas); // allCachedPersonas 사용
    },
    [allCachedPersonas], // 의존성 변경
  );

  // 닉네임 체크
  const hasNickname = useCallback(
    (character: IExtendedNpcData): boolean => {
      return checkHasNickname(character, allCachedPersonas); // allCachedPersonas 사용
    },
    [allCachedPersonas], // 의존성 변경
  );

  // 별명 편집 가능 여부 확인 (비동기)
  const canEditNickname = useCallback(
    async (characterId: string): Promise<boolean> => {
      if (!universeId || !characterId) return false;
      try {
        const personaData = await getPersonaData(universeId, characterId, "userPersonas");
        return !!personaData;
      } catch (error) {
        logger.error("편집 가능 여부 확인 실패:", error);
        return false;
      }
    },
    [getPersonaData, universeId],
  );

  // userPersonas에 있는지 확인 (비동기)
  const isUserPersona = useCallback(
    async (characterId: string): Promise<boolean> => {
      if (!universeId || !characterId) return false;
      try {
        const personaData = await getPersonaData(universeId, characterId, "userPersonas");
        return !!personaData;
      } catch (error) {
        logger.error("userPersona 확인 실패:", error);
        return false;
      }
    },
    [getPersonaData, universeId],
  );

  // 캐릭터 데이터 가져오기 (비동기) - 캐시 우선 검색 추가
  const getCharacterPersona = useCallback(
    async (characterId: string): Promise<IPersonaItem | null> => {
      // 게스트(커머스) 모드에선 유저 전용 페르소나 조회 스킵
      if (!isLogged() && isCommerceUniverse) {
        logger.info("[getCharacterPersona] 게스트 모드: 유저 페르소나 조회 스킵");
        return null; // CharacterChat 쪽에서 null 안전 처리 필요
      }

      try {
        // 1. 먼저 캐시된 데이터에서 동기적으로 찾기 (성능 최적화)
        const cachedPersona = allCachedPersonas.find((p) => p.pid === characterId);
        if (cachedPersona) {
          logger.log(`[getCharacterPersonaData] 캐시에서 찾음: ${characterId}`, cachedPersona);
          return cachedPersona;
        }

        // 2. 캐시에 없으면 API를 통해 userPersonas에서 찾기 (커스터마이징된 데이터 우선)
        let personaData = await getPersonaData(universeId, characterId, "userPersonas");

        if (personaData) {
          logger.log(`[getCharacterPersonaData] API userPersonas에서 찾음: ${characterId}`);
          return personaData;
        }

        // 3. userPersonas에 없으면 API를 통해 personas에서 찾기 (기본 데이터)
        personaData = await getPersonaData(universeId, characterId, "personas");

        if (personaData) {
          logger.log(`[getCharacterPersonaData] API personas에서 찾음: ${characterId}`);
          return personaData;
        }

        logger.warn(`[getCharacterPersonaData] 캐릭터 데이터를 찾을 수 없음: ${characterId}`);
        return null;
      } catch (error) {
        logger.error("캐릭터 페르소나 데이터 가져오기 실패:", error);
        return null;
      }
    },
    [isLogged, isCommerceUniverse, allCachedPersonas, getPersonaData, universeId],
  );

  return {
    saveNickname,
    getNickname,
    getDisplayName,
    hasNickname,
    canEditNickname,
    isUserPersona,
    getCharacterPersona,
    cachedUserPersonas,
    cachedPersonas,
    allCachedPersonas,
    isLoading,
  };
};
