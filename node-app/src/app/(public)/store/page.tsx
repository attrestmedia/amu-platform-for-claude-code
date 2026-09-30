"use client";

import { useRouter } from "next/navigation";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ListSection, SiteFooter, TopBar } from "components/module/layout";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { usePublicUniverseList } from "hooks/app/usePublicUniverseList";
import { getLocalizedUniverseDescription, getStorePath } from "utils/app";
import { PAGE_LAYOUT_CLASS } from "utils/theme";

export default function StoreHubPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isAdministrator } = useUserData();
  const { commerceUniverses, isLoading, error } = usePublicUniverseList();

  return (
    <div className={PAGE_LAYOUT_CLASS}>
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={isLoggedIn && Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.push("/store")}
        logoutRedirectPage="/store"
      >
        <span className="text-base font-medium sm:text-lg">
          <Lang text={{ ko: "Store", en: "Store" }} />
        </span>
      </TopBar>

      <main className="mx-auto flex w-full max-w-[72rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-surface">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_20rem]">
            <div className="bg-[linear-gradient(135deg,rgba(26,28,34,0.96),rgba(78,49,31,0.9))] px-6 py-8 text-white sm:px-8 sm:py-10">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/65">Commerce Surface</p>
              <h1 className="mt-3 max-w-[34rem] text-3xl font-semibold leading-tight sm:text-4xl">
                <Lang
                  text={{
                    ko: "브랜드 스토어를 둘러보고, 필요할 때 쇼룸으로 깊게 들어가세요.",
                    en: "Browse brand stores first, then step into their showrooms when needed.",
                  }}
                />
              </h1>
              <p className="mt-4 max-w-[36rem] text-sm leading-6 text-white/72 sm:text-base">
                <Lang
                  text={{
                    ko: "새로운 `/store`는 상품 탐색과 운영 액션 중심의 홈입니다. 기존 `/play` 커머스 유니버스는 브랜드 쇼룸과 이벤트 공간으로 계속 유지됩니다.",
                    en: "The new `/store` is a commerce-first home for browsing and operations, while legacy `/play` commerce universes remain as showrooms and event spaces.",
                  }}
                />
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => router.push("/play")}>
                  <Lang text={{ ko: "플레이 허브", en: "Play Hub" }} />
                </Button>
                <Button variant="outline" onClick={() => router.push("/")}>
                  <Lang text={{ ko: "플랫폼 홈", en: "Platform Home" }} />
                </Button>
              </div>
            </div>
            <div className="flex flex-col justify-end gap-5 bg-[radial-gradient(circle_at_top,rgba(239,187,121,0.24),transparent_58%),linear-gradient(180deg,rgba(248,241,232,0.86),rgba(241,232,220,0.98))] px-6 py-8 text-[#392415] sm:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8b5d3a]">
                  <Lang text={{ ko: "Store Rules", en: "Store Rules" }} />
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[#6c4a32]">
                  <li>
                    <Lang
                      text={{
                        ko: "첫 화면은 썸네일 중심으로 빠르게 탐색합니다.",
                        en: "The first fold prioritizes thumbnail-first browsing.",
                      }}
                    />
                  </li>
                  <li>
                    <Lang
                      text={{
                        ko: "AI 액션은 Gen Studio와 Tutors로 연결합니다.",
                        en: "AI actions connect through Gen Studio and Tutors.",
                      }}
                    />
                  </li>
                  <li>
                    <Lang
                      text={{
                        ko: "브랜드 체험은 `/play` 쇼룸에서 이어집니다.",
                        en: "Brand experiences continue inside the `/play` showroom.",
                      }}
                    />
                  </li>
                </ul>
              </div>
              <div className="rounded-[1.5rem] border border-[#cfa981] bg-white/60 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b5d3a]">
                  <Lang text={{ ko: "Active Stores", en: "Active Stores" }} />
                </p>
                <p className="mt-2 text-3xl font-semibold text-[#2d1c10]">{commerceUniverses.length}</p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {isLoading ? (
          <div className="rounded-3xl border border-border bg-surface p-6 text-sm text-secondary-text">
            <Lang text={{ ko: "스토어 목록을 불러오는 중입니다.", en: "Loading store universes." }} />
          </div>
        ) : (
          <ListSection
            title={lang({ ko: "운영 중인 스토어", en: "Stores in Service" })}
            items={commerceUniverses}
            variant="Biz"
            onSelect={(universeId) => {
              const target = commerceUniverses.find((universe) => universe.id === universeId);
              router.push(getStorePath(universeId, { universe: target || undefined }));
            }}
            renderDescription={getLocalizedUniverseDescription}
          />
        )}
      </main>

      <SiteFooter layout="wide" />
    </div>
  );
}
