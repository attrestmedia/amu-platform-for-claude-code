"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useGameCharacterStore } from "store/game";
import { useGlobalStore } from "store/global";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { useUniverseData } from "hooks/game/core";
import { Button, Preloader } from "@amu-labs/ui";
import { getSelectablePersonas, getPersonaDetail } from "libs/api/universe";
import { listMySelectableGameCharacters } from "libs/api/game";
import type { IExtendedNpcData } from "types/game";
import { Home, Sparkles } from "lucide-react";
import { CharacterViewMode } from "components/module/game";
import type { ICarouselRef } from "components/module/carousel";
import { Lang, lang } from "components/module/i18n";
import { GAME_CONSTANTS as GC } from "consts/game";
import { logger } from "utils/log";
import { DEFAULT_WORLD_UNIVERSE } from "consts/app";
import { getPlayPath } from "utils/app";
import { isControllablePersona } from "utils/game";

export default function SelectCharacterPage() {
  const router = useRouter();
  const carouselRef = useRef<ICarouselRef>(null);

  const { universeId, universeInfo, isCommerceUniverse } = useUniverseData();
  const { userData, updateSelectedPersona, initializeUserPersonas, checkCharacterAvailable } = useUserData();
  const { user } = useAuthStore();
  const isLoggedIn = useAuthStore((state) => state.isLogged());

  // Zustand 캐릭터 스토어 구독
  const selectedCharacterId = useGameCharacterStore((state) => state.selectedCharacterId);

  // 현재 언어 설정 가져오기
  const currentLanguage = useGlobalStore((state) => state.language);

  const [savedCharacterId, setSavedCharacterId] = useState<string | null>(selectedCharacterId);
  const [isLoading, setIsLoading] = useState(false);

  // 클릭된 캐릭터 ID 관리
  const [clickedCharacterId, setClickedCharacterId] = useState<string | null>(null);

  // 캐릭터 상세 정보 모달 상태
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailCharacter, setSelectedDetailCharacter] = useState<IExtendedNpcData | null>(null);

  // 페르소나 데이터 가져오기
  // commerce 타입인 경우 `DEFAULT_WORLD_UNIVERSE` 유니버스의 캐릭터 사용
  const targetUniverseId = isCommerceUniverse ? DEFAULT_WORLD_UNIVERSE : universeId;

  // 서버 랜덤 10개만 가져오기
  const owned = useMemo(
    () => (userData?.userPersonas?.[universeId] || []).map((p) => p.pid),
    [userData?.userPersonas, universeId],
  );

  const {
    data: personas,
    isLoading: isPersonasLoading,
    error,
  } = useQuery<IExtendedNpcData[]>({
    queryKey: ["selectablePersonas", targetUniverseId, owned.join(","), GC.INIT_MAX_CHARACTERS],
    queryFn: () =>
      getSelectablePersonas({
        collection: targetUniverseId!,
        limit: GC.INIT_MAX_CHARACTERS,
        ownedPids: owned, // 보유 우선
      }),
    enabled: !!universeId && !!universeInfo?.data,
    staleTime: 1000 * 60 * 5, // 캐시 5분 (무한대보단 적당히)
    refetchOnWindowFocus: false,
  });

  const {
    data: myGameCharacters,
    isLoading: isMyGameCharactersLoading,
    error: myGameCharactersError,
  } = useQuery({
    queryKey: ["my-selectable-game-characters", universeId],
    queryFn: () =>
      listMySelectableGameCharacters({
        universeId,
        limit: 20,
      }),
    enabled: isLoggedIn && Boolean(universeId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const myGamePersonas = useMemo(
    () => (myGameCharacters || []).map((item) => item.persona).filter(isControllablePersona),
    [myGameCharacters],
  );

  // 사용자가 선택할 수 있는 캐릭터 필터링
  const selectableSystemPersonas = useMemo(() => {
    if (!personas?.length) return [];
    const controllablePersonas = personas.filter(isControllablePersona);
    if (!isLoggedIn) return controllablePersonas;

    const existingUserPersonas = userData?.userPersonas?.[universeId];
    if (!existingUserPersonas || existingUserPersonas.length === 0) return controllablePersonas;

    return controllablePersonas.filter((persona) => checkCharacterAvailable(universeId, persona.pid));
  }, [personas, isLoggedIn, userData, universeId, checkCharacterAvailable]);
  const selectablePersonas = useMemo(() => {
    const seen = new Set<string>();
    return [...myGamePersonas, ...selectableSystemPersonas].filter((persona) => {
      const pid = String(persona.pid || "").trim();
      if (!pid || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    });
  }, [myGamePersonas, selectableSystemPersonas]);

  // 선택된 캐릭터 확인 (초기에 이미 선택한 캐릭터가 있는지 확인)
  useEffect(
    function loadSavedCharacterFromUserData() {
      if (isLoggedIn && user?.id && userData && userData.selectedPersonas) {
        // 외부 사용자 데이터에서 저장된 캐릭터를 selectedPid에 동기화
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSavedCharacterId(userData.selectedPersonas?.[universeId]);
      }
    },
    [isLoggedIn, user, universeId, userData],
  );

  // 캐릭터 선택 핸들러
  const handleCharacterSelect = async (characterId: string) => {
    if (savedCharacterId === characterId) return;

    setClickedCharacterId(characterId);

    // 리스트에서 최소 데이터 우선 적용 (빠른 모달 오픈)
    const base: IExtendedNpcData | null = selectablePersonas.find((character) => character.pid === characterId) ?? null;
    setSelectedDetailCharacter(base);
    setDetailModalOpen(true);
    if (base?.extra?.userGenerated === true) return;

    // 세부 정보 필요 시 지연 로드 (배경/성격 등)
    try {
      const full = await getPersonaDetail(targetUniverseId!, characterId);
      if (full) setSelectedDetailCharacter(full);
    } catch (err) {
      logger.warn("상세 데이터 로드 실패(무시):", err);
    }
  };

  // 캐릭터 선택 확인 핸들러
  const handleConfirm = async (characterId: string) => {
    const selectableCharacter = selectablePersonas.find((persona) => persona.pid === characterId);
    if (!characterId || !isControllablePersona(selectableCharacter)) return;
    setIsLoading(true);

    try {
      // 인증된 유저는 Mongodb에 캐릭터 저장
      if (isLoggedIn && universeId) {
        // 선택된 캐릭터 데이터 찾기
        let selectedCharacterData = selectablePersonas.find((persona) => persona.pid === characterId) || null;
        if (!selectedCharacterData?.extra?.userGenerated) {
          selectedCharacterData = await getPersonaDetail(targetUniverseId!, characterId);
        }
        if (!selectedCharacterData) {
          selectedCharacterData = selectablePersonas.find((persona) => persona.pid === characterId) || null;
        }

        if (selectedCharacterData) {
          await initializeUserPersonas(universeId, [selectedCharacterData]);
        }

        // selectedPersona 업데이트
        await updateSelectedPersona(universeId, characterId);
        // 완전한 업데이트 진행을 위한 딜레이 적용
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else if (universeId) {
        // 인증되지 않은 사용자는 로컬 스토리지에 임시 저장
        localStorage.setItem(`universe_${universeId}_character`, characterId);
      }

      // 유니버스 페이지로 이동
      router.push(getPlayPath(universeId));
    } catch (error) {
      logger.error("캐릭터 저장 중 오류 발생:", error);
      setIsLoading(false);
    }
  };

  // 메인 화면으로 돌아가기
  const handleGoHome = () => {
    router.push("/");
  };

  // 게임 화면으로 돌아가기
  const handleGoToUniverse = () => {
    router.push("/play");
  };

  if (universeInfo?.data?.enabled === false) {
    return (
      <div className="container mx-auto flex h-full flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold">
          <Lang text={{ ko: "아직 입장할 수 없는 유니버스입니다.", en: "This universe is not open yet." }} />
        </h1>
        <p className="mt-2 text-secondary-text">
          <Lang
            text={{
              ko: "정식 출시가 준비되면 캐릭터를 선택할 수 있습니다.",
              en: "Character selection will open when the universe is ready.",
            }}
          />
        </p>
        <Button className="mt-5" onClick={handleGoToUniverse}>
          <Lang text={{ ko: "AMU Play로 돌아가기", en: "Back to AMU Play" }} />
        </Button>
      </div>
    );
  }

  if (isPersonasLoading || isMyGameCharactersLoading || isLoading) {
    return (
      <Preloader
        variant="spin"
        size="lg"
        container
        fullScreen
        text={
          isLoading
            ? lang({ ko: "캐릭터를 저장 중입니다...", en: "Saving character..." })
            : lang({ ko: "캐릭터 정보를 가져오는 중입니다...", en: "Retrieving character information..." })
        }
      />
    );
  }

  if (error || myGameCharactersError) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-red-500 p-4">
          <Lang
            text={{
              ko: "캐릭터 정보를 가져오는 중 오류가 발생했습니다",
              en: "An error occurred while retrieving character information",
            }}
          />
          : {((error || myGameCharactersError) as Error)?.message || "Unknown error"}
        </div>
        <Button onClick={handleGoToUniverse}>
          <Lang text={{ ko: "돌아가기", en: "Go back" }} />
        </Button>
      </div>
    );
  }

  // 표시할 페르소나가 없는 경우
  if (!selectablePersonas || selectablePersonas.length === 0) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center h-full">
        <p className="mb-4 text-center">
          <Lang
            text={{
              ko: (
                <span>
                  선택할 수 있는 캐릭터가 없습니다.
                  <br />
                  잠시만 기다려 주세요.
                </span>
              ),
              en: (
                <span>
                  No characters available for selection.
                  <br />
                  Please wait.
                </span>
              ),
            }}
          />
        </p>
        <Button onClick={handleGoToUniverse}>
          <Lang text={{ ko: "돌아가기", en: "Go back" }} />
        </Button>
      </div>
    );
  }

  const activedId =
    clickedCharacterId ||
    (savedCharacterId && selectablePersonas.some((persona) => persona.pid === savedCharacterId)
      ? savedCharacterId
      : null);

  return (
    <div className="character-select w-full h-full flex flex-col overflow-hidden">
      <div className="character-select-header">
        <h1 className="sr-only">
          <Lang text={{ ko: "캐릭터 선택", en: "Character selection" }} />
        </h1>
        <p className="text-2xl text-center my-8">
          {currentLanguage === "ko" ? (
            <>
              <strong className="text-gradient-purple-blue">{universeId.toUpperCase()}</strong> 유니버스를 여행 할
              <br />
              <strong className="text-gradient-purple-blue">캐릭터</strong>를 선택해 주세요.
            </>
          ) : (
            <>
              Please choose a <strong className="text-gradient-purple-blue">character</strong>
              <br />
              to travel <strong className="text-gradient-purple-blue">{universeId.toUpperCase()}</strong> universe.
            </>
          )}
        </p>
      </div>

      <CharacterViewMode
        personas={selectablePersonas || []}
        clickedCharacterId={clickedCharacterId}
        savedCharacterId={savedCharacterId}
        handleCharacterSelect={handleCharacterSelect}
        handleConfirm={handleConfirm}
        detailModalOpen={detailModalOpen}
        setDetailModalOpen={setDetailModalOpen}
        selectedDetailCharacter={selectedDetailCharacter}
        carouselRef={carouselRef}
        showViewModeToggle={false}
        showSelectButton={true}
        assetUniverseId={targetUniverseId}
        availabilityMode="all"
        showCardSelectIndicator={false}
        cardActionRenderer={(character) =>
          character.extra?.userGenerated === true ? (
            <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
              <Lang text={{ ko: "내 캐릭터", en: "My character" }} />
            </span>
          ) : null
        }
      />

      <div className="flex justify-center gap-2 pt-4 pb-8">
        {isLoggedIn ? (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => router.push(`/play/${encodeURIComponent(universeId)}/character-studio`)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <Lang text={{ ko: "내 캐릭터 만들기", en: "Create my character" }} />
          </Button>
        ) : null}
        <Button
          onClick={() => activedId && handleConfirm(activedId)}
          disabled={!activedId}
          className={`min-h-11 ${!activedId ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Lang text={{ ko: "선택하기", en: "Select" }} />
        </Button>
        <Button
          variant="secondary"
          className="min-h-11 min-w-11"
          title={lang({ ko: "홈으로", en: "Home" })}
          onClick={handleGoHome}
        >
          <Home />
        </Button>
      </div>
    </div>
  );
}
