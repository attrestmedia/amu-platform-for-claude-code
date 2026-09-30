"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ListSection, SiteFooter, TopBar } from "components/module/layout";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { usePublicUniverseList } from "hooks/app/usePublicUniverseList";
import {
  getLocalizedUniverseDescription,
  getPlayPath,
  getPlaySelectCharacterPath,
} from "utils/app";
import { PAGE_LAYOUT_CLASS } from "utils/theme";
import { trackPlayEvent, trackPlayLandingVisit } from "utils/analytics/play";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app";
import { ImagePlus } from "lucide-react";

export default function PlayHubPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isAdministrator } = useUserData();
  const { gameUniverses, isLoading, error } = usePublicUniverseList();
  const firstPlayableUniverse =
    gameUniverses.find((universe) => universe.id === DEFAULT_PLAY_UNIVERSE && universe.enabled) ||
    gameUniverses.find((universe) => universe.enabled);

  useEffect(() => {
    trackPlayLandingVisit();
  }, []);

  return (
    <div className={PAGE_LAYOUT_CLASS}>
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={isLoggedIn && Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.push("/play")}
        logoutRedirectPage="/play"
      >
        <span className="text-base font-medium sm:text-lg">
          <Lang text={{ ko: "Play", en: "Play" }} />
        </span>
      </TopBar>

      <main className="mx-auto flex w-full max-w-[72rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative isolate -mx-4 min-h-[30rem] overflow-hidden sm:-mx-6 sm:min-h-[34rem] lg:-mx-8">
          {firstPlayableUniverse?.thumbnail ? (
            <Image
              src={firstPlayableUniverse.thumbnail}
              alt={firstPlayableUniverse.name}
              fill
              priority
              unoptimized
              sizes="(max-width: 768px) 100vw, 72rem"
              className="object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/55 to-black/10" aria-hidden />
          <div className="relative flex min-h-[30rem] max-w-[42rem] flex-col justify-center px-6 py-12 text-white sm:min-h-[34rem] sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/80">AMU Play</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              <Lang
                text={{
                  ko: "내 캐릭터로 걷고, 새로운 친구와 이야기하세요.",
                  en: "Walk as your character and meet someone new.",
                }}
              />
            </h1>
            <p className="mt-4 max-w-[34rem] text-base leading-7 text-white/82 sm:text-lg">
              <Lang
                text={{
                  ko: "캐릭터를 준비하면 첫 월드와 NPC 대화까지 세 단계로 안내해 드립니다.",
                  en: "Prepare a character and follow three simple steps into your first NPC conversation.",
                }}
              />
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="min-h-11"
                disabled={!firstPlayableUniverse}
                onClick={() => {
                  if (!firstPlayableUniverse) return;
                  trackPlayEvent("start_click", { universeId: firstPlayableUniverse.id });
                  router.push(getPlaySelectCharacterPath(firstPlayableUniverse.id));
                }}
              >
                <Lang text={{ ko: "캐릭터로 시작하기", en: "Start with a character" }} />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="min-h-11 border-white/60 bg-black/20 text-white hover:bg-white/15"
                onClick={() => router.push("/assets-studio")}
              >
                <ImagePlus className="mr-2 size-4" aria-hidden />
                <Lang text={{ ko: "에셋 스튜디오", en: "Assets Studio" }} />
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="play-first-adventure" className="px-1 py-2 sm:px-4">
          <h2 id="play-first-adventure" className="text-2xl font-semibold">
            <Lang text={{ ko: "첫 모험은 세 단계면 충분해요", en: "Your first adventure takes three steps" }} />
          </h2>
          <ol className="mt-5 grid gap-5 sm:grid-cols-3">
            {[
              {
                ko: "캐릭터 만들기",
                en: "Create a character",
                bodyKo: "내 이미지 캐릭터를 만들거나 준비된 캐릭터를 선택하세요.",
                bodyEn: "Create your own image character or choose one that is ready.",
              },
              {
                ko: "걸어보기",
                en: "Take a walk",
                bodyKo: "조이패드로 월드를 움직이며 주변을 둘러보세요.",
                bodyEn: "Use the joypad to move around and explore the world.",
              },
              {
                ko: "말 걸기",
                en: "Start talking",
                bodyKo: "NPC에게 다가가 대화를 시작하고 첫 친밀도를 쌓으세요.",
                bodyEn: "Approach an NPC, start a chat, and build your first intimacy.",
              },
            ].map((step, index) => (
              <li key={step.en} className="border-l-2 border-primary/35 pl-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                  Step {index + 1}
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  <Lang text={{ ko: step.ko, en: step.en }} />
                </h3>
                <p className="mt-2 text-sm leading-6 text-secondary-text">
                  <Lang text={{ ko: step.bodyKo, en: step.bodyEn }} />
                </p>
              </li>
            ))}
          </ol>
        </section>

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {isLoading ? (
          <div className="rounded-3xl border border-border bg-surface p-6 text-sm text-secondary-text">
            <Lang text={{ ko: "플레이 월드를 불러오는 중입니다.", en: "Loading playable worlds." }} />
          </div>
        ) : (
          <ListSection
            title={lang({ ko: "플레이 가능한 세계관", en: "Playable Worlds" })}
            items={gameUniverses}
            variant="Game"
            onSelect={(universeId) => router.push(getPlayPath(universeId))}
            renderDescription={getLocalizedUniverseDescription}
          />
        )}
      </main>

      <SiteFooter layout="wide" />
    </div>
  );
}
